import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, ArrowRightLeft, Wine, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import Pagination from '@/components/ui/Pagination';

export default function TransfersTab({ warehouseStock, onPrintSlip }) {
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const getOrigBottles = (w) => w.original_quantity_bottles ?? w.quantity_bottles ?? 0;
  const getOrigLals = (w) => w.original_total_lals ?? w.total_lals ?? 0;

  const filtered = useMemo(() => {
    const [year, month] = monthFilter.split('-').map(Number);
    return warehouseStock.filter(w => {
      if (!w.transfer_date) return false;
      const d = new Date(w.transfer_date);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
  }, [warehouseStock, monthFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => new Date(b.transfer_date) - new Date(a.transfer_date));
  }, [filtered]);

  const totalTransfers = new Set(sorted.map(w => w.transfer_date)).size;
  const totalBottles = sorted.reduce((s, w) => s + getOrigBottles(w), 0);
  const totalLALs = sorted.reduce((s, w) => s + getOrigLals(w), 0);

  const dateSubtotals = useMemo(() => {
    const map = {};
    sorted.forEach(w => {
      const date = w.transfer_date || '—';
      if (!map[date]) map[date] = { bottles: 0, lals: 0, remaining: 0 };
      map[date].bottles += getOrigBottles(w);
      map[date].lals += getOrigLals(w);
      map[date].remaining += w.quantity_bottles || 0;
    });
    return map;
  }, [sorted]);

  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const renderRows = useMemo(() => {
    const rows = [];
    let prevDate = null;
    paged.forEach(w => {
      const date = w.transfer_date || '—';
      if (date !== prevDate) {
        rows.push({ type: 'header', date, key: 'header-' + date + '-' + w.id });
        prevDate = date;
      }
      rows.push({ type: 'data', record: w, key: w.id });
    });
    return rows;
  }, [paged]);

  const stats = [
    { label: 'Transfers this month', value: totalTransfers, icon: ArrowRightLeft, color: 'text-blue-600' },
    { label: 'Bottles transferred', value: totalBottles.toLocaleString(), icon: Wine, color: 'text-purple-600' },
    { label: 'LALs transferred', value: totalLALs.toFixed(2), icon: Droplets, color: 'text-cyan-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-xl font-bold font-display">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="month"
          value={monthFilter}
          onChange={e => { setMonthFilter(e.target.value); setPage(1); }}
          className="w-40"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer Date</TableHead>
                <TableHead>Packing Slip #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Transferred</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">CO2e (kg)</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderRows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No transfers in this period</TableCell></TableRow>
              ) : renderRows.map(row => {
                if (row.type === 'header') {
                  const sub = dateSubtotals[row.date] || { bottles: 0, lals: 0, remaining: 0 };
                  return (
                    <TableRow key={row.key} className="bg-muted/40">
                      <TableCell colSpan={5} className="font-semibold text-sm">
                        {row.date !== '—' ? format(new Date(row.date), 'EEEE d MMMM yyyy') : 'Unknown date'}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-sm">{sub.bottles.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-sm">{sub.lals.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-sm">{sub.remaining.toLocaleString()}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  );
                }
                const w = row.record;
                const origBottles = getOrigBottles(w);
                const origLals = getOrigLals(w);
                const remaining = w.quantity_bottles || 0;
                const isDepleted = remaining === 0;
                return (
                  <TableRow key={row.key} className={isDepleted ? 'opacity-60' : ''}>
                    <TableCell className="text-sm">{w.transfer_date ? format(new Date(w.transfer_date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{w.packing_slip_number || '—'}</TableCell>
                    <TableCell className="font-medium text-sm">{w.product_name}</TableCell>
                    <TableCell className="font-mono text-sm">{w.batch_number}</TableCell>
                    <TableCell className="text-sm">{w.bottle_size_ml}ml</TableCell>
                    <TableCell className="text-right text-sm">{origBottles.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{origLals.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {isDepleted ? (
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium">Depleted</span>
                      ) : (
                        remaining.toLocaleString()
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{(w.co2e_kg || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onPrintSlip(w)}>
                        <Printer className="w-3 h-3" /> Slip
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination total={sorted.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
    </div>
  );
}