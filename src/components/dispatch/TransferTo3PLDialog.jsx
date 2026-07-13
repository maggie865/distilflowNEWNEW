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

const BOTTLE_WEIGHT_KG = 1.2;

export default function TransferTo3PLDialog({ open, onClose, finishedGoods = [], allDispatches = [] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState([{ fgId: '', qty: '' }]);
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferDistance, setTransferDistance] = useState('1500');

  // quantity_bottles is already the correct post-dispatch figure — use directly
  const bluffStock = useMemo(() => finishedGoods
    .map(g => ({ ...g, available_bottles: g.quantity_bottles || 0 }))
    .filter(g => g.available_bottles > 0)
    .sort((a, b) => `${a.product_name} ${a.batch_number}`.localeCompare(`${b.product_name} ${b.batch_number}`)),
    [finishedGoods]);

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
  const transferCo2e = (() => {
    const weight = totalBottles * BOTTLE_WEIGHT_KG;
    const distance = parseFloat(transferDistance) || 0;
    if (weight <= 0 || distance <= 0) return 0;
    return weight / 1000 / 56 * distance * 0.21;
  })();
  const hasInvalid = rows.some(r => {
    if (!r.fgId) return false;
    const qty = parseInt(r.qty) || 0;
    if (qty <= 0) return true;
    const fg = bluffStock.find(g => g.id === r.fgId);
    if (!fg) return true;
    // Only subtract allocations from OTHER rows, not this row's own qty
    const allocatedByOthers = (allocatedByFgId[r.fgId] || 0) - qty;
    return qty > fg.available_bottles - allocatedByOthers;
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (hasInvalid) throw new Error('Fix quantity errors before transferring');
      if (validRows.length === 0) throw new Error('Add at least one item to transfer');

      // Generate packing slip number
      const allSettings = await base44.entities.AppSettings.list('-created_date', 5000);
      const lastNumSetting = allSettings.find(s => s.key === 'last_packing_slip_number');
      const lastNum = lastNumSetting ? parseInt(lastNumSetting.value) || 0 : 0;
      const newNum = lastNum + 1;
      const psYear = new Date().getFullYear();
      const packingSlipNumber = `PS-${psYear}-${String(newNum).padStart(4, '0')}`;

      for (const row of validRows) {
        const fg = bluffStock.find(g => g.id === row.fgId);
        const transferQty = parseInt(row.qty);
        const lalsPerBottle = fg.available_bottles > 0 && fg.total_lals ? fg.total_lals / fg.quantity_bottles : 0;
        const transferLals = parseFloat((transferQty * lalsPerBottle).toFixed(4));

        await base44.entities.FinishedGood.update(fg.id, {
          quantity_bottles: fg.quantity_bottles - transferQty,
          total_lals: parseFloat(((fg.quantity_bottles - transferQty) * lalsPerBottle).toFixed(4)),
        });

        const allWS = await base44.entities.WarehouseStock.list('-date_transferred_in', 5000);
        const existing = allWS.filter(w =>
          w.product_name === fg.product_name &&
          w.batch_number === fg.batch_number &&
          Number(w.bottle_size_ml) === Number(fg.bottle_size_ml)
        );

        const batchWeight = transferQty * BOTTLE_WEIGHT_KG;
        const batchCo2e = batchWeight / 1000 / 56 * parseFloat(transferDistance) * 0.21;
        if (existing.length > 0) {
          const ws = existing[0];
          await base44.entities.WarehouseStock.update(ws.id, {
            quantity_bottles: (ws.quantity_bottles || 0) + transferQty,
            total_lals: parseFloat(((ws.total_lals || 0) + transferLals).toFixed(4)),
            transfer_date: transferDate,
            co2e_kg: parseFloat(((ws.co2e_kg || 0) + batchCo2e).toFixed(3)),
            transport_distance_km: parseFloat(transferDistance),
            packing_slip_number: packingSlipNumber,
          });
        } else {
          await base44.entities.WarehouseStock.create({
            product_name: fg.product_name,
            batch_number: fg.batch_number,
            bottle_size_ml: fg.bottle_size_ml,
            abv_percent: fg.abv_percent,
            quantity_bottles: transferQty,
            total_lals: transferLals,
            date_transferred_in: transferDate,
            transfer_date: transferDate,
            co2e_kg: parseFloat(batchCo2e.toFixed(3)),
            transport_distance_km: parseFloat(transferDistance),
            packing_slip_number: packingSlipNumber,
          });
        }
      }

      // Save the new packing slip number back to AppSettings
      if (lastNumSetting) {
        await base44.entities.AppSettings.update(lastNumSetting.id, { value: String(newNum) });
      } else {
        await base44.entities.AppSettings.create({ key: 'last_packing_slip_number', value: String(newNum) });
      }

      return { packingSlipNumber };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatches-all'] });
      toast.success(`${totalBottles} bottles across ${validRows.length} batch(es) transferred to Auckland 3PL — Packing Slip ${data?.packingSlipNumber || ''}`);
      setRows([{ fgId: '', qty: '' }]);
      setTransferDate(() => new Date().toISOString().split('T')[0]);
      setTransferDistance('1500');
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Transfer failed'),
  });

  const handleClose = () => {
    setRows([{ fgId: '', qty: '' }]);
    setTransferDate(() => new Date().toISOString().split('T')[0]);
    setTransferDistance('1500');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Transfer to Auckland 3PL</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-xs">Transfer Date</Label>
          <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Distance (km)</Label>
            <Input type="number" step="1" value={transferDistance} onChange={e => setTransferDistance(e.target.value)} className="text-sm" placeholder="1500" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CO2e (kg)</Label>
            <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold text-blue-600">
              {transferCo2e > 0 ? `${transferCo2e.toFixed(3)} kg` : '—'}
            </div>
          </div>
        </div>

        {bluffStock.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No stock available at Bluff to transfer.</p>
        ) : (
          <>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {rows.map((row, idx) => {
                const fg = bluffStock.find(g => g.id === row.fgId);
                const allocatedByOthers = fg ? (allocatedByFgId[fg.id] || 0) - (parseInt(row.qty) || 0) : 0;
                const available = fg ? Math.max(0, fg.available_bottles - allocatedByOthers) : 0;
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