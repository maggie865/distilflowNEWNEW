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
  source_distillation_ids: [],
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
  const [selectedRuns, setSelectedRuns] = useState([]);
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

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 200),
  });

  // Filter for runs with heads/tails available
  const availableHeadsAndTails = distillationRuns.filter(r => 
    (r.heads_volume > 0 || r.tails_volume > 0) && r.status === 'completed'
  );

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setSelectedRuns([]);
    setOpen(true);
  };

  const addRunToSelection = (runId) => {
    if (selectedRuns.includes(runId)) return;
    const run = distillationRuns.find(r => r.id === runId);
    if (!run) return;
    
    setSelectedRuns([...selectedRuns, runId]);
    
    // Auto-calculate total input volume and ABV from selected runs
    const newSelected = [...selectedRuns, runId];
    const headsAndTails = newSelected.map(id => {
      const r = distillationRuns.find(x => x.id === id);
      return {
        heads_vol: r.heads_volume || 0,
        heads_abv: r.heads_abv || 0,
        tails_vol: r.tails_volume || 0,
        tails_abv: r.tails_abv || 0,
      };
    });

    const totalVol = headsAndTails.reduce((s, h) => s + h.heads_vol + h.tails_vol, 0);
    const totalLals = headsAndTails.reduce((s, h) => 
      s + (h.heads_vol * h.heads_abv / 100) + (h.tails_vol * h.tails_abv / 100), 0
    );
    const avgAbv = totalVol > 0 ? (totalLals / totalVol * 100).toFixed(2) : 0;

    setForm(prev => ({
      ...prev,
      input_volume: totalVol.toFixed(2),
      input_abv: avgAbv,
    }));
  };

  const removeRunFromSelection = (runId) => {
    const newSelected = selectedRuns.filter(id => id !== runId);
    setSelectedRuns(newSelected);

    if (newSelected.length === 0) {
      setForm(prev => ({ ...prev, input_volume: '', input_abv: '' }));
      return;
    }

    const headsAndTails = newSelected.map(id => {
      const r = distillationRuns.find(x => x.id === id);
      return {
        heads_vol: r.heads_volume || 0,
        heads_abv: r.heads_abv || 0,
        tails_vol: r.tails_volume || 0,
        tails_abv: r.tails_abv || 0,
      };
    });

    const totalVol = headsAndTails.reduce((s, h) => s + h.heads_vol + h.tails_vol, 0);
    const totalLals = headsAndTails.reduce((s, h) => 
      s + (h.heads_vol * h.heads_abv / 100) + (h.tails_vol * h.tails_abv / 100), 0
    );
    const avgAbv = totalVol > 0 ? (totalLals / totalVol * 100).toFixed(2) : 0;

    setForm(prev => ({
      ...prev,
      input_volume: totalVol.toFixed(2),
      input_abv: avgAbv,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.input_volume || !form.output_volume || selectedRuns.length === 0) {
      toast.error('Please fill in all required fields and select at least one run');
      return;
    }

    const payload = {
      date: form.date,
      source_distillation_ids: selectedRuns,
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
      
      toast.success('SNS run recorded and output stored in inventory');
    }

    queryClient.invalidateQueries({ queryKey: ['snsRuns'] });
    queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
    setOpen(false);
    setForm(BLANK_FORM);
    setSelectedRuns([]);
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="SNS Distillation" subtitle="Heads + Tails Stripping for high ABV ethanol regeneration">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          New SNS Run
        </Button>
      </PageHeader>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditingId(null); setForm(BLANK_FORM); setSelectedRuns([]); } }}>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select source runs</p>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Add a distillation run..." />
                </SelectTrigger>
                <SelectContent>
                  {availableHeadsAndTails.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No runs with heads/tails available</div>
                  ) : availableHeadsAndTails.map(r => (
                    <SelectItem 
                      key={r.id} 
                      value={r.id}
                      onSelect={() => addRunToSelection(r.id)}
                    >
                      {r.batch_number} (Heads: {r.heads_volume}L, Tails: {r.tails_volume}L)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedRuns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Selected runs ({selectedRuns.length}):</p>
                  <div className="space-y-1.5">
                    {selectedRuns.map(runId => {
                      const run = distillationRuns.find(r => r.id === runId);
                      return (
                        <div key={runId} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2">
                          <div className="text-sm">
                            <p className="font-medium text-blue-900">{run?.batch_number}</p>
                            <p className="text-xs text-blue-700">
                              Heads: {run?.heads_volume}L @ {run?.heads_abv}% | Tails: {run?.tails_volume}L @ {run?.tails_abv}%
                            </p>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm"
                            onClick={() => removeRunFromSelection(runId)}
                            className="text-destructive hover:text-destructive"
                          >
                            x
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
                <TableHead>Runs Stripped</TableHead>
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
                return (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">{run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">{run.source_distillation_ids?.length || 0}</TableCell>
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