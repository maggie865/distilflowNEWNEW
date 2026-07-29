import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, AlertTriangle, Package, FlaskConical, Boxes, ChevronDown, ChevronRight } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';

const money = (v) => `$${(v || 0).toFixed(2)}`;

// Get ISO month string e.g. '2026-06'
const isoMonth = (d) => format(d, 'yyyy-MM');

// How many bottles dispatched in a given month
const bottlesInMonth = (dispatches, monthStr, size) => {
  return dispatches
    .filter(d => {
      const dm = d.dispatch_date?.slice(0, 7);
      return dm === monthStr && (!size || Number(d.bottle_size_ml) === Number(size));
    })
    .reduce((s, d) => s + (d.quantity_bottles || 0), 0);
};

const STATUS = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700', icon: '🔴' },
  low: { label: 'Low', cls: 'bg-amber-100 text-amber-700', icon: '🟡' },
  ok: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700', icon: '✅' },
  surplus: { label: 'Surplus', cls: 'bg-blue-100 text-blue-700', icon: '📦' },
};

function getStatus(onHand, needed) {
  if (needed === 0) return 'ok';
  const ratio = onHand / needed;
  if (ratio < 0.5) return 'critical';
  if (ratio < 1.0) return 'low';
  if (ratio > 2.0) return 'surplus';
  return 'ok';
}

function Section({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary w-full text-left">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {icon} {title}
      </button>
      {open && children}
    </div>
  );
}

