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
  destination_tank_id: '',
  input_volume: '',
  input_abv: '',
  input_lals: '',
  hearts_volume: '',
  hearts_abv: '',
  hearts_lals: '',
  dumped_volume: '',
  dumped_abv: '',
  dumped_notes: '',
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

  // Tanks with heads/tails content (IBC tanks designated for heads & tails)
  const headsAndTailsTanks = tanks.filter(t => 
    t.purpose === 'ibc' && t.status === 'in_use' && t.current_volume > 0
  );

  // SNS storage tanks available for destination
  const snsTanks = tanks.filter(t => t.purpose === 'sns');

  const selectedTank = tanks.find(t => t.id === form.source_tank_id);
  const destinationTank = tanks.find(t => t.id === form.destination_tank_id);

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

  const calculateInputLals = () => {
    if (form.input_volume && form.input_abv) {
      return ((parseFloat(form.input_volume) * parseFloat(form.input_abv)) / 100).toFixed(3);
    }
    return '—';
  };

  const calculateHeartsLals = () => {
    if (form.hearts_volume && form.hearts_abv) {
      return ((parseFloat(form.hearts_volume) * parseFloat(form.hearts_abv)) / 100).toFixed(3);
    }
    return '—';
  };

  const calculateDumpedLals = () => {
    if (form.dumped_volume && form.dumped_abv) {
      return ((parseFloat(form.dumped_volume) * parseFloat(form.dumped_abv)) / 100).toFixed(3);
    }
    return '—';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.source_tank_id || !form.hearts_volume || !form.hearts_abv) {
      toast.error('Please fill in all required fields');
      return;
    }

    const payload = {
      date: form.date,
      source_tank_id: form.source_tank_id,
      input_volume: parseFloat(form.input_volume),
      input_abv: parseFloat(form.input_abv),
      hearts_volume: parseFloat(form.hearts_volume),
      hearts_abv: parseFloat(form.hearts_abv),
      hearts_lals: parseFloat(form.hearts_volume) * parseFloat(form.hearts_abv) / 100,
      dumped_volume: form.dumped_volume ? parseFloat(form.dumped_volume) : 0,
      dumped_abv: form.dumped_abv ? parseFloat(form.dumped_abv) : 0,
      dumped_lals: form.dumped_volume && form.dumped_abv ? parseFloat(form.dumped_volume) * parseFloat(form.dumped_abv) / 100 : 0,
      dumped_notes: form.dumped_notes,
      status: form.status,
      notes: form.notes,
    };

    if (editingId) {
      await base44.entities.SNSRun.update(editingId, payload);
      toast.success('SNS run updated');
    } else {
      await base44.entities.SNSRun.create(payload);
      
      // Transfer hearts to destination tank if specified
      if (form.destination_tank_id) {
        const destTank = tanks.find(t => t.id === form.destination_tank_id);
        if (destTank) {
          const newVolume = Math.min((destTank.current_volume || 0) + parseFloat(form.hearts_volume), destTank.capacity_litres);
          await base44.entities.StorageTank.update(form.destination_tank_id, {
            current_volume: newVolume,
            current_abv: parseFloat(form.hearts_abv),
            current_product: 'High ABV Ethanol (SNS)',
            status: 'in_use',
          });
        }
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
      
      toast.success('SNS run recorded');
    }

    queryClient.invalidateQueries({ queryKey: ['snsRuns'] });
    queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source tank (heads and tails)</p>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination tank (SNS storage)</p>
              <Select value={form.destination_tank_id} onValueChange={v => set('destination_tank_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose destination tank..." />
                </SelectTrigger>
                <SelectContent>
                  {snsTanks.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No SNS tanks available</div>
                  ) : snsTanks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      Tank {t.name} — {t.capacity_litres}L capacity {t.status === 'empty' ? '(empty)' : `(${t.current_volume}L in use)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {destinationTank && form.output_volume && (
                <p className="text-xs text-primary font-medium">
                  Tank {destinationTank.name} → {Math.min((destinationTank.current_volume || 0) + parseFloat(form.output_volume), destinationTank.capacity_litres).toFixed(1)}L / {destinationTank.capacity_litres}L
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input totals</p>
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  <Label className="flex items-center gap-1">Input LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold">
                    {calculateInputLals()}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hearts (collected)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Hearts Volume (L) *</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={form.hearts_volume} 
                    onChange={e => set('hearts_volume', e.target.value)} 
                    required
                    placeholder="e.g. 45"
                  />
                </div>
                <div>
                  <Label>Hearts ABV % *</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={form.hearts_abv} 
                    onChange={e => set('hearts_abv', e.target.value)} 
                    required
                    placeholder="e.g. 94"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">Hearts LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold text-primary">
                    {calculateHeartsLals()}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dumped / Discarded</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Dumped Volume (L)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    value={form.dumped_volume} 
                    onChange={e => set('dumped_volume', e.target.value)} 
                    placeholder="e.g. 10"
                  />
                </div>
                <div>
                  <Label>Dumped ABV %</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    value={form.dumped_abv} 
                    onChange={e => set('dumped_abv', e.target.value)} 
                    placeholder="e.g. 50"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">Dumped LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-semibold">
                    {calculateDumpedLals()}
                  </div>
                </div>
              </div>
              <div>
                <Label>Dump Notes</Label>
                <Input 
                  value={form.dumped_notes} 
                  onChange={e => set('dumped_notes', e.target.value)} 
                  placeholder="e.g. Remaining still heads"
                />
              </div>
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
                <TableHead>Hearts Vol (L)</TableHead>
                <TableHead>Hearts ABV</TableHead>
                <TableHead>Hearts LALs</TableHead>
                <TableHead>Dumped Vol (L)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snsRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No SNS runs recorded</TableCell>
                </TableRow>
              ) : snsRuns.map(run => {
                const heartsLals = (run.hearts_volume * run.hearts_abv) / 100;
                const sourceTank = tanks.find(t => t.id === run.source_tank_id);
                return (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">{run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">Tank {sourceTank?.name || '—'}</TableCell>
                    <TableCell className="text-sm">{run.input_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{run.input_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-semibold">{run.hearts_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm font-semibold">{run.hearts_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-semibold">{heartsLals.toFixed(3)}</TableCell>
                    <TableCell className="text-sm">{run.dumped_volume?.toFixed(2) || '—'}</TableCell>
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