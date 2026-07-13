import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function PackingSlipsTab({ warehouseStock, onPrintSlip }) {
  const grouped = useMemo(() => {
    const map = {};
    warehouseStock.forEach(w => {
      if (!w.packing_slip_number) return;
      if (!map[w.packing_slip_number]) map[w.packing_slip_number] = [];
      map[w.packing_slip_number].push(w);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [warehouseStock]);

  return (
    <div className="space-y-4">
      {grouped.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium">No packing slips generated yet</p>
          <p className="text-sm text-muted-foreground mt-1">Packing slips are created when you transfer stock to the 3PL warehouse</p>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packing Slip #</TableHead>
                  <TableHead>Transfer Date</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total Bottles</TableHead>
                  <TableHead className="text-right">Total LALs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(([num, items]) => {
                  const totalBottles = items.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
                  const totalLALs = items.reduce((s, w) => s + (w.total_lals || 0), 0);
                  const transferDate = items[0]?.transfer_date || items[0]?.date_transferred_in;
                  return (
                    <TableRow key={num}>
                      <TableCell className="font-mono font-semibold text-sm">{num}</TableCell>
                      <TableCell className="text-sm">{transferDate ? format(new Date(transferDate), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-right text-sm">{items.length}</TableCell>
                      <TableCell className="text-right font-semibold text-sm">{totalBottles.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{totalLALs.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onPrintSlip(num)}>
                          <Printer className="w-3 h-3" /> Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}