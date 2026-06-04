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
import { Plus, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

export default function Distillation() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    batch_number: '', date: new Date().toISOString().split('T')[0],
    product_name: '', input_volume: '', input_abv: '',
    output_volume: '', output_abv: '',
    heads_volume: '', tails_volume: '',
    status: 'completed', notes: ''
  });
  const queryClient = useQueryClient();

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 50),
  });

  const inputLALs = form.input_volume && form.input_abv
    ? parseFloat(form.input_volume) * parseFloat(form.input_abv) / 100 : 0;
  const outputLALs = form.output_volume && form.output_abv
    ? parseFloat(form.output_volume) * parseFloat(form.output_abv) / 100 : 0;

  const createMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.DistillationRun.create({
        ...data,
        input_volume: parseFloat(data.input_volume) || 0,
        input_abv: parseFloat(data.input_abv) || 0,
        input_lals: parseFloat(inputLALs.toFixed(4)),
        output_volume: parseFloat(data.output_volume) || 0,
        output_abv: parseFloat(data.output_abv) || 0,
        output_lals: parseFloat(outputLALs.toFixed(4)),
        heads_volume: parseFloat(data.heads_volume) || 0,
        tails_volume: parseFloat(data.tails_volume) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      setOpen(false);
      setForm({
        batch_number: '', date: new Date().toISOString().split('T')[0],
        product_name: '', input_volume: '', input_abv: '',
        output_volume: '', output_abv: '',
        heads_volume: '', tails_volume: '',
        status: 'completed', notes: ''
      });
      toast.success('Distillation run recorded');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Distillation" subtitle="Manage distillation runs">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Run</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Record Distillation Run</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch Number</Label>
                  <Input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} required />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
                </div>
                <div className="col-span-2">
                  <Label>Product Name</Label>
                  <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} required />
                </div>
              </div>

              {/* Input section */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.input_volume} onChange={e => set('input_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label>ABV %</Label>
                    <Input type="number" step="0.1" value={form.input_abv} onChange={e => set('input_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      LALs <Calculator className="w-3 h-3 text-primary" />
                    </Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold transition-colors ${inputLALs > 0 ? 'bg-primary/8 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {inputLALs > 0 ? inputLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Output section */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.output_volume} onChange={e => set('output_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label>ABV %</Label>
                    <Input type="number" step="0.1" value={form.output_abv} onChange={e => set('output_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      LALs <Calculator className="w-3 h-3 text-primary" />
                    </Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold transition-colors ${outputLALs > 0 ? 'bg-primary/8 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {outputLALs > 0 ? outputLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Heads (L)</Label>
                    <Input type="number" step="0.01" value={form.heads_volume} onChange={e => set('heads_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label>Tails (L)</Label>
                    <Input type="number" step="0.01" value={form.tails_volume} onChange={e => set('tails_volume', e.target.value)} />
                  </div>
                </div>
                {(inputLALs > 0 || outputLALs > 0) && (
                  <div className="flex items-center gap-2 pt-1">
                    <Calculator className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      LAL yield:{' '}
                      <span className="font-semibold text-primary">
                        {inputLALs > 0 ? ((outputLALs / inputLALs) * 100).toFixed(1) : '0'}%
                      </span>
                      {' '}({outputLALs.toFixed(3)} of {inputLALs.toFixed(3)} LALs recovered)
                    </p>
                  </div>
                )}
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

              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Record Run'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>In Vol (L)</TableHead>
                <TableHead>In ABV</TableHead>
                <TableHead>In LALs</TableHead>
                <TableHead>Out Vol (L)</TableHead>
                <TableHead>Out ABV</TableHead>
                <TableHead>Out LALs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : runs.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No distillation runs</TableCell></TableRow>
              ) : runs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.batch_number}</TableCell>
                  <TableCell className="text-sm">{r.product_name}</TableCell>
                  <TableCell className="text-sm">{r.input_volume}</TableCell>
                  <TableCell className="text-sm">{r.input_abv ? `${r.input_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.input_lals?.toFixed(3)}</TableCell>
                  <TableCell className="text-sm">{r.output_volume}</TableCell>
                  <TableCell className="text-sm">{r.output_abv ? `${r.output_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.output_lals?.toFixed(3)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}