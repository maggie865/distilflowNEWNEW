import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';

function ExciseRow({ label, value, sub, highlight }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-accent/30' : ''}`}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className={`text-lg font-bold font-mono ${highlight ? 'text-primary' : ''}`}>
        {value.toFixed(3)}
      </p>
    </div>
  );
}

export default function ExciseReturn({
  finishedGoods,
  warehouseStock,
  tanks,
  dispatches,
  distillationRuns,
  bottlingRuns,
  wastage,
  tankMovements,
}) {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selectedMonth, setSelectedMonth] = useState(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);

  const monthDate = parseISO(selectedMonth + '-01');
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const monthLabel = format(monthDate, 'MMMM yyyy');

  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    try {
      return isWithinInterval(parseISO(dateStr), { start: monthStart, end: monthEnd });
    } catch { return false; }
  };

  // --- Current total LALs (all stock locations) ---
  const currentFinishedLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);
  const currentWarehouseLALs = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const currentTankLALs = tanks.reduce((s, t) => s + ((t.current_volume || 0) * (t.current_abv || 0) / 100), 0);
  const currentTotalLALs = currentFinishedLALs + currentWarehouseLALs + currentTankLALs;

  // --- LALs Produced (hearts from distillation runs in month) ---
  const monthDistillations = distillationRuns.filter(r => inMonth(r.date));
  const lalsProduced = monthDistillations.reduce((s, r) => s + (r.hearts_lals || 0), 0);

  // --- LALs Bottled (input_lals from bottling runs in month) ---
  const monthBottlings = bottlingRuns.filter(r => inMonth(r.date));
  const lalsBottled = monthBottlings.reduce((s, r) => s + (r.input_lals || 0), 0);

  // --- LALs Dispatched (total_lals from dispatches in month) ---
  const monthDispatches = dispatches.filter(d => inMonth(d.dispatch_date));
  const lalsDispatched = monthDispatches
    .filter(d => !d.is_sample)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const lalsSamples = monthDispatches
    .filter(d => d.is_sample)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const lalsDispatchedAll = lalsDispatched + lalsSamples;

  // --- LALs Wasted (lals from wastage records in month) ---
  const monthWastage = wastage.filter(w => inMonth(w.date));
  const lalsWasted = monthWastage.reduce((s, w) => s + (w.lals || 0), 0);

  // --- Opening LALs: work backwards from current totals ---
  // Add back dispatches and wastage within the month (they reduced stock)
  // Subtract distillation hearts produced in the month (they increased stock)
  // Bottling doesn't change total LALs (just moves from tank to bottles)
  const openingLALs = currentTotalLALs + lalsDispatchedAll + lalsWasted - lalsProduced;

  // --- Closing LALs: Opening + Produced - Dispatched - Wasted ---
  const closingLALs = openingLALs + lalsProduced - lalsDispatchedAll - lalsWasted;

  // --- Mass balance check ---
  const discrepancy = Math.abs(closingLALs - currentTotalLALs);
  const isBalanced = discrepancy < 0.5;

  // --- Breakdown: LALs dispatched by customer ---
  const dispatchByCustomer = useMemo(() => {
    const map = {};
    monthDispatches.forEach(d => {
      const name = d.customer_name || 'Unknown';
      if (!map[name]) map[name] = { name, lals: 0, hasSamples: false };
      map[name].lals += d.total_lals || 0;
      if (d.is_sample) map[name].hasSamples = true;
    });
    return Object.values(map).sort((a, b) => b.lals - a.lals);
  }, [monthDispatches]);

  // --- Breakdown: LALs produced by batch ---
  const producedByBatch = useMemo(() => {
    const map = {};
    monthDistillations.forEach(r => {
      const batch = r.batch_number || 'Unknown';
      map[batch] = (map[batch] || 0) + (r.hearts_lals || 0);
    });
    return Object.entries(map).map(([batch, lals]) => ({ batch, lals })).sort((a, b) => b.lals - a.lals);
  }, [monthDistillations]);

  const handleCopy = () => {
    const text = [
      `NZ EXCISE RETURN — LAL SUMMARY`,
      `Period: ${monthLabel}`,
      ``,
      `Opening LALs:           ${openingLALs.toFixed(3)}`,
      `LALs Produced:          ${lalsProduced.toFixed(3)}`,
      `LALs Bottled:           ${lalsBottled.toFixed(3)}`,
      `LALs Dispatched (sold): ${lalsDispatched.toFixed(3)}`,
      `LALs Samples/Promo:     ${lalsSamples.toFixed(3)}`,
      `LALs Wasted:            ${lalsWasted.toFixed(3)}`,
      `Closing LALs:           ${closingLALs.toFixed(3)}`,
      ``,
      `Mass Balance Check: ${isBalanced ? 'BALANCED ✓' : `DISCREPANCY ${discrepancy.toFixed(3)} LALs ⚠`}`,
      ``,
      `--- Dispatched by Customer ---`,
      ...dispatchByCustomer.map(c => `${c.name}: ${c.lals.toFixed(3)}`),
      ``,
      `--- Produced by Batch ---`,
      ...producedByBatch.map(b => `${b.batch}: ${b.lals.toFixed(3)}`),
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard — ready for TSW');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  return (
    <div className="space-y-6">
      {/* Month selector + Copy */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Monthly LAL Summary for Excise Return</h3>
              <p className="text-xs text-muted-foreground">Suitable for NZ Trade Single Window submission</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs">Month / Year</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="w-40 text-sm"
              />
            </div>
            <Button onClick={handleCopy} className="gap-2 mt-5">
              <Copy className="w-4 h-4" /> Copy for TSW
            </Button>
          </div>
        </div>
      </Card>

      {/* LAL Summary */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h4 className="text-sm font-semibold">{monthLabel} — LAL Summary (Litres of Absolute Alcohol)</h4>
        </div>
        <div className="divide-y divide-border">
          <ExciseRow label="Opening LALs" value={openingLALs} sub={`Total stock at start of ${monthLabel}`} />
          <ExciseRow label="LALs Produced" value={lalsProduced} sub={`${monthDistillations.length} distillation run(s)`} />
          <ExciseRow label="LALs Bottled" value={lalsBottled} sub={`${monthBottlings.length} bottling run(s) — no net change to total LALs`} />
          <ExciseRow label="LALs Dispatched (sold)" value={lalsDispatched} sub={`${monthDispatches.filter(d => !d.is_sample).length} dispatch(es) (excl. samples)`} />
          <ExciseRow label="LALs — Samples / Promotional" value={lalsSamples} sub={`${monthDispatches.filter(d => d.is_sample).length} sample dispatch(es)`} />
          <ExciseRow label="LALs Wasted" value={lalsWasted} sub={`${monthWastage.length} wastage record(s)`} />
          <ExciseRow label="Closing LALs" value={closingLALs} sub={`Opening + Produced - Dispatched - Wasted`} highlight />
        </div>
        <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-1">
          <p className="text-xs text-muted-foreground">Current system stock (for reference): {currentTotalLALs.toFixed(3)} LALs</p>
          <p className="text-xs text-amber-600">Samples are excluded from taxable dispatches. Verify sample treatment with your customs broker.</p>
        </div>
      </Card>

      {/* Mass Balance Check */}
      <Card className={`p-5 border-2 ${isBalanced ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
          )}
          <div>
            <p className={`font-semibold ${isBalanced ? 'text-emerald-800' : 'text-red-800'}`}>
              {isBalanced ? 'Mass Balance: Balanced ✓' : 'Mass Balance: Discrepancy Detected'}
            </p>
            <p className={`text-sm ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {isBalanced
                ? `Closing LALs (${closingLALs.toFixed(3)}) matches current stock (${currentTotalLALs.toFixed(3)}) within 0.5 LAL tolerance.`
                : `Closing LALs (${closingLALs.toFixed(3)}) differs from current stock (${currentTotalLALs.toFixed(3)}) by ${discrepancy.toFixed(3)} LALs. Check for missing or unrecorded movements.`
              }
            </p>
          </div>
        </div>
      </Card>

      {/* Breakdown tables */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-sm font-semibold">LALs Dispatched by Customer — {monthLabel}</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">LALs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatchByCustomer.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No dispatches in this period</TableCell></TableRow>
                ) : dispatchByCustomer.map(c => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1.5">
                        {c.name}
                        {c.hasSamples && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-300">S</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">{c.lals.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
                {dispatchByCustomer.length > 0 && (
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-sm">Total</TableCell>
                    <TableCell className="font-bold text-sm font-mono text-right">{lalsDispatchedAll.toFixed(3)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-sm font-semibold">LALs Produced by Batch — {monthLabel}</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">LALs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {producedByBatch.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No distillation runs in this period</TableCell></TableRow>
                ) : producedByBatch.map(b => (
                  <TableRow key={b.batch}>
                    <TableCell className="text-sm font-mono">{b.batch}</TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">{b.lals.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
                {producedByBatch.length > 0 && (
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-sm">Total</TableCell>
                    <TableCell className="font-bold text-sm font-mono text-right">{lalsProduced.toFixed(3)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}