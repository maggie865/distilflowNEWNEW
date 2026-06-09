import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

const BLANK_FORM = {
  date: new Date().toISOString().split('T')[0],
  source_tank_id: '',
  input_volume: '',
  input_abv: '',
  output_volume: '',
  output_abv: '',
  status: 'completed',
  notes: '',
};

export default function SNSDistillation() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const queryClient = useQueryClient();

  const { data: snsRuns = [] } = useQuery({
    queryKey: ['snsRuns'],
    queryFn: async () => {
      try {
        return await base44.entities.SNSRun.list('-date', 50);
      } catch {
        return [];
      }
    },
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 50),
  });

  // Tanks with heads/tails content (maceration tanks with product)
  const headsAndTailsTanks = tanks.filter(t => 
    t.purpose === 'maceration_dilution' && t.status === 'in_use' && t.current_volume > 0
  );

  const selectedTank = tanks.find(t => t.id === form.source_tank_id);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setOpen(true);
  };

  const handleTankChange = (tankId) => {
    set('source_tank_id', tankId);
    const tank = tanks.find(t => t.id === tankId);
    if (tank) {
      set('input_volume', tank.current_volume?.toString() || '');
      set('input_abv', tank.current_abv?.toString() || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.source_tank_id || !form.output_volume || !form.output_abv) {
      toast.error('Please fill in all required fields');
      return;
    }

    const payload = {
      date: form.date,
      source_tank_id: form.source_tank_id,
      input_volume: parseFloat(form.input_volume),
      input_abv: parseFloat(form.input_abv),
      output_volume: parseFloat(form.output_volume),
      output_abv: parseFloat(form.output_abv),
      status: form.status,
      notes: form.notes,
    };

    if (editingId) {
      await base44.entities.SNSRun.update(editingId, payload);
      toast.success('SNS run updated');
    } else {
      await base44.entities.SNSRun.create(payload);
      
      // Auto-add the output to RawMaterial as high ABV ethanol
      const outputLals = (parseFloat(form.output_volume) * parseFloat(form.output_abv)) / 100;
      const existing = await base44.entities.RawMaterial.filter({ 
        name: 'High ABV Ethanol (SNS)' 
      });
      
      if (existing.length > 0) {
        const mat = existing[0];
        await base44.entities.RawMaterial.update(mat.id, {
          quantity: (mat.quantity || 0) + parseFloat(form.output_volume),
          lals: (mat.lals || 0) + outputLals,
        });
      } else {
        await base44.entities.RawMaterial.create({
          name: 'High ABV Ethanol (SNS)',
          type: 'ethanol',
          quantity: parseFloat(form.output_volume),
          unit: 'litres',
          abv_percent: parseFloat(form.output_abv),
          lals: outputLals,
          notes: 'Regenerated from SNS distillation of heads and tails',
        });
      }
      
      // Clear the source tank after completion
      if (selectedTank) {
        await base44.entities.StorageTank.update(form.source_tank_id, {
          current_volume: 0,
          current_abv: 0,
          current_product: '',
          status: 'empty',
        });
      }
      
      toast.success('SNS run recorded and output stored in inventory');
    }

    queryClient.invalidateQueries({ queryKey: ['snsRuns'] });
    queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
    queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
    setOpen(false);
    setForm(BLANK_FORM);
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="SNS Distillation" subtitle="Heads + Tails Stripping for high ABV ethanol regeneration">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New SNS Run
        </Button>
      </PageHeader>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditingId(null); setForm(BLANK_FORM); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">SNS Distillation Run</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select tank with heads and tails</p>
              <Select value={form.source_tank_id} onValueChange={handleTankChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a tank..." />
                </SelectTrigger>
                <SelectContent>
                  {headsAndTailsTanks.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No tanks available</div>
                  ) : headsAndTailsTanks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      Tank {t.name} — {t.current_volume}L @ {t.current_abv}% ({t.current_product})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input totals</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1">Input Volume (L) <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold">
                    {form.input_volume || '—'}
                  </div>
                </div>
                <div>
                  <Label className="flex items-center gap-1">Input ABV % <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold">
                    {form.input_abv || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output high ABV ethanol</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Output Volume (L) *</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={form.output_volume} 
                    onChange={e => set('output_volume', e.target.value)} 
                    required
                    placeholder="e.g. 45"
                  />
                </div>
                <div>
                  <Label>Output ABV % *</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={form.output_abv} 
                    onChange={e => set('output_abv', e.target.value)} 
                    required
                    placeholder="e.g. 94"
                  />
                </div>
              </div>
              {form.output_volume && form.output_abv && (
                <p className="text-xs text-primary font-medium flex items-center gap-1">
                  <Calculator className="w-3 h-3" />
                  LALs: {((parseFloat(form.output_volume) * parseFloat(form.output_abv)) / 100).toFixed(3)}
                </p>
              )}
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            <Button type="submit" className="w-full">
              {editingId ? 'Update SNS Run' : 'Record SNS Run'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source Tank</TableHead>
                <TableHead>Input Vol (L)</TableHead>
                <TableHead>Input ABV</TableHead>
                <TableHead>Output Vol (L)</TableHead>
                <TableHead>Output ABV</TableHead>
                <TableHead>Output LALs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snsRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No SNS runs recorded</TableCell>
                </TableRow>
              ) : snsRuns.map(run => {
               const outputLals = (run.output_volume * run.output_abv) / 100;
               const sourceTank = tanks.find(t => t.id === run.source_tank_id);
               return (
                 <TableRow key={run.id}>
                   <TableCell className="text-sm">{run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}</TableCell>
                   <TableCell className="text-sm">Tank {sourceTank?.name || '—'}</TableCell>
                    <TableCell className="text-sm">{run.input_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{run.input_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-semibold">{run.output_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-semibold">{run.output_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-semibold">{outputLals.toFixed(3)}</TableCell>
                    <TableCell><StatusBadge status={run.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}