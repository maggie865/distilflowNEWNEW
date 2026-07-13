import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StockLocationDialog({ location, finishedGoods = [], warehouseStock = [], onClose, onTransfer }) {
  const isBluff = location === 'Bluff';
  const stock = useMemo(() => {
    if (isBluff) {
      return finishedGoods
        .filter(fg => (fg.quantity_bottles || 0) > 0)
        .map(fg => ({
          product_name: fg.product_name,
          batch_number: fg.batch_number,
          bottle_size_ml: fg.bottle_size_ml,
          abv_percent: fg.abv_percent,
          quantity_bottles: fg.quantity_bottles || 0,
          total_lals: fg.total_lals || 0,
          _fgId: fg.id,
        }))
        .sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
    }
    return warehouseStock
      .filter(ws => (ws.quantity_bottles || 0) > 0)
      .map(ws => ({
        product_name: ws.product_name,
        batch_number: ws.batch_number,
        bottle_size_ml: ws.bottle_size_ml,
        abv_percent: ws.abv_percent,
        quantity_bottles: ws.quantity_bottles || 0,
        total_lals: ws.total_lals || 0,
        transfer_date: ws.transfer_date,
      }))
      .sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
  }, [isBluff, finishedGoods, warehouseStock]);

  const totalBottles = stock.reduce((s, r) => s + (r.quantity_bottles || 0), 0);
  const totalLals = stock.reduce((s, r) => s + (r.total_lals || 0), 0);

  // Group by product
  const productGroups = useMemo(() => {
    const map = {};
    for (const s of stock) {
      const key = s.product_name || 'Unknown';
      if (!map[key]) map[key] = { product_name: key, batches: [], totalBottles: 0, totalLals: 0 };
      map[key].batches.push(s);
      map[key].totalBottles += s.quantity_bottles;
      map[key].totalLals += s.total_lals;
    }
    return Object.values(map).sort((a, b) => b.totalBottles - a.totalBottles);
  }, [stock]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4" />
            {isBluff ? 'Bluff Distillery' : 'Auckland 3PL'} — Stock on Hand
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 mb-4 text-sm">
          <div className="rounded-lg bg-accent/30 px-4 py-2">
            <p className="text-xs text-muted-foreground">Total Bottles</p>
            <p className="text-xl font-bold font-display text-primary">{totalBottles.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-accent/30 px-4 py-2">
            <p className="text-xs text-muted-foreground">Total LALs</p>
            <p className="text-xl font-bold font-display text-primary">{totalLals.toFixed(2)}</p>
          </div>
        </div>

        {stock.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No stock at this location.</p>
        ) : (
          <div className="space-y-4">
            {productGroups.map(group => (
              <div key={group.product_name} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                  <span className="font-semibold text-sm">{group.product_name}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{group.totalBottles.toLocaleString()} bottles</span>
                    <span>{group.totalLals.toFixed(2)} LALs</span>
                    <span>{group.batches.length} batch{group.batches.length !== 1 ? 'es' : ''}</span>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Batch</TableHead>
                      <TableHead className="text-xs">Size</TableHead>
                      <TableHead className="text-xs">ABV</TableHead>
                      <TableHead className="text-xs text-right">Bottles</TableHead>
                      <TableHead className="text-xs text-right">LALs</TableHead>
                      {!isBluff && <TableHead className="text-xs">Transferred</TableHead>}
                      {isBluff && <TableHead className="text-xs"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.batches.map((b, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{b.batch_number || '—'}</TableCell>
                        <TableCell className="text-xs">{b.bottle_size_ml ? `${b.bottle_size_ml}ml` : '—'}</TableCell>
                        <TableCell className="text-xs">{b.abv_percent ? `${b.abv_percent}%` : '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">{b.quantity_bottles.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs">{(b.total_lals || 0).toFixed(3)}</TableCell>
                        {!isBluff && (
                          <TableCell className="text-xs text-muted-foreground">{b.transfer_date || '—'}</TableCell>
                        )}
                        {isBluff && (
                          <TableCell className="text-right">
                            {b.quantity_bottles > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 h-7 text-xs"
                                onClick={() => onTransfer(b)}
                              >
                                <ArrowRightLeft className="w-3 h-3" /> Transfer
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}