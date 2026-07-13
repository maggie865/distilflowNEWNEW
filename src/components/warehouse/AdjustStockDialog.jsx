import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AdjustStockDialog({ open, onClose, record, onConfirm, pending }) {
  const [qty, setQty] = useState('');
  const [lals, setLals] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (record) {
      setQty(String(record.quantity_bottles ?? ''));
      setLals(String(record.total_lals ?? ''));
      setReason('');
    }
  }, [record]);

  const handleConfirm = () => {
    onConfirm(record, parseFloat(qty) || 0, parseFloat(lals) || 0, reason);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Product</Label>
            <p className="text-sm font-medium mt-1">{record?.product_name} — {record?.batch_number} ({record?.bottle_size_ml}ml)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quantity (bottles)</Label>
              <Input type="number" value={qty} onChange={e => setQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Total LALs</Label>
              <Input type="number" step="0.001" value={lals} onChange={e => setLals(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Reason for adjustment</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Stock count reconciliation, breakage, etc." className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={pending}>{pending ? 'Saving...' : 'Save Adjustment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}