export default function ForecastReport({ dispatches = [], rawMaterials = [], finishedGoods = [], recipes = [], bottlingRuns = [] }) {
  const now = new Date();
  const [forecastMonths, setForecastMonths] = useState(3);
  const [growthPct, setGrowthPct] = useState(10);
  const [safetyStockWeeks, setSafetyStockWeeks] = useState(4);
  const [lookbackMonths, setLookbackMonths] = useState(6);

  // ── Sales velocity ────────────────────────────────────────────────────────
  const salesVelocity = useMemo(() => {
    // Build monthly dispatch totals per product+size for the lookback period
    const months = [];
    for (let i = lookbackMonths - 1; i >= 0; i--) {
      months.push(isoMonth(subMonths(now, i)));
    }

    // Group dispatches by product+size
    const productMap = {};
    for (const d of dispatches) {
      if (!d.dispatch_date) continue;
      const key = `${d.product_name}||${d.bottle_size_ml || 700}`;
      if (!productMap[key]) productMap[key] = { product_name: d.product_name, bottle_size_ml: d.bottle_size_ml || 700, monthly: {} };
      const m = d.dispatch_date.slice(0, 7);
      productMap[key].monthly[m] = (productMap[key].monthly[m] || 0) + (d.quantity_bottles || 0);
    }

    return Object.values(productMap).map(p => {
      const monthlySales = months.map(m => p.monthly[m] || 0);
      const total = monthlySales.reduce((s, v) => s + v, 0);
      const avg = total / lookbackMonths;
      // Trend: compare last 3 months vs previous 3 months
      const recent = monthlySales.slice(-3).reduce((s, v) => s + v, 0) / 3;
      const earlier = monthlySales.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
      const trendPct = earlier > 0 ? ((recent - earlier) / earlier) * 100 : 0;
      // Peak month
      const peak = Math.max(...monthlySales);
      // Apply growth factor
      const forecastMonthly = avg * (1 + growthPct / 100);
      const forecastTotal = forecastMonthly * forecastMonths;
      // Safety stock = safetyStockWeeks weeks of avg sales
      const safetyStock = Math.ceil(avg * (safetyStockWeeks / 4));
      // Current stock
      const fg = finishedGoods.filter(g =>
        g.product_name === p.product_name &&
        Number(g.bottle_size_ml) === Number(p.bottle_size_ml)
      );
      const onHand = fg.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
      const needed = Math.ceil(forecastTotal + safetyStock);
      const shortfall = Math.max(0, needed - onHand);
      const surplus = Math.max(0, onHand - needed);
      const weeksOfStock = avg > 0 ? (onHand / avg) * 4 : null;
      return {
        ...p,
        months,
        monthlySales,
        avg: Math.round(avg),
        peak,
        trendPct,
        forecastMonthly: Math.round(forecastMonthly),
        forecastTotal: Math.ceil(forecastTotal),
        safetyStock,
        needed,
        onHand,
        shortfall,
        surplus,
        weeksOfStock: weeksOfStock ? Math.round(weeksOfStock) : null,
        status: getStatus(onHand, needed),
      };
    }).filter(p => p.avg > 0 || p.onHand > 0).sort((a, b) => b.forecastTotal - a.forecastTotal);
  }, [dispatches, finishedGoods, lookbackMonths, forecastMonths, growthPct, safetyStockWeeks]);

  // ── Packaging forecast ────────────────────────────────────────────────────
  const packagingForecast = useMemo(() => {
    // For each size, work out how many bottles will be produced
    const bottlesBySize = {};
    for (const sv of salesVelocity) {
      const size = Number(sv.bottle_size_ml);
      bottlesBySize[size] = (bottlesBySize[size] || 0) + sv.forecastTotal;
    }

    // Find packaging recipe for each size
    const results = [];
    const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');

    for (const [size, forecastBottles] of Object.entries(bottlesBySize)) {
      const pkgRecipe = packagingRecipes.find(r => r.name?.toLowerCase().includes(String(size)));
      if (!pkgRecipe?.packaging?.length) continue;

      for (const pkg of pkgRecipe.packaging) {
        if (!pkg.name) continue;
        const needed = Math.ceil((pkg.quantity || 1) * forecastBottles);
        // Box/case items needed per case not per bottle
        const isBox = ['box','case','carton','shipper'].some(w => pkg.name.toLowerCase().includes(w));
        const bottlesPerCase = pkgRecipe.bottles_per_case || 6;
        const adjustedNeeded = isBox ? Math.ceil(forecastBottles / bottlesPerCase) : needed;
        const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === (pkg.name || '').toLowerCase().trim())
          || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = (pkg.name || '').toLowerCase(); return n.includes(p) || p.includes(n); });
        const onHand = rm?.quantity || 0;
        const shortfall = Math.max(0, adjustedNeeded - onHand);
        results.push({
          name: pkg.name,
          size: Number(size),
          unit: pkg.unit || 'units',
          forecastBottles,
          needed: adjustedNeeded,
          onHand,
          shortfall,
          status: getStatus(onHand, adjustedNeeded),
          costPerUnit: rm?.cost_per_unit || 0,
          totalCost: shortfall * (rm?.cost_per_unit || 0),
        });
      }
    }

    // Also include packaging not linked to a recipe — just project from current usage
    const usedNames = new Set(results.map(r => r.name.toLowerCase()));
    const packagingRM = rawMaterials.filter(r => (r.type === 'packaging' || r.type === 'Packaging') && !usedNames.has((r.name || '').toLowerCase()));
    for (const rm of packagingRM) {
      // Estimate usage from bottling runs in the lookback period
      const totalBottled = bottlingRuns
        .filter(b => { const d = b.date?.slice(0, 7); return d >= isoMonth(subMonths(now, lookbackMonths)); })
        .reduce((s, b) => s + (b.bottles_produced || 0), 0);
      // Assume 1 per bottle as a conservative estimate
      const needed = Math.ceil((totalBottled / lookbackMonths) * forecastMonths);
      if (needed === 0) continue;
      const shortfall = Math.max(0, needed - (rm.quantity || 0));
      results.push({
        name: rm.name,
        size: null,
        unit: rm.unit || 'units',
        forecastBottles: null,
        needed,
        onHand: rm.quantity || 0,
        shortfall,
        status: getStatus(rm.quantity || 0, needed),
        costPerUnit: rm.cost_per_unit || 0,
        totalCost: shortfall * (rm.cost_per_unit || 0),
        estimated: true,
      });
    }

    return results.sort((a, b) => b.shortfall - a.shortfall);
  }, [salesVelocity, recipes, rawMaterials, bottlingRuns, forecastMonths, lookbackMonths]);

  // ── Raw material / ethanol forecast ──────────────────────────────────────
  const rawMaterialForecast = useMemo(() => {
    const totalForecastBottles = salesVelocity.reduce((s, v) => s + v.forecastTotal, 0);
    const spiritRecipes = recipes.filter(r => r.recipe_type === 'spirit' && r.base_ethanol_volume);

    const results = [];
    for (const recipe of spiritRecipes) {
      // Estimate how many distillation runs needed
      // Average yield: hearts_volume ≈ 40% of input, assume 1 run = ~200L hearts → ~600 700ml bottles
      const avgHeartsPerRun = 200; // litres, rough estimate
      const bottlesPerRun = (avgHeartsPerRun / 0.7) * (recipe.target_abv || 40) / 100 / 0.001; // very rough
      const runsNeeded = Math.ceil(totalForecastBottles / Math.max(bottlesPerRun, 1));
      const scale = runsNeeded;

      for (const ing of (recipe.ingredients || [])) {
        if (!ing.name) continue;
        const needed = Math.ceil((ing.quantity || 0) * scale);
        if (needed === 0) continue;
        const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === ing.name.toLowerCase().trim())
          || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = ing.name.toLowerCase(); return n.includes(p) || p.includes(n); });
        const onHand = rm?.quantity || 0;
        const shortfall = Math.max(0, needed - onHand);
        const existing = results.find(r => r.name === ing.name);
        if (existing) { existing.needed += needed; existing.shortfall = Math.max(0, existing.needed - existing.onHand); }
        else results.push({
          name: ing.name,
          unit: ing.unit || 'units',
          needed,
          onHand,
          shortfall,
          status: getStatus(onHand, needed),
          costPerUnit: rm?.cost_per_unit || 0,
          totalCost: shortfall * (rm?.cost_per_unit || 0),
          isEthanol: ing.name.toLowerCase().includes('ethanol'),
        });
      }
    }

    // Ethanol from LALs perspective
    const totalForecastLals = salesVelocity.reduce((s, v) => s + (v.forecastTotal * (v.bottle_size_ml / 1000) * 0.40), 0);
    const ethanolItems = rawMaterials.filter(r => r.type === 'ethanol' || r.type === 'Ethanol');
    const ethanolOnHand = ethanolItems.reduce((s, r) => s + (r.lals || (r.quantity || 0) * (r.abv_percent || 96) / 100), 0);
    if (totalForecastLals > 0) {
      const existing = results.find(r => r.isEthanol);
      if (!existing) {
        results.unshift({
          name: 'Ethanol (total)',
          unit: 'LALs',
          needed: Math.ceil(totalForecastLals),
          onHand: Math.round(ethanolOnHand * 10) / 10,
          shortfall: Math.max(0, Math.ceil(totalForecastLals) - ethanolOnHand),
          status: getStatus(ethanolOnHand, totalForecastLals),
          costPerUnit: ethanolItems[0]?.cost_per_unit || 0,
          totalCost: 0,
          isEthanol: true,
        });
      }
    }

    return results.sort((a, b) => (b.isEthanol ? 1 : 0) - (a.isEthanol ? 1 : 0) || b.shortfall - a.shortfall);
  }, [salesVelocity, recipes, rawMaterials, forecastMonths]);

  const criticalCount = [...salesVelocity, ...packagingForecast, ...rawMaterialForecast].filter(i => i.status === 'critical').length;
  const totalShortfallCost = [...packagingForecast, ...rawMaterialForecast].reduce((s, i) => s + (i.totalCost || 0), 0);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Forecast Settings</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Forecast period (months)</Label>
            <Input type="number" min="1" max="24" value={forecastMonths} onChange={e => setForecastMonths(Number(e.target.value))} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">How far ahead to plan</p>
          </div>
          <div>
            <Label className="text-xs">Sales history (months)</Label>
            <Input type="number" min="1" max="24" value={lookbackMonths} onChange={e => setLookbackMonths(Number(e.target.value))} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">How far back to average</p>
          </div>
          <div>
            <Label className="text-xs">Growth assumption (%)</Label>
            <Input type="number" min="-50" max="200" value={growthPct} onChange={e => setGrowthPct(Number(e.target.value))} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">+10% = expect 10% more sales</p>
          </div>
          <div>
            <Label className="text-xs">Safety stock (weeks)</Label>
            <Input type="number" min="0" max="52" value={safetyStockWeeks} onChange={e => setSafetyStockWeeks(Number(e.target.value))} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">Buffer above forecast</p>
          </div>
        </div>
      </Card>

      {/* Summary banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className={`p-4 border-2 ${criticalCount > 0 ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <p className="text-xs text-muted-foreground mb-1">Critical shortfalls</p>
          <p className={`text-2xl font-bold ${criticalCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{criticalCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{criticalCount === 0 ? 'All stock levels OK' : 'Items need urgent attention'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Forecast sales ({forecastMonths}mo)</p>
          <p className="text-2xl font-bold font-display">{salesVelocity.reduce((s, v) => s + v.forecastTotal, 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-0.5">bottles across all products</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Est. procurement cost</p>
          <p className="text-2xl font-bold font-display">{money(totalShortfallCost)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">for shortfall items (where costs set)</p>
        </Card>
      </div>

      {/* Sales velocity + finished goods */}
      <Section title={`Finished Goods Forecast (${forecastMonths} months)`} icon="🍾" defaultOpen={true}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Avg/mo</TableHead>
                  <TableHead className="text-right">Peak/mo</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead className="text-right">Forecast {forecastMonths}mo</TableHead>
                  <TableHead className="text-right">Safety Stock</TableHead>
                  <TableHead className="text-right font-bold">Need</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesVelocity.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-6 text-muted-foreground text-sm">No dispatch history found — forecast requires at least 1 month of sales data</TableCell></TableRow>
                ) : salesVelocity.map((v, i) => {
                  const s = STATUS[v.status];
                  return (
                    <TableRow key={i} className={v.status === 'critical' ? 'bg-red-50' : v.status === 'low' ? 'bg-amber-50/50' : ''}>
                      <TableCell className="font-medium text-sm">{v.product_name}</TableCell>
                      <TableCell className="text-sm">{v.bottle_size_ml}ml</TableCell>
                      <TableCell className="text-right text-sm">{v.avg}</TableCell>
                      <TableCell className="text-right text-sm">{v.peak}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className={v.trendPct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                          {v.trendPct >= 0 ? '↑' : '↓'} {Math.abs(v.trendPct).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">{v.forecastTotal.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{v.safetyStock}</TableCell>
                      <TableCell className="text-right font-bold text-sm">{v.needed.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{v.onHand.toLocaleString()}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${v.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {v.shortfall > 0 ? `-${v.shortfall.toLocaleString()}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {v.weeksOfStock !== null ? `${v.weeksOfStock}w` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${s.cls}`}>{s.icon} {s.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
        {salesVelocity.length > 0 && (
          <p className="text-xs text-muted-foreground px-1">
            Forecast = {lookbackMonths}-month average × {forecastMonths} months × {growthPct >= 0 ? '+' : ''}{growthPct}% growth. Safety stock = {safetyStockWeeks} weeks of average sales.
          </p>
        )}
      </Section>

      {/* Packaging */}
      <Section title="Packaging Requirements" icon="📦" defaultOpen={true}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">For Forecast</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right text-red-600">Shortfall</TableHead>
                  <TableHead className="text-right">Cost/Unit</TableHead>
                  <TableHead className="text-right">Procurement Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packagingForecast.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-sm">No packaging recipes found — add packaging recipes in Settings to see requirements</TableCell></TableRow>
                ) : packagingForecast.map((p, i) => {
                  const s = STATUS[p.status];
                  return (
                    <TableRow key={i} className={p.status === 'critical' ? 'bg-red-50' : p.status === 'low' ? 'bg-amber-50/50' : ''}>
                      <TableCell className="font-medium text-sm">
                        {p.name}
                        {p.estimated && <span className="text-xs text-muted-foreground ml-1">(est.)</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.size ? `${p.size}ml` : 'All'}</TableCell>
                      <TableCell className="text-right text-sm">{p.needed.toLocaleString()} {p.unit}</TableCell>
                      <TableCell className="text-right text-sm">{p.onHand.toLocaleString()}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${p.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {p.shortfall > 0 ? p.shortfall.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{p.costPerUnit ? money(p.costPerUnit) : '—'}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{p.totalCost > 0 ? money(p.totalCost) : '—'}</TableCell>
                      <TableCell><Badge className={`text-xs ${s.cls}`}>{s.icon} {s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </Section>

      {/* Raw materials / ethanol */}
      <Section title="Raw Materials & Ethanol" icon="🧪" defaultOpen={true}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Est. Need</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right text-red-600">Shortfall</TableHead>
                  <TableHead className="text-right">Cost/Unit</TableHead>
                  <TableHead className="text-right">Procurement Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawMaterialForecast.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">No spirit recipes found — add recipes in Settings to see raw material requirements</TableCell></TableRow>
                ) : rawMaterialForecast.map((r, i) => {
                  const s = STATUS[r.status];
                  return (
                    <TableRow key={i} className={r.isEthanol ? 'bg-blue-50/30 font-medium' : r.status === 'critical' ? 'bg-red-50' : ''}>
                      <TableCell className="text-sm">
                        {r.isEthanol && <FlaskConical className="w-3.5 h-3.5 inline mr-1 text-blue-600" />}
                        {r.name}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.needed.toLocaleString()} {r.unit}</TableCell>
                      <TableCell className="text-right text-sm">{r.onHand.toLocaleString()}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${r.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {r.shortfall > 0 ? r.shortfall.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.costPerUnit ? money(r.costPerUnit) : '—'}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{r.totalCost > 0 ? money(r.totalCost) : '—'}</TableCell>
                      <TableCell><Badge className={`text-xs ${s.cls}`}>{s.icon} {s.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground px-1">Raw material estimates are based on recipe ingredient quantities scaled to forecast production volume. Ethanol is estimated from forecast LALs at 40% ABV dilution.</p>
      </Section>
    </div>
  );
}
