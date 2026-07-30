import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { format, subMonths } from 'date-fns';

const money = v => `$${(v || 0).toFixed(2)}`;
const isoMonth = d => format(d, 'yyyy-MM');

const isBoxItem = pkg =>
  pkg.type === 'carton' ||
  ['box','case','carton','shipper'].some(w => (pkg.name || '').toLowerCase().includes(w));

const STATUS = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
  low:      { label: 'Low',      cls: 'bg-amber-100 text-amber-700' },
  ok:       { label: 'OK',       cls: 'bg-emerald-100 text-emerald-700' },
  surplus:  { label: 'Surplus',  cls: 'bg-blue-100 text-blue-700' },
};
const getStatus = (onHand, needed) => {
  if (!needed) return 'ok';
  const r = onHand / needed;
  if (r < 0.5) return 'critical';
  if (r < 1.0) return 'low';
  if (r > 2.0) return 'surplus';
  return 'ok';
};

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-semibold hover:text-primary w-full text-left">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function StatusBadge({ onHand, needed }) {
  const s = STATUS[getStatus(onHand, needed)];
  return <Badge className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

export default function ForecastReport({ dispatches = [], rawMaterials = [], finishedGoods = [], recipes = [], bottlingRuns = [], distillationRuns = [] }) {
  const now = new Date();
  const [forecastMonths, setForecastMonths] = useState(3);
  const [lookbackMonths, setLookbackMonths] = useState(6);
  const [growthPct, setGrowthPct] = useState(10);
  const [safetyWeeks, setSafetyWeeks] = useState(4);

  // ── 1. Sales velocity per product+size ────────────────────────────────────
  const velocity = useMemo(() => {
    const months = Array.from({ length: lookbackMonths }, (_, i) =>
      isoMonth(subMonths(now, lookbackMonths - 1 - i))
    );
    const map = {};
    for (const d of dispatches) {
      if (!d.dispatch_date || d.sample_dispatch) continue;
      const key = `${d.product_name}||${d.bottle_size_ml || 700}`;
      if (!map[key]) map[key] = { product_name: d.product_name, size: d.bottle_size_ml || 700, byMonth: {} };
      const m = d.dispatch_date.slice(0, 7);
      map[key].byMonth[m] = (map[key].byMonth[m] || 0) + (d.quantity_bottles || 0);
    }
    return Object.values(map).map(p => {
      const monthly = months.map(m => p.byMonth[m] || 0);
      const avg = monthly.reduce((s, v) => s + v, 0) / lookbackMonths;
      const growth = 1 + growthPct / 100;
      const forecastMonthly = avg * growth;
      const forecastTotal = Math.ceil(forecastMonthly * forecastMonths);
      const safetyStock = Math.ceil(avg * (safetyWeeks / 4));
      const onHand = finishedGoods
        .filter(g => g.product_name === p.product_name && Number(g.bottle_size_ml) === Number(p.size))
        .reduce((s, g) => s + (g.quantity_bottles || 0), 0);
      const trend = (() => {
        const r = monthly.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const e = monthly.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
        return e > 0 ? ((r - e) / e * 100).toFixed(0) : null;
      })();
      return { ...p, avg: Math.round(avg), forecastMonthly: Math.round(forecastMonthly), forecastTotal, safetyStock, onHand, needed: forecastTotal + safetyStock, trend };
    }).filter(p => p.avg > 0).sort((a, b) => b.forecastTotal - a.forecastTotal);
  }, [dispatches, finishedGoods, lookbackMonths, forecastMonths, growthPct, safetyWeeks]);

  // ── 2. Batches + LALs needed ───────────────────────────────────────────────
  // Use ACTUAL historical distillation data:
  //   - avg hearts_volume per batch
  //   - avg hearts_abv per batch → avg LALs per batch
  //   - avg bottles per batch (from bottlingRuns linked by batch_number)
  const distillationPlan = useMemo(() => {
    const spiritRecipes = recipes.filter(r => r.recipe_type === 'spirit');
    if (!spiritRecipes.length || !velocity.length) return [];

    // Compute actuals from historical completed distillation runs
    const completedRuns = distillationRuns.filter(r => r.status === 'completed' && r.input_volume > 0);
    const avgHeartsVol = completedRuns.length
      ? completedRuns.reduce((s, r) => s + (r.hearts_volume || 0), 0) / completedRuns.length : null;
    const avgHeartsLals = completedRuns.length
      ? completedRuns.reduce((s, r) => s + ((r.hearts_volume || 0) * (r.hearts_abv || 0) / 100), 0) / completedRuns.length : null;
    const avgInputVol = completedRuns.length
      ? completedRuns.reduce((s, r) => s + (r.input_volume || 0), 0) / completedRuns.length : null;
    // Input LALs = what you actually need to purchase/have on hand
    const avgInputLals = completedRuns.length
      ? completedRuns.reduce((s, r) => s + (r.input_lals || (r.input_volume || 0) * (r.input_abv || 96) / 100), 0) / completedRuns.length : null;

    // Avg bottles per distillation batch from bottling runs
    const batchBottles = {};
    for (const br of bottlingRuns) {
      if (!br.batch_number) continue;
      batchBottles[br.batch_number] = (batchBottles[br.batch_number] || 0) + (br.bottles_produced || 0);
    }
    const batchVals = Object.values(batchBottles).filter(v => v > 0);
    const avgBottlesPerBatch = batchVals.length
      ? batchVals.reduce((s, v) => s + v, 0) / batchVals.length : null;

    // Total forecast bottles
    const totalForecast700 = velocity.filter(v => Number(v.size) === 700).reduce((s, v) => s + v.forecastTotal, 0);
    const totalForecast200 = velocity.filter(v => Number(v.size) === 200).reduce((s, v) => s + v.forecastTotal, 0);
    // Weight 700ml more heavily for LAL calculation
    const totalForecastLals = totalForecast700 * 0.700 * 0.40 + totalForecast200 * 0.200 * 0.40;

    // Batches needed — use actual avg if available, else use recipe base_ethanol_volume
    const recipe = spiritRecipes[0];
    // Input LALs per batch — from actual run data or recipe (base_vol × base_abv)
    const chargeAbv = (recipe.base_ethanol_abv || 55) / 100; // ABV of what goes into the still
    const inputLalsPerBatch = avgInputLals
      || (recipe.base_ethanol_volume ? recipe.base_ethanol_volume * chargeAbv : null);
    // Input volume per batch in litres AT CHARGE ABV (e.g. 300L @ 55%)
    const inputVolPerBatchLitres = avgInputVol
      || (inputLalsPerBatch && chargeAbv > 0 ? inputLalsPerBatch / chargeAbv : null);
    // Hearts LALs per batch (output — for reference)
    const heartsLalsPerBatch = avgHeartsLals
      || (inputLalsPerBatch ? inputLalsPerBatch * ((recipe.expected_yield_percent || 85) / 100) : null);
    const bottlesPerBatch = avgBottlesPerBatch
      || (heartsLalsPerBatch ? Math.round(heartsLalsPerBatch / 0.40 / 0.700) : null);
    const batchesNeeded = bottlesPerBatch
      ? Math.ceil((totalForecast700 + totalForecast200) / bottlesPerBatch) : null;
    // Total input LALs needed
    const totalInputLalsNeeded = batchesNeeded && inputLalsPerBatch
      ? batchesNeeded * inputLalsPerBatch
      : totalForecastLals / ((recipe.expected_yield_percent || 85) / 100);
    // Total input volume needed in litres AT CHARGE ABV
    const totalInputVolLitres = batchesNeeded && inputVolPerBatchLitres
      ? batchesNeeded * inputVolPerBatchLitres
      : chargeAbv > 0 ? totalInputLalsNeeded / chargeAbv : null;
    // Also show equivalent in litres of 96% for purchasing reference
    const litres96Needed = totalInputLalsNeeded / 0.96;
    const chargeAbvPct = Math.round((recipe.base_ethanol_abv || 55));

    // Ethanol on hand
    const ethanolRM = rawMaterials.filter(r => (r.type || '').toLowerCase() === 'ethanol');
    const ethanolLalsOnHand = ethanolRM.reduce((s, r) => s + (r.lals || (r.quantity || 0) * (r.abv_percent || 96) / 100), 0);
    const ethanolLitresOnHand = ethanolRM.reduce((s, r) => s + (r.quantity || 0), 0);

    return [{
      recipe,
      batchesNeeded,
      bottlesPerBatch: bottlesPerBatch ? Math.round(bottlesPerBatch) : null,
      inputLalsPerBatch: inputLalsPerBatch ? parseFloat(inputLalsPerBatch.toFixed(2)) : null,
      inputVolPerBatchLitres: inputVolPerBatchLitres ? parseFloat(inputVolPerBatchLitres.toFixed(1)) : null,
      heartsLalsPerBatch: heartsLalsPerBatch ? parseFloat(heartsLalsPerBatch.toFixed(2)) : null,
      avgInputVol: avgInputVol ? parseFloat(avgInputVol.toFixed(1)) : null,
      totalInputLalsNeeded: parseFloat(totalInputLalsNeeded.toFixed(2)),
      totalInputVolLitres: totalInputVolLitres ? parseFloat(totalInputVolLitres.toFixed(1)) : null,
      litres96Needed: parseFloat(litres96Needed.toFixed(2)),
      chargeAbvPct,
      ethanolLalsOnHand: parseFloat(ethanolLalsOnHand.toFixed(2)),
      ethanolLitresOnHand: parseFloat(ethanolLitresOnHand.toFixed(2)),
      ethanolShortfallLals: Math.max(0, parseFloat((totalInputLalsNeeded - ethanolLalsOnHand).toFixed(2))),
      ethanolShortfall96: Math.max(0, parseFloat((litres96Needed - ethanolLitresOnHand).toFixed(2))),
      dataSource: completedRuns.length > 0 ? `Based on ${completedRuns.length} actual distillation runs` : 'Estimated from recipe (no completed runs yet)',
    }];
  }, [velocity, recipes, distillationRuns, bottlingRuns, rawMaterials, forecastMonths]);

  // ── 3. Botanicals needed ──────────────────────────────────────────────────
  const botanicalForecast = useMemo(() => {
    const plan = distillationPlan[0];
    if (!plan?.batchesNeeded) return [];
    const recipe = plan.recipe;
    if (!recipe?.ingredients?.length) return [];

    // Scale each ingredient: recipe specifies amounts per base_ethanol_volume
    // If we have actual avg input volume, scale to that instead
    const inputVolPerBatch = plan.avgInputVol || recipe.base_ethanol_volume || 1;

    return recipe.ingredients.map(ing => {
      const scaledPerBatch = ing.quantity; // recipe quantities are per batch at base_ethanol_volume
      const totalNeeded = Math.ceil(scaledPerBatch * plan.batchesNeeded);
      const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === (ing.name || '').toLowerCase().trim())
        || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = (ing.name || '').toLowerCase(); return n.includes(p) || p.includes(n); });
      const onHand = rm?.quantity || 0;
      const shortfall = Math.max(0, totalNeeded - onHand);
      return {
        name: ing.name,
        unit: ing.unit || 'g',
        perBatch: scaledPerBatch,
        totalNeeded,
        onHand,
        shortfall,
        costPerUnit: rm?.cost_per_unit || 0,
        totalCost: shortfall * (rm?.cost_per_unit || 0),
      };
    });
  }, [distillationPlan, rawMaterials]);

  // ── 4. Packaging forecast ─────────────────────────────────────────────────
  const packagingForecast = useMemo(() => {
    const results = [];
    const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');

    for (const sv of velocity) {
      const size = Number(sv.size);
      // Find packaging recipe matching this bottle size
      const pkgRecipe = packagingRecipes.find(r => r.name?.toLowerCase().includes(String(size)));
      if (!pkgRecipe?.packaging?.length) continue;

      const bottlesPerCase = pkgRecipe.bottles_per_case || 6;
      const casesNeeded = Math.ceil(sv.forecastTotal / bottlesPerCase);

      for (const pkg of pkgRecipe.packaging) {
        if (!pkg.name) continue;
        // Key distinction: boxes/cartons = 1 per CASE; everything else = 1 per BOTTLE
        const isBox = isBoxItem(pkg);
        const totalNeeded = isBox
          ? Math.ceil((pkg.quantity || 1) * casesNeeded)
          : Math.ceil((pkg.quantity || 1) * sv.forecastTotal);

        const key = `${pkg.name}||${size}`;
        const existing = results.find(r => r.key === key);
        if (existing) {
          existing.totalNeeded += totalNeeded;
          existing.casesNeeded += isBox ? casesNeeded : 0;
        } else {
          const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === (pkg.name || '').toLowerCase().trim())
            || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = (pkg.name || '').toLowerCase(); return n.includes(p) || p.includes(n); });
          results.push({
            key,
            name: pkg.name,
            size,
            isBox,
            unit: pkg.unit || 'units',
            totalNeeded,
            casesNeeded: isBox ? casesNeeded : null,
            bottlesForecasted: sv.forecastTotal,
            bottlesPerCase,
            onHand: rm?.quantity || 0,
            costPerUnit: rm?.cost_per_unit || 0,
          });
        }
      }
    }

    return results.map(r => ({
      ...r,
      shortfall: Math.max(0, r.totalNeeded - r.onHand),
      totalCost: Math.max(0, r.totalNeeded - r.onHand) * r.costPerUnit,
    })).sort((a, b) => b.shortfall - a.shortfall);
  }, [velocity, recipes, rawMaterials]);

  const plan = distillationPlan[0];
  const totalProcurementCost = [...botanicalForecast, ...packagingForecast].reduce((s, i) => s + (i.totalCost || 0), 0);

  return (
    <div className="space-y-5">

      {/* Controls */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Forecast Settings</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs font-semibold">Forecast period</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" max="24" value={forecastMonths} onChange={e => setForecastMonths(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">months</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Sales history</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" max="24" value={lookbackMonths} onChange={e => setLookbackMonths(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">months</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Growth factor</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="-50" max="200" value={growthPct} onChange={e => setGrowthPct(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Safety stock buffer</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="0" max="52" value={safetyWeeks} onChange={e => setSafetyWeeks(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">weeks</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── SECTION 1: Sales forecast ── */}
      <Section title="🍾 Finished Goods Forecast">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Avg/mo</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead className="text-right">Forecast {forecastMonths}mo</TableHead>
                  <TableHead className="text-right">Safety stock</TableHead>
                  <TableHead className="text-right font-bold">Total needed</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {velocity.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No sales history found — dispatch records needed to forecast</TableCell></TableRow>
                ) : velocity.map((v, i) => (
                  <TableRow key={i} className={getStatus(v.onHand, v.needed) === 'critical' ? 'bg-red-50' : getStatus(v.onHand, v.needed) === 'low' ? 'bg-amber-50/40' : ''}>
                    <TableCell className="font-medium text-sm">{v.product_name}</TableCell>
                    <TableCell className="text-sm">{v.size}ml</TableCell>
                    <TableCell className="text-right text-sm">{v.avg.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">
                      {v.trend !== null ? <span className={Number(v.trend) >= 0 ? 'text-emerald-600' : 'text-red-600'}>{Number(v.trend) >= 0 ? '↑' : '↓'}{Math.abs(v.trend)}%</span> : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">{v.forecastTotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{v.safetyStock.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{v.needed.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{v.onHand.toLocaleString()}</TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${Math.max(0, v.needed - v.onHand) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {Math.max(0, v.needed - v.onHand) > 0 ? `-${(v.needed - v.onHand).toLocaleString()}` : '✓'}
                    </TableCell>
                    <TableCell><StatusBadge onHand={v.onHand} needed={v.needed} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">Avg monthly sales × {forecastMonths} months × {growthPct >= 0 ? '+' : ''}{growthPct}% growth + {safetyWeeks} weeks safety stock buffer.</p>
      </Section>

      {/* ── SECTION 2: Distillation plan ── */}
      <Section title="🧪 Distillation Plan">
        {!plan ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No spirit recipe found — add a recipe in Settings to see the distillation plan.</Card>
        ) : (
          <div className="space-y-3">
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="font-semibold">{plan.recipe.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.dataSource}</p>
                </div>
                <Badge className="bg-primary/10 text-primary text-sm px-3 py-1">
                  {plan.batchesNeeded !== null ? `${plan.batchesNeeded} batches needed` : 'Set up recipes to calculate batches'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Batches needed</p>
                  <p className="text-2xl font-bold text-primary">{plan.batchesNeeded ?? '—'}</p>
                  {plan.bottlesPerBatch && <p className="text-xs text-muted-foreground">~{plan.bottlesPerBatch.toLocaleString()} bottles/batch</p>}
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Input LALs needed</p>
                  <p className="text-2xl font-bold text-primary">{plan.totalInputLalsNeeded}</p>
                  {plan.inputLalsPerBatch && <p className="text-xs text-muted-foreground">~{plan.inputLalsPerBatch} LALs/batch</p>}
                  {plan.heartsLalsPerBatch && <p className="text-xs text-muted-foreground/60">~{plan.heartsLalsPerBatch} hearts LALs out/batch</p>}
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Spirit to charge still</p>
                  <p className="text-2xl font-bold text-primary">{plan.totalInputVolLitres ?? plan.litres96Needed}L</p>
                  <p className="text-xs text-muted-foreground">@ {plan.chargeAbvPct}% ABV</p>
                  {plan.inputVolPerBatchLitres && <p className="text-xs text-muted-foreground/60">~{plan.inputVolPerBatchLitres}L/batch · {plan.litres96Needed}L equiv. at 96%</p>}
                </div>
                <div className={`rounded-lg p-3 ${plan.ethanolShortfallLals > 0 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className="text-xs text-muted-foreground">Ethanol shortfall</p>
                  <p className={`text-2xl font-bold ${plan.ethanolShortfallLals > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {plan.ethanolShortfallLals > 0 ? `${plan.ethanolShortfallLals} LALs` : '✓ Sufficient'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.ethanolShortfallLals > 0 ? `Need ${plan.ethanolShortfall96}L of 96% ethanol` : `${plan.ethanolLalsOnHand} LALs on hand`}
                  </p>
                </div>
              </div>
            </Card>

            {/* Botanicals */}
            {botanicalForecast.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b">
                  <h4 className="text-sm font-semibold">Botanical Requirements — {plan.batchesNeeded} batches</h4>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead className="text-right">Per batch</TableHead>
                        <TableHead className="text-right">Total needed</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Shortfall</TableHead>
                        <TableHead className="text-right">Est. cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {botanicalForecast.map((b, i) => (
                        <TableRow key={i} className={b.shortfall > 0 && getStatus(b.onHand, b.totalNeeded) === 'critical' ? 'bg-red-50' : ''}>
                          <TableCell className="font-medium text-sm">{b.name}</TableCell>
                          <TableCell className="text-right text-sm">{b.perBatch?.toLocaleString()} {b.unit}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{b.totalNeeded.toLocaleString()} {b.unit}</TableCell>
                          <TableCell className="text-right text-sm">{b.onHand.toLocaleString()}</TableCell>
                          <TableCell className={`text-right text-sm font-semibold ${b.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {b.shortfall > 0 ? `-${b.shortfall.toLocaleString()}` : '✓'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{b.totalCost > 0 ? money(b.totalCost) : '—'}</TableCell>
                          <TableCell><StatusBadge onHand={b.onHand} needed={b.totalNeeded} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}
      </Section>

      {/* ── SECTION 3: Packaging ── */}
      <Section title="📦 Packaging Requirements">
        {packagingForecast.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No packaging recipes found — add packaging recipes in Settings to see requirements.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right">Forecast bottles</TableHead>
                    <TableHead className="text-right">Cases</TableHead>
                    <TableHead className="text-right font-bold">Total needed</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Shortfall</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packagingForecast.map((p, i) => (
                    <TableRow key={i} className={p.shortfall > 0 && getStatus(p.onHand, p.totalNeeded) === 'critical' ? 'bg-red-50' : ''}>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-sm">{p.size}ml</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.isBox ? `1 per case (${p.bottlesPerCase} btls)` : '1 per bottle'}</TableCell>
                      <TableCell className="text-right text-sm">{p.bottlesForecasted.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{p.casesNeeded ? p.casesNeeded.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right font-bold text-sm">{p.totalNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{p.onHand.toLocaleString()}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${p.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {p.shortfall > 0 ? `-${p.shortfall.toLocaleString()}` : '✓'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{p.totalCost > 0 ? money(p.totalCost) : '—'}</TableCell>
                      <TableCell><StatusBadge onHand={p.onHand} needed={p.totalNeeded} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalProcurementCost > 0 && (
              <div className="px-4 py-3 border-t bg-muted/20 text-sm flex justify-between">
                <span className="text-muted-foreground">Estimated total procurement cost (shortfall items only)</span>
                <span className="font-bold">{money(totalProcurementCost)}</span>
              </div>
            )}
          </Card>
        )}
        <p className="text-xs text-muted-foreground">Boxes/cartons deducted at 1 per case. All other items at 1 per bottle. Bottles per case from packaging recipe.</p>
      </Section>
    </div>
  );
}