import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function TransferTo3PLDialog({ open, onClose, finishedGoods = [], allDispatches = [] }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState('');

  // Build dispatched totals per product+batch+bottle_size — only Bluff dispatches reduce Bluff stock
  const dispatchedByBatch = useMemo(() => {
    const map = {};
    allDispatches.forEach(d => {
      const isBluff = !(d.dispatched_from || '').includes('Auckland');
      if (!isBluff) return;
      const key = `${d.batch_number}||${d.product_name}||${d.bottle_size_ml || 'unknown'}`;
      map[key] = (map[key] || 0) + (d.quantity_bottles || 0);
    });
    return map;
  }, [allDispatches]);

  // Compute net available stock at Bluff: bottled - dispatched from Bluff
  const bluffStock = useMemo(() => finishedGoods
    .map(g => {
      const key = `${g.batch_number}||${g.product_name}||${g.bottle_size_ml || 'unknown'}`;
      const dispatched = dispatchedByBatch[key] || 0;
      const bottled = g.quantity_bottles || 0;
      const remaining = Math.max(0, bottled - dispatched);
      const lalsPerBottle = bottled > 0 && g.total_lals ? g.total_lals / bottled : 0;
      return { ...g, available_bottles: remaining, available_lals: parseFloat((remaining * lalsPerBottle).toFixed(4)) };
    })
    .filter(g => g.available_bottles > 0),
    [finishedGoods, dispatchedByBatch]);

  const selected = bluffStock.find(g => g.id === selectedId);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const transferQty = parseInt(qty);
      if (!selected) throw new Error('Select a product to transfer');
      if (!transferQty || transferQty <= 0) throw new Error('Enter a valid quantity');
      if (transferQty > selected.available_bottles) throw new Error('Cannot transfer more than available stock');

      const lalsPerBottle = selected.available_bottles > 0 && selected.available_lals ? selected.available_lals / selected.available_bottles : 0;
      const transferLals = parseFloat((transferQty * lalsPerBottle).toFixed(4));

      await base44.entities.FinishedGood.update(selected.id, {
        quantity_bottles: selected.quantity_bottles - transferQty,
        total_lals: parseFloat(((selected.quantity_bottles - transferQty) * (selected.quantity_bottles > 0 && selected.total_lals ? selected.total_lals / selected.quantity_bottles : 0)).toFixed(4)),
      });

      const existing = await base44.entities.WarehouseStock.filter({
        product_name: selected.product_name,
        batch_number: selected.batch_number,
        bottle_size_ml: selected.bottle_size_ml,
      });

      if (existing.length > 0) {
        const ws = existing[0];
        await base44.entities.WarehouseStock.update(ws.id, {
          quantity_bottles: (ws.quantity_bottles || 0) + transferQty,
          total_lals: parseFloat(((ws.total_lals || 0) + transferLals).toFixed(4)),
        });
      } else {
        await base44.entities.WarehouseStock.create({
          product_name: selected.product_name,
          batch_number: selected.batch_number,
          bottle_size_ml: selected.bottle_size_ml,
          abv_percent: selected.abv_percent,
          quantity_bottles: transferQty,
          total_lals: transferLals,
          date_transferred_in: new Date().toISOString().split('T')[0],
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatches-all'] });
      toast.success(`${qty} bottles transferred to Auckland 3PL`);
      setSelectedId('');
      setQty('');
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Transfer failed'),
  });

  const handleClose = () => {
    setSelectedId('');
    setQty('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Transfer to Auckland 3PL</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {bluffStock.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No stock available at Bluff to transfer.</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Select stock at Bluff</Label>
                <Select value={selectedId} onValueChange={v => { setSelectedId(v); setQty(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select product & batch…" /></SelectTrigger>
                  <SelectContent>
                    {bluffStock.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.product_name} — {g.batch_number} ({g.bottle_size_ml}ml) · {g.available_bottles} btls
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selected && (
                <>
                  <p className="text-sm text-muted-foreground">Available: <span className="font-semibold text-foreground">{selected.available_bottles} bottles</span></p>
                  <div className="space-y-1">
                    <Label>Quantity to transfer</Label>
                    <Input type="number" min="1" max={selected.available_bottles} value={qty} onChange={e => setQty(e.target.value)} placeholder="Enter number of bottles" />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {bluffStock.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending || !selectedId || !qty}>
              {transferMutation.isPending ? 'Transferring…' : 'Transfer'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}