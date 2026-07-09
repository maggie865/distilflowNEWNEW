import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Wine, Droplets, Boxes, DollarSign } from 'lucide-react';

function StatCard({ label, value, sub, color = 'text-primary', bg = 'bg-accent border-accent-foreground/10', icon }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
      <div className="flex items-center gap-2">
        {icon && <span className={color}>{icon}</span>}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const COGS_COLORS = ['#8B5CF6', '#F97316', '#06B6D4', '#10B981', '#3B82F6', '#F59E0B'];

export default function CostOfGoodsReport({ rawMaterialsNetStock, rawMaterials, finishedGoodsWithStock, tanks, recipes }) {
  const avgEthanolCostPerLal = useMemo(() => {
    const ethanolMats = rawMaterialsNetStock.filter(m => m.type === 'ethanol' && m.cost_per_unit);
    if (ethanolMats.length === 0) return 3.5;
    const totalLals = ethanolMats.reduce((s, m) => s + (m.quantity || 0) * (m.abv_percent || 0) / 100, 0);
    const totalCost = ethanolMats.reduce((s, m) => s + (m.quantity || 0) * (m.cost_per_unit || 0), 0);
    return totalLals > 0 ? totalCost / totalLals : ethanolMats.reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0);
  }, [rawMaterialsNetStock]);

  const materialCostLookup = useMemo(() => {
    const lookup = {};
    for (const m of rawMaterialsNetStock) {
      if (m.cost_per_unit) {
        lookup[m.name?.toLowerCase().trim()] = m.cost_per_unit;
      }
    }
    return lookup;
  }, [rawMaterialsNetStock]);

  const findCostPerUnit = (name) => {
    if (!name) return 0;
    const lower = name.toLowerCase().trim();
    if (materialCostLookup[lower]) return materialCostLookup[lower];
    for (const [key, cost] of Object.entries(materialCostLookup)) {
      if (key.includes(lower) || lower.includes(key)) return cost;
    }
    return 0;
  };

  const finishedGoodsCosts = useMemo(() => {
    return finishedGoodsWithStock
      .filter(fg => fg.quantity_bottles > 0)
      .map(fg => {
        const recipe = recipes?.find(r =>
          r.name === fg.product_name ||
          fg.product_name?.toLowerCase().includes(r.name?.toLowerCase()) ||
          r.name?.toLowerCase().includes(fg.product_name?.toLowerCase())
        );

        let ethanolCost = 0;
        let botanicalCost = 0;
        let packagingCost = 0;
        const method = recipe && recipe.base_ethanol_volume ? 'recipe' : 'lals_only';

        if (recipe && recipe.base_ethanol_volume) {
          const inputLals = recipe.base_ethanol_volume * (recipe.base_ethanol_abv || 96) / 100;
          const bottleLals = (fg.bottle_size_ml || 700) / 1000 * (recipe.target_output_abv || 42) / 100;
          const bottlesFromRecipe = bottleLals > 0 ? inputLals / bottleLals : 1;

          const ethanolPerBottle = (inputLals * avgEthanolCostPerLal) / bottlesFromRecipe;
          ethanolCost = ethanolPerBottle * (fg.quantity_bottles || 0);

          let botanicalPerBottle = 0;
          if (recipe.ingredients) {
            for (const ing of recipe.ingredients) {
              const cpu = findCostPerUnit(ing.name);
              if (cpu) botanicalPerBottle += (ing.quantity * cpu) / bottlesFromRecipe;
            }
          }
          botanicalCost = botanicalPerBottle * (fg.quantity_bottles || 0);

          let packagingPerBottle = 0;
          if (recipe.packaging) {
            for (const pkg of recipe.packaging) {
              const cpu = findCostPerUnit(pkg.name);
              if (cpu) packagingPerBottle += (pkg.quantity * cpu);
            }
          }
          packagingCost = packagingPerBottle * (fg.quantity_bottles || 0);
        } else {
          ethanolCost = (fg.total_lals || 0) * avgEthanolCostPerLal;
        }

        const totalCost = ethanolCost + botanicalCost + packagingCost;
        const costPerBottle = (fg.quantity_bottles || 0) > 0 ? totalCost / fg.quantity_bottles : 0;

        return {
          ...fg,
          ethanolCost, botanicalCost, packagingCost, totalCost, costPerBottle, method,
          recipeUsed: recipe?.name || null,
        };
      });
  }, [finishedGoodsWithStock, recipes, avgEthanolCostPerLal, findCostPerUnit]);

  const totalFinishedGoodsCost = finishedGoodsCosts.reduce((s, f) => s + f.totalCost, 0);
  const totalFinishedEthanolCost = finishedGoodsCosts.reduce((s, f) => s + f.ethanolCost, 0);
  const totalFinishedBotanicalCost = finishedGoodsCosts.reduce((s, f) => s + f.botanicalCost, 0);
  const totalFinishedPackagingCost = finishedGoodsCosts.reduce((s, f) => s + f.packagingCost, 0);

  // Botanical cost per litre of output spirit, by product name
  const botanicalCostPerLitreByProduct = useMemo(() => {
    const lookup = {};
    const spiritRecipes = (recipes || []).filter(r => r.recipe_type === 'spirit');
    spiritRecipes.forEach(recipe => {
      if (!recipe.ingredients?.length) return;
      const baseVol = recipe.base_ethanol_volume || 300;
      const yieldPct = recipe.expected_yield_percent || 85;
      const outputVol = baseVol * yieldPct / 100;
      let totalBotanicalCost = 0;
      recipe.ingredients.forEach(ing => {
        const cpu = findCostPerUnit(ing.name);
        if (cpu) totalBotanicalCost += (ing.quantity || 0) * cpu;
      });
      if (outputVol > 0) {
        lookup[(recipe.name || '').toLowerCase().trim()] = totalBotanicalCost / outputVol;
      }
    });
    return lookup;
  }, [recipes, findCostPerUnit]);

  const findBotanicalCostPerLitre = (productName) => {
    if (!productName) return 0;
    const lower = productName.toLowerCase().trim();
    if (botanicalCostPerLitreByProduct[lower]) return botanicalCostPerLitreByProduct[lower];
    for (const [key, cost] of Object.entries(botanicalCostPerLitreByProduct)) {
      if (key.includes(lower) || lower.includes(key)) return cost;
    }
    return 0;
  };

  const tankStockCosts = useMemo(() => {
    return tanks
      .filter(t => t.current_volume > 0 && t.status !== 'empty')
      .map(t => {
        const lals = (t.current_volume || 0) * (t.current_abv || 0) / 100;
        const ethanolCost = lals * avgEthanolCostPerLal;
        const botanicalPerLitre = findBotanicalCostPerLitre(t.current_product);
        const botanicalCost = (t.current_volume || 0) * botanicalPerLitre;
        const cost = ethanolCost + botanicalCost;
        return { ...t, lals, ethanolCost, botanicalCost, cost };
      });
  }, [tanks, avgEthanolCostPerLal, findBotanicalCostPerLitre]);

  const totalTankCost = tankStockCosts.reduce((s, t) => s + t.cost, 0);
  const totalTankEthanolCost = tankStockCosts.reduce((s, t) => s + t.ethanolCost, 0);
  const totalTankBotanicalCost = tankStockCosts.reduce((s, t) => s + t.botanicalCost, 0);

  const unusedEthanolCosts = rawMaterialsNetStock
    .filter(m => m.type === 'ethanol' && (m.lals || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.lals || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedEthanol = unusedEthanolCosts.reduce((s, m) => s + m.totalCost, 0);

  const unusedBotanicalCosts = rawMaterialsNetStock
    .filter(m => m.type === 'botanical' && (m.quantity || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.quantity || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedBotanicals = unusedBotanicalCosts.reduce((s, m) => s + m.totalCost, 0);

  const unusedPackagingCosts = rawMaterialsNetStock
    .filter(m => m.type === 'packaging' && (m.quantity || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.quantity || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedPackaging = unusedPackagingCosts.reduce((s, m) => s + m.totalCost, 0);

  const totalUnusedGoods = totalUnusedEthanol + totalUnusedBotanicals + totalUnusedPackaging;
  const totalCogsValue = totalFinishedGoodsCost + totalTankCost + totalUnusedGoods;

  const cogBreakdown = [
    { name: 'Finished Goods', value: parseFloat(totalFinishedGoodsCost.toFixed(2)), items: finishedGoodsCosts.length },
    { name: 'Tank Stock', value: parseFloat(totalTankCost.toFixed(2)), items: tankStockCosts.length },
    { name: 'Unused Ethanol', value: parseFloat(totalUnusedEthanol.toFixed(2)), items: unusedEthanolCosts.length },
    { name: 'Unused Botanicals', value: parseFloat(totalUnusedBotanicals.toFixed(2)), items: unusedBotanicalCosts.length },
    { name: 'Unused Packaging', value: parseFloat(totalUnusedPackaging.toFixed(2)), items: unusedPackagingCosts.length },
  ].filter(c => c.value > 0);

  const money = (v) => `$${(v || 0).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cost of Goods — Current Inventory</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Finished Goods" value={money(totalFinishedGoodsCost)} sub={`${finishedGoodsCosts.length} products`} color="text-purple-600" bg="bg-purple-50 border-purple-200" icon={<Wine className="w-4 h-4" />} />
        <StatCard label="Tank Stock" value={money(totalTankCost)} sub={`${tankStockCosts.length} active tanks`} color="text-cyan-600" bg="bg-cyan-50 border-cyan-200" icon={<Droplets className="w-4 h-4" />} />
        <StatCard label="Unused Materials" value={money(totalUnusedGoods)} sub="ethanol + botanicals + packaging" color="text-amber-600" bg="bg-amber-50 border-amber-200" icon={<Boxes className="w-4 h-4" />} />
        <StatCard label="Total COGS" value={money(totalCogsValue)} sub="all on-hand inventory" color="text-primary" bg="bg-accent border-accent-foreground/10" icon={<DollarSign className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h4 className="text-sm font-semibold mb-4">COGS Breakdown</h4>
          {cogBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={cogBreakdown} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: $${value.toFixed(0)}`} outerRadius={80} fill="#8884d8" dataKey="value">
                    {cogBreakdown.map((_, index) => <Cell key={`cell-${index}`} fill={COGS_COLORS[index % COGS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => money(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {cogBreakdown.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COGS_COLORS[i] }}></div>
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money(item.value)}</p>
                      <p className="text-xs text-muted-foreground">{item.items} item{item.items !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No cost data available</p>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="text-sm font-semibold mb-4">Cost Summary</h4>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Inventory Value</p>
              <p className="text-3xl font-bold font-display">{money(totalCogsValue)}</p>
              <p className="text-xs text-muted-foreground mt-1">Finished goods + tanks + unused materials</p>
            </div>
            <div className="space-y-2">
              {cogBreakdown.map((item) => (
                <div key={item.name} className="flex justify-between text-sm border-b pb-2">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-semibold">{((item.value / (totalCogsValue || 1)) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Finished Goods Cost Detail */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Wine className="w-4 h-4 text-purple-600" /> Finished Goods — Full Component Cost</h4>
        <p className="text-xs text-muted-foreground mb-3">Includes ethanol, botanicals, and packaging costs based on recipe data</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Bottles</TableHead>
                <TableHead>Ethanol Cost</TableHead>
                <TableHead>Botanical Cost</TableHead>
                <TableHead>Packaging Cost</TableHead>
                <TableHead>Cost / Bottle</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finishedGoodsCosts.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-4 text-muted-foreground text-sm">No finished goods in stock</TableCell></TableRow>
              ) : finishedGoodsCosts.map(fg => (
                <TableRow key={fg.id}>
                  <TableCell className="font-medium text-sm">{fg.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{fg.batch_number}</TableCell>
                  <TableCell className="text-sm">{fg.bottle_size_ml ? `${fg.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="text-sm">{(fg.quantity_bottles || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{money(fg.ethanolCost)}</TableCell>
                  <TableCell className="text-sm">{money(fg.botanicalCost)}</TableCell>
                  <TableCell className="text-sm">{money(fg.packagingCost)}</TableCell>
                  <TableCell className="text-sm font-semibold">{money(fg.costPerBottle)}</TableCell>
                  <TableCell className="text-sm font-bold">{money(fg.totalCost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-purple-50/50">
                <TableCell colSpan={4}>Total Finished Goods</TableCell>
                <TableCell className="text-sm">{money(totalFinishedEthanolCost)}</TableCell>
                <TableCell className="text-sm">{money(totalFinishedBotanicalCost)}</TableCell>
                <TableCell className="text-sm">{money(totalFinishedPackagingCost)}</TableCell>
                <TableCell />
                <TableCell className="text-sm">{money(totalFinishedGoodsCost)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Tank Stock Value */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Droplets className="w-4 h-4 text-cyan-600" /> Tank Stock Value</h4>
        <p className="text-xs text-muted-foreground mb-3">Spirit in tanks valued at ethanol cost per LAL ({money(avgEthanolCostPerLal)}/LAL) plus botanical costs from matching recipes</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tank</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Ethanol Cost</TableHead>
                <TableHead>Botanical Cost</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tankStockCosts.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-4 text-muted-foreground text-sm">No spirit in tanks</TableCell></TableRow>
              ) : tankStockCosts.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-sm">{t.name}</TableCell>
                  <TableCell className="text-sm">{t.current_product || '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{t.current_batch || '—'}</TableCell>
                  <TableCell className="text-sm">{(t.current_volume || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{t.current_abv ? `${t.current_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{t.lals.toFixed(3)}</TableCell>
                  <TableCell className="text-sm">{money(t.ethanolCost)}</TableCell>
                  <TableCell className="text-sm">{money(t.botanicalCost)}</TableCell>
                  <TableCell className="text-sm font-semibold">{money(t.cost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-cyan-50/50">
                <TableCell colSpan={6}>Total Tank Stock</TableCell>
                <TableCell className="text-sm">{money(totalTankEthanolCost)}</TableCell>
                <TableCell className="text-sm">{money(totalTankBotanicalCost)}</TableCell>
                <TableCell className="text-sm">{money(totalTankCost)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Unused Goods */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Boxes className="w-4 h-4 text-amber-600" /> Unused Stock — Raw Materials, Packaging & Ethanol</h4>
        <p className="text-xs text-muted-foreground mb-3">Materials still in inventory, not yet used in production</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Cost / Unit</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...unusedEthanolCosts, ...unusedBotanicalCosts, ...unusedPackagingCosts].length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No unused materials in stock</TableCell></TableRow>
              ) : (
                <>
                  {unusedEthanolCosts.map(m => (
                    <TableRow key={m.id} className="bg-amber-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">ethanol</TableCell>
                      <TableCell className="text-sm">{(m.lals || 0).toFixed(3)}</TableCell>
                      <TableCell className="text-sm">LALs</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  {unusedBotanicalCosts.map(m => (
                    <TableRow key={m.id} className="bg-green-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">botanical</TableCell>
                      <TableCell className="text-sm">{(m.quantity || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  {unusedPackagingCosts.map(m => (
                    <TableRow key={m.id} className="bg-purple-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">packaging</TableCell>
                      <TableCell className="text-sm">{(m.quantity || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-amber-50/50">
                    <TableCell colSpan={5}>Total Unused Stock</TableCell>
                    <TableCell className="text-sm">{money(totalUnusedGoods)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}