import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const BLANK = {
  batch_code: '',
  product_name: '',
  date_started: new Date().toISOString().split('T')[0],
  target_volume: '',
  target_abv: '',
  notes: '',
};

export default function CreateBatchDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(BLANK);
  const queryClient = useQueryClient();

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.MasterBatch.create({
      batch_code: data.batch_code.toUpperCase(),
      product_name: data.product_name,
      date_started: data.date_started,
      status: 'in_progress', // default on create
      target_volume: data.target_volume ? parseFloat(data.target_volume) : undefined,
      target_abv: data.target_abv ? parseFloat(data.target_abv) : undefined,
      notes: data.notes,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      toast.success(`Batch ${created.batch_code} created`);
      onCreated?.(created);
      onOpenChange(false);
      setForm(BLANK);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Create New Batch</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}
          className="space-y-4 mt-2"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Master Batch Code</Label>
              <Input
                value={form.batch_code}
                onChange={e => set('batch_code', e.target.value)}
                placeholder="e.g. GIN-001"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sub-runs use GIN-001-R1, GIN-001-R2 etc.
              </p>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.date_started}
                onChange={e => set('date_started', e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label>Product Name</Label>
            <Input
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              placeholder="e.g. London Dry Gin"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Target Volume (L)</Label>
              <Input
                type="number" step="1"
                value={form.target_volume}
                onChange={e => set('target_volume', e.target.value)}
                placeholder="e.g. 500"
              />
            </div>
            <div>
              <Label>Target ABV %</Label>
              <Input
                type="number" step="0.1"
                value={form.target_abv}
                onChange={e => set('target_abv', e.target.value)}
                placeholder="e.g. 40"
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…"
            />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Batch'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}