import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const normaliseType = (t) => {
  const lower = (t || '').toLowerCase().trim();
  if (lower.startsWith('botanical')) return 'botanical';
  if (lower === 'ethanol') return 'ethanol';
  if (lower === 'packaging') return 'packaging';
  if (lower === 'grain') return 'grain';
  if (lower === 'sugar') return 'sugar';
  if (lower === 'water') return 'water';
  if (lower === 'flavoring' || lower === 'flavouring') return 'flavoring';
  return 'other';
};

/**
 * Shared hook that computes net raw material stock (after consumption deductions)
 * using the same logic as the Inventory page.
 * Returns: { rawMaterialsWithNetStock, rawMaterialsBase, receivingOnlyItems, loading }
 */
export function useRawMaterialsNetStock() {
  const { data: rawMaterials = [], isLoading } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 200),
  });

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 500),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 200),
  });

  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 500),
  });

  const { data: allReceivings = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 2000),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 100),
  });

  const data = useMemo(() => {
    // Ethanol consumed by lot code in distillation
    const ethanolConsumedByLotCode = distillationRuns
      .filter(r => r.input_volume)
      .reduce((acc, r) => {
        const lot = (r.ethanol_lot_code || '').toLowerCase();
        acc[lot] = (acc[lot] || 0) + (r.input_volume || 0);
        return acc;
      }, {});

    // Dilution runs that consume raw ethanol directly
    const rawEthanolConsumedInDilutions = dilutions
      .filter(d => d.input_abv !== 79 && d.input_ethanol_volume)
      .reduce((s, d) => s + (d.input_ethanol_volume || 0), 0);

    // Recipe-driven botanical deductions
    const spiritRecipes = recipes.filter(r => r.recipe_type === 'spirit');
    const botanicalConsumedByName = {};
    spiritRecipes.forEach(recipe => {
      if (!recipe.ingredients?.length) return;
      const baseVol = recipe.base_ethanol_volume || 300;
      const baseAbv = recipe.base_ethanol_abv || 55;
      const baseLals = baseVol * baseAbv / 100;
      const matchingRuns = distillationRuns.filter(r =>
        r.input_volume &&
        (r.product_name || '').toLowerCase().trim() === (recipe.name || '').toLowerCase().trim()
      );
      matchingRuns.forEach(run => {
        const runLals = run.input_lals || (run.input_volume * (run.input_abv || baseAbv) / 100);
        const scale = baseLals > 0 ? runLals / baseLals : 1;
        recipe.ingredients.forEach(ing => {
          const key = (ing.name || '').toLowerCase().trim();
          if (!key) return;
          botanicalConsumedByName[key] = (botanicalConsumedByName[key] || 0) + (ing.quantity || 0) * scale;
        });
      });
    });

    // Recipe-driven packaging deductions
    const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');
    const packagingConsumedByName = {};
    packagingRecipes.forEach(recipe => {
      if (!recipe.packaging?.length) return;
      const recipeName = (recipe.name || '').toLowerCase();
      const sizeMatch = recipeName.match(/(\d+)\s*ml/);
      const recipeSizeMl = sizeMatch ? parseInt(sizeMatch[1]) : null;
      let matchingBottles = 0;
      if (recipeSizeMl) {
        matchingBottles = bottlingRuns
          .filter(r => r.bottle_size_ml === recipeSizeMl)
          .reduce((s, r) => s + (r.bottles_produced || 0), 0);
      } else {
        matchingBottles = bottlingRuns
          .filter(r => (r.product_name || '').toLowerCase().trim() === recipeName)
          .reduce((s, r) => s + (r.bottles_produced || 0), 0);
      }
      if (matchingBottles === 0) return;
      recipe.packaging.forEach(pkg => {
        const key = (pkg.name || '').toLowerCase().trim();
        if (!key) return;
        packagingConsumedByName[key] = (packagingConsumedByName[key] || 0) + (pkg.quantity || 1) * matchingBottles;
      });
    });

    // Aggregate received quantities per material name
    const receivedByName = allReceivings.reduce((acc, r) => {
      const key = (r.material_name || '').toLowerCase().trim();
      if (!acc[key]) acc[key] = {
        quantity: 0,
        lals: 0,
        unit: r.unit,
        type: normaliseType(r.material_type),
        abv_percent: r.abv_percent,
      };
      acc[key].quantity += r.quantity || 0;
      acc[key].lals += r.lals || 0;
      return acc;
    }, {});

    // Receiving-only items (not in RawMaterial entity)
    const rawMaterialNames = rawMaterials.map(m => (m.name || '').toLowerCase().trim());
    const receivingOnlyItems = Object.keys(receivedByName)
      .filter(k => !rawMaterialNames.includes(k))
      .map(k => {
        const sample = allReceivings.find(r => (r.material_name || '').toLowerCase().trim() === k);
        return {
          id: 'recv-' + k,
          name: sample?.material_name || k,
          type: receivedByName[k].type || 'other',
          quantity: receivedByName[k].quantity,
          lals: receivedByName[k].lals,
          unit: receivedByName[k].unit || 'units',
          abv_percent: receivedByName[k].abv_percent,
          supplier: sample?.supplier_name || '',
          batch_number: sample?.batch_number || '',
          _fromReceiving: true,
        };
      });

    const allRawMaterials = [...rawMaterials, ...receivingOnlyItems];

    // Apply net stock deductions
    const rawMaterialsWithNetStock = allRawMaterials.map(m => {
      const nameKey = (m.name || '').toLowerCase().trim();
      const received = receivedByName[nameKey];
      const isReceivingOnly = String(m.id || '').startsWith('recv-');
      let netQty = isReceivingOnly ? (received?.quantity || 0) : (m.quantity || 0);
      let netLals = isReceivingOnly ? (received?.lals || 0) : (m.lals || 0);
      const nameLower = m.name?.toLowerCase() || '';
      const effectiveType = (received?.type) || normaliseType(m.type);
      let consumedQty = 0;

      if (effectiveType === 'ethanol') {
        const isLactonol = nameLower.includes('lactonol');
        const isEna = nameLower.includes('extra neutral') || nameLower.includes('ena');
        if (isLactonol) {
          consumedQty += (ethanolConsumedByLotCode['eth-lactonol'] || 0) + (ethanolConsumedByLotCode['lactonol'] || 0);
          consumedQty += rawEthanolConsumedInDilutions;
        } else if (isEna) {
          consumedQty += (ethanolConsumedByLotCode['eth-ena'] || 0) + (ethanolConsumedByLotCode['ena'] || 0);
        } else {
          const matched = ['eth-lactonol', 'lactonol', 'eth-ena', 'ena'];
          consumedQty += Object.entries(ethanolConsumedByLotCode)
            .filter(([k]) => !matched.includes(k))
            .reduce((s, [, v]) => s + v, 0);
        }
        netLals = Math.max(0, netLals - (consumedQty * (m.abv_percent || 0) / 100));
        netQty = Math.max(0, netQty - consumedQty);
      }

      if (effectiveType === 'botanical') {
        const exactConsumed = botanicalConsumedByName[nameLower];
        if (exactConsumed !== undefined) {
          consumedQty = exactConsumed;
          netQty = Math.max(0, netQty - exactConsumed);
        } else {
          const partialKey = Object.keys(botanicalConsumedByName)
            .find(k => nameLower.includes(k.toLowerCase()) || k.toLowerCase().includes(nameLower));
          if (partialKey) {
            consumedQty = botanicalConsumedByName[partialKey];
            netQty = Math.max(0, netQty - consumedQty);
          }
        }
      }

      if (effectiveType === 'packaging') {
        const exactConsumed = packagingConsumedByName[nameLower];
        if (exactConsumed !== undefined) {
          consumedQty = exactConsumed;
          netQty = Math.max(0, netQty - exactConsumed);
        } else {
          const partialKey = Object.keys(packagingConsumedByName)
            .find(k => nameLower.includes(k.toLowerCase()) || k.toLowerCase().includes(nameLower));
          if (partialKey) {
            consumedQty = packagingConsumedByName[partialKey];
            netQty = Math.max(0, netQty - consumedQty);
          }
        }
      }

      netLals = m.abv_percent && (m.type === 'ethanol' || effectiveType === 'ethanol')
        ? parseFloat((netQty * m.abv_percent / 100).toFixed(3))
        : netLals;

      return { ...m, quantity: parseFloat(netQty.toFixed(2)), lals: netLals, _consumed: consumedQty };
    });

    const totalBottlesBottled700 = bottlingRuns
      .filter(r => r.bottle_size_ml === 700)
      .reduce((s, r) => s + (r.bottles_produced || 0), 0);
    const totalBottlesBottled200 = bottlingRuns
      .filter(r => r.bottle_size_ml === 200)
      .reduce((s, r) => s + (r.bottles_produced || 0), 0);

    return {
      rawMaterialsWithNetStock,
      rawMaterialsBase: rawMaterials,
      receivingOnlyItems,
      spiritRecipes,
      packagingRecipes,
      botanicalConsumedByName,
      packagingConsumedByName,
      receivedByName,
      totalBottlesBottled700,
      totalBottlesBottled200,
    };
  }, [rawMaterials, distillationRuns, bottlingRuns, dilutions, allReceivings, recipes]);

  return { ...data, isLoading };
}