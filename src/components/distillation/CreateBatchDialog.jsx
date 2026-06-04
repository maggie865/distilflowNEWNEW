import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const BLANK_MASTER = {
  batch_code: '',
  product_name: '',
  date_started: new Date().toISOString().split('T')[0],
  target_volume: '',
  target_abv: '',
  notes: '',
};

const blankSubBatch = (masterCode, index) => ({
  sub_batch_code: masterCode ? `${masterCode.toUpperCase()}-R${index}` : `R${index}`,
  date: new Date().toISOString().split('T')[0],
  ethanol_lot: '',
  botanical_lots: '',
  input_volume: '',
  input_abv: '',
  maceration_date: '',
  maceration_notes: '',
  status: 'planned',
  notes: '',
});

export default function CreateBatchDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(BLANK_MASTER);
  const [subBatches, setSubBatches] = useState([]);
  const queryClient = useQueryClient();

  const set = (field, value) => {
    setForm(p => {
      const updated = { ...p, [field]: value };
      // Auto-update sub-batch codes when master code changes
      if (field === 'batch_code') {
        setSubBatches(prev => prev.map((sb, i) => ({
          ...sb,
          sub_batch_code: `${value.toUpperCase()}-R${i + 1}`,
        })));
      }
      return updated;
    });
  };

  const addSubBatch = () => {
    setSubBatches(prev => [...prev, blankSubBatch(form.batch_code, prev.length + 1)]);
  };

  const removeSubBatch = (index) => {
    setSubBatches(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Re-number codes
      return updated.map((sb, i) => ({
        ...sb,
        sub_batch_code: `${form.batch_code.toUpperCase()}-R${i + 1}`,
      }));
    });
  };

  const setSub = (index, field, value) => {
    setSubBatches(prev => prev.map((sb, i) => i === index ? { ...sb, [field]: value } : sb));
  };

  const mutation = useMutation({
    mutationFn: async (data) => {
      const master = await base44.entities.MasterBatch.create({
        batch_code: data.form.batch_code.toUpperCase(),
        product_name: data.form.product_name,
        date_started: data.form.date_started,
        status: 'in_progress',
        target_volume: data.form.target_volume ? parseFloat(data.form.target_volume) : undefined,
        target_abv: data.form.target_abv ? parseFloat(data.form.target_abv) : undefined,
        notes: data.form.notes,
      });

      for (const sb of data.subBatches) {
        await base44.entities.SubBatch.create({
          master_batch_id: master.id,
          master_batch_code: master.batch_code,
          sub_batch_code: sb.sub_batch_code,
          date: sb.date || undefined,
          ethanol_lot: sb.ethanol_lot || undefined,
          botanical_lots: sb.botanical_lots || undefined,
          input_volume: sb.input_volume ? parseFloat(sb.input_volume) : undefined,
          input_abv: sb.input_abv ? parseFloat(sb.input_abv) : undefined,
          maceration_date: sb.maceration_date || undefined,
          maceration_notes: sb.maceration_notes || undefined,
          status: sb.status,
          notes: sb.notes || undefined,
        });
      }

      return master;
    },
    onSuccess: (master) => {
      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      queryClient.invalidateQueries({ queryKey: ['subBatches'] });
      toast.success(`Batch ${master.batch_code} created${subBatches.length > 0 ? ` with ${subBatches.length} sub-batch${subBatches.length > 1 ? 'es' : ''}` : ''}`);
      onCreated?.(master);
      onOpenChange(false);
      setForm(BLANK_MASTER);
      setSubBatches([]);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) { setForm(BLANK_MASTER); setSubBatches([]); }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Create New Batch</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={e => { e.preventDefault(); mutation.mutate({ form, subBatches }); }}
          className="space-y-5 mt-2"
        >
          {/* Master Batch Details */}
          <div className="rounded-lg border border-border p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Master Batch</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Batch Code</Label>
                <Input
                  value={form.batch_code}
                  onChange={e => set('batch_code', e.target.value)}
                  placeholder="e.g. GIN-001"
                  required
                />
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
              <div className="col-span-2">
                <Label>Product Name</Label>
                <Input
                  value={form.product_name}
                  onChange={e => set('product_name', e.target.value)}
                  placeholder="e.g. London Dry Gin"
                  required
                />
              </div>
              <div>
                <Label>Target Volume (L)</Label>
                <Input type="number" step="1" value={form.target_volume} onChange={e => set('target_volume', e.target.value)} placeholder="e.g. 500" />
              </div>
              <div>
                <Label>Target ABV %</Label>
                <Input type="number" step="0.1" value={form.target_abv} onChange={e => set('target_abv', e.target.value)} placeholder="e.g. 40" />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes…" />
              </div>
            </div>
          </div>

          {/* Sub Batches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sub-Batches / Runs ({subBatches.length})
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addSubBatch}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add Sub-Batch
              </Button>
            </div>

            {subBatches.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
                No sub-batches yet — click "Add Sub-Batch" to plan individual distillation runs under this master batch.
              </p>
            )}

            {subBatches.map((sb, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-primary" />
                    <span className="font-mono font-semibold text-sm">{sb.sub_batch_code || `Run ${i + 1}`}</span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeSubBatch(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Sub-Batch Code</Label>
                    <Input value={sb.sub_batch_code} onChange={e => setSub(i, 'sub_batch_code', e.target.value)} placeholder={`${form.batch_code || 'GIN-001'}-R${i + 1}`} />
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={sb.date} onChange={e => setSub(i, 'date', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Ethanol Lot #</Label>
                    <Input value={sb.ethanol_lot} onChange={e => setSub(i, 'ethanol_lot', e.target.value)} placeholder="Supplier lot number" />
                  </div>
                  <div>
                    <Label className="text-xs">Botanical Lot(s)</Label>
                    <Input value={sb.botanical_lots} onChange={e => setSub(i, 'botanical_lots', e.target.value)} placeholder="e.g. BOT-12, BOT-13" />
                  </div>
                  <div>
                    <Label className="text-xs">Input Volume (L)</Label>
                    <Input type="number" step="0.01" value={sb.input_volume} onChange={e => setSub(i, 'input_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Input ABV %</Label>
                    <Input type="number" step="0.1" value={sb.input_abv} onChange={e => setSub(i, 'input_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Maceration Date</Label>
                    <Input type="date" value={sb.maceration_date} onChange={e => setSub(i, 'maceration_date', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={sb.status}
                      onChange={e => setSub(i, 'status', e.target.value)}
                    >
                      <option value="planned">Planned</option>
                      <option value="macerating">Macerating</option>
                      <option value="distilling">Distilling</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Maceration Notes (botanicals, quantities, observations)</Label>
                    <Textarea rows={2} value={sb.maceration_notes} onChange={e => setSub(i, 'maceration_notes', e.target.value)} placeholder="e.g. Juniper 200g, Coriander 80g, Angelica 30g…" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Input value={sb.notes} onChange={e => setSub(i, 'notes', e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : `Create Batch${subBatches.length > 0 ? ` + ${subBatches.length} Sub-Batch${subBatches.length > 1 ? 'es' : ''}` : ''}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}