/** @target_location src/components/dispatch/TransferTo3PLDialog.jsx */
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TransferTo3PLDialog({ open, onClose, finishedGoods = [], allDispatches = [] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState([{ fgId: '', qty: '' }]);

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
    .filter(g => g.available_bottles > 0)
    .sort((a, b) => `${a.product_name} ${a.batch_number}`.localeCompare(`${b.product_name} ${b.batch_number}`)),
    [finishedGoods, dispatchedByBatch]);

  // Track how many bottles of each fgId are already allocated across other rows
  const allocatedByFgId = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (r.fgId) map[r.fgId] = (map[r.fgId] || 0) + (parseInt(r.qty) || 0);
    });
    return map;
  }, [rows]);

  const getRowAvailable = (fgId) => {
    const fg = bluffStock.find(g => g.id === fgId);
    if (!fg) return 0;
    const allocated = allocatedByFgId[fgId] || 0;
    return Math.max(0, fg.available_bottles - allocated);
  };

  const addRow = () => setRows(prev => [...prev, { fgId: '', qty: '' }]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const validRows = rows.filter(r => r.fgId && parseInt(r.qty) > 0);
  const totalBottles = validRows.reduce((sum, r) => sum + (parseInt(r.qty) || 0), 0);
  const hasInvalid = rows.some(r => {
    if (!r.fgId) return false;
    const qty = parseInt(r.qty) || 0;
    if (qty <= 0) return true;
    return qty > getRowAvailable(r.fgId);
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (hasInvalid) throw new Error('Fix quantity errors before transferring');
      if (validRows.length === 0) throw new Error('Add at least one item to transfer');

      for (const row of validRows) {
        const fg = bluffStock.find(g => g.id === row.fgId);
        const transferQty = parseInt(row.qty);
        const lalsPerBottle = fg.available_bottles > 0 && fg.total_lals ? fg.total_lals / fg.quantity_bottles : 0;
        const transferLals = parseFloat((transferQty * lalsPerBottle).toFixed(4));

        await base44.entities.FinishedGood.update(fg.id, {
          quantity_bottles: fg.quantity_bottles - transferQty,
          total_lals: parseFloat(((fg.quantity_bottles - transferQty) * lalsPerBottle).toFixed(4)),
        });

        const existing = await base44.entities.WarehouseStock.filter({
          product_name: fg.product_name,
          batch_number: fg.batch_number,
          bottle_size_ml: fg.bottle_size_ml,
        });

        if (existing.length > 0) {
          const ws = existing[0];
          await base44.entities.WarehouseStock.update(ws.id, {
            quantity_bottles: (ws.quantity_bottles || 0) + transferQty,
            total_lals: parseFloat(((ws.total_lals || 0) + transferLals).toFixed(4)),
          });
        } else {
          await base44.entities.WarehouseStock.create({
            product_name: fg.product_name,
            batch_number: fg.batch_number,
            bottle_size_ml: fg.bottle_size_ml,
            abv_percent: fg.abv_percent,
            quantity_bottles: transferQty,
            total_lals: transferLals,
            date_transferred_in: new Date().toISOString().split('T')[0],
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatches-all'] });
      toast.success(`${totalBottles} bottles across ${validRows.length} batch(es) transferred to Auckland 3PL`);
      setRows([{ fgId: '', qty: '' }]);
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Transfer failed'),
  });

  const handleClose = () => {
    setRows([{ fgId: '', qty: '' }]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Transfer to Auckland 3PL</DialogTitle>
        </DialogHeader>

        {bluffStock.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No stock available at Bluff to transfer.</p>
        ) : (
          <>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {rows.map((row, idx) => {
                const fg = bluffStock.find(g => g.id === row.fgId);
                const available = fg ? getRowAvailable(fg.id) : 0;
                const qty = parseInt(row.qty) || 0;
                const isOver = fg && qty > available;
                const selectedIds = rows.map(r => r.fgId).filter(id => id);
                const availableOptions = bluffStock.filter(g => g.id === row.fgId || !selectedIds.includes(g.id));

                return (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      {idx === 0 && <Label className="text-xs">Batch & size</Label>}
                      <Select value={row.fgId} onValueChange={v => updateRow(idx, 'fgId', v)}>
                        <SelectTrigger className="text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {availableOptions.map(g => {
                            const avail = g.id === row.fgId ? g.available_bottles : getRowAvailable(g.id);
                            return (
                              <SelectItem key={g.id} value={g.id} disabled={g.id !== row.fgId && avail <= 0}>
                                {g.product_name} — {g.batch_number} ({g.bottle_size_ml}ml) · {avail} btls
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      {idx === 0 && <Label className="text-xs">Qty</Label>}
                      <Input type="number" min="0" value={row.qty} onChange={e => updateRow(idx, 'qty', e.target.value)} disabled={!row.fgId} className={isOver ? 'border-destructive' : ''} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(idx)} disabled={rows.length === 1} className="h-9 w-9 shrink-0">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={addRow} className="gap-1 text-xs">
                <Plus className="w-3 h-3" /> Add another batch
              </Button>
              <p className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{totalBottles} bottles</span></p>
            </div>

            {hasInvalid && <p className="text-xs text-destructive">One or more quantities exceed available stock.</p>}
          </>
        )}

        {bluffStock.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending || validRows.length === 0 || hasInvalid}>
              {transferMutation.isPending ? 'Transferring…' : `Transfer ${totalBottles} bottles`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}