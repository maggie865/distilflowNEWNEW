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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Calculator, FlaskConical, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

// Tanks allowed per dilution type
const ETHANOL_TANKS = ['X', 'Y'];
const HEADS_TANKS = ['E', 'F', 'H'];

const BLANK_ETHANOL = {
  date: new Date().toISOString().split('T')[0],
  source_id: '',
  input_ethanol_volume: '',
  input_abv: '',
  water_added: '',
  tank_id: '',
  status: 'completed',
  notes: '',
};

const BLANK_HEADS = {
  batch_number: '',
  date: new Date().toISOString().split('T')[0],
  source_tank_id: '',
  input_ethanol_volume: '',
  input_abv: '',
  water_added: '',
  status: 'completed',
  notes: '',
};

export default function Dilutions() {
  const [openType, setOpenType] = useState(null); // 'ethanol' | 'heads'
  const [ethanolForm, setEthanolForm] = useState(BLANK_ETHANOL);
  const [headsForm, setHeadsForm] = useState(BLANK_HEADS);
  const queryClient = useQueryClient();

  const setE = (f, v) => setEthanolForm(p => ({ ...p, [f]: v }));
  const setH = (f, v) => setHeadsForm(p => ({ ...p, [f]: v }));

  const { data: dilutions = [], isLoading } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 50),
  });

  const { data: receivings = [] } = useQuery({
    queryKey: ['receivings-ethanol'],
    queryFn: () => base44.entities.Receiving.filter({ material_type: 'ethanol' }, '-date_received', 50),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 50),
  });

  // Filtered tank lists
  const ethanolDestTanks = tanks.filter(t => ETHANOL_TANKS.includes(t.name));
  const headsSrcTanks = tanks.filter(t => HEADS_TANKS.includes(t.name));

  // --- Ethanol Dilution calcs ---
  const eInputLALs = ethanolForm.input_ethanol_volume && ethanolForm.input_abv
    ? parseFloat(ethanolForm.input_ethanol_volume) * parseFloat(ethanolForm.input_abv) / 100 : 0;
  const eOutputVol = (parseFloat(ethanolForm.input_ethanol_volume) || 0) + (parseFloat(ethanolForm.water_added) || 0);
  const eOutputABV = eOutputVol > 0 ? (eInputLALs / eOutputVol) * 100 : 0;
  const eSelectedTank = tanks.find(t => t.id === ethanolForm.tank_id);

  // --- Heads Dilution calcs ---
  const hInputLALs = headsForm.input_ethanol_volume && headsForm.input_abv
    ? parseFloat(headsForm.input_ethanol_volume) * parseFloat(headsForm.input_abv) / 100 : 0;
  const hOutputVol = (parseFloat(headsForm.input_ethanol_volume) || 0) + (parseFloat(headsForm.water_added) || 0);
  const hOutputABV = hOutputVol > 0 ? (hInputLALs / hOutputVol) * 100 : 0;
  const hSourceTank = tanks.find(t => t.id === headsForm.source_tank_id);

  // Auto-fill from source tank when selected
  const handleHeadsSourceChange = (id) => {
    setH('source_tank_id', id);
    const tank = tanks.find(t => t.id === id);
    if (tank) {
      setH('input_abv', tank.current_abv || '');
      setH('input_ethanol_volume', tank.current_volume || '');
    }
  };

  // Auto-fill from receiving record
  const handleEthanolSourceChange = (id) => {
    setE('source_id', id);
    const rec = receivings.find(r => r.id === id);
    if (rec) {
      setE('input_abv', rec.abv_percent || '');
      setE('input_ethanol_volume', rec.quantity || '');
    }
  };

  // --- Mutations ---
  const ethanolMutation = useMutation({
    mutationFn: async (data) => {
      const sourceName = receivings.find(r => r.id === data.source_id)?.batch_number || '';

      await base44.entities.Dilution.create({
        batch_number: sourceName || 'Ethanol Dilution',
        date: data.date,
        input_ethanol_volume: parseFloat(data.input_ethanol_volume),
        input_abv: parseFloat(data.input_abv),
        input_lals: eInputLALs,
        water_added: parseFloat(data.water_added) || 0,
        output_volume: eOutputVol,
        output_abv: parseFloat(eOutputABV.toFixed(2)),
        output_lals: parseFloat(eInputLALs.toFixed(4)),
        status: data.status,
        notes: `[Ethanol Dilution] Source lot: ${sourceName}. ${data.notes}`,
      });

      if (data.tank_id && eSelectedTank) {
        const newVol = Math.min((eSelectedTank.current_volume || 0) + eOutputVol, eSelectedTank.capacity_litres);
        await base44.entities.TankMovement.create({
          date: data.date,
          action: 'fill',
          tank_name: eSelectedTank.name,
          volume_litres: eOutputVol,
          abv: parseFloat(eOutputABV.toFixed(2)),
          lals: parseFloat(eInputLALs.toFixed(4)),
          product: sourceName || 'Ethanol Dilution',
          batch_number: sourceName,
          notes: `Ethanol dilution — source: Receiving lot ${sourceName}`,
        });
        await base44.entities.StorageTank.update(data.tank_id, {
          current_volume: newVol,
          current_abv: parseFloat(eOutputABV.toFixed(2)),
          current_product: sourceName || eSelectedTank.current_product,
          current_batch: sourceName,
          status: 'in_use',
        });
        queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
        queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      setOpenType(null);
      setEthanolForm(BLANK_ETHANOL);
      toast.success('Ethanol dilution recorded');
    },
  });

  const headsMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Dilution.create({
        batch_number: data.batch_number,
        date: data.date,
        input_ethanol_volume: parseFloat(data.input_ethanol_volume),
        input_abv: parseFloat(data.input_abv),
        input_lals: hInputLALs,
        water_added: parseFloat(data.water_added) || 0,
        output_volume: hOutputVol,
        output_abv: parseFloat(hOutputABV.toFixed(2)),
        output_lals: parseFloat(hInputLALs.toFixed(4)),
        status: data.status,
        notes: `[Heads Dilution] Source tank: ${hSourceTank?.name || ''}. ${data.notes}`,
      });

      // Update the source tank (water was added in-place, volume increases, ABV drops)
      if (hSourceTank && hOutputVol > 0) {
        const newVol = Math.min(hOutputVol, hSourceTank.capacity_litres);
        await base44.entities.TankMovement.create({
          date: data.date,
          action: 'fill',
          tank_name: hSourceTank.name,
          volume_litres: parseFloat(data.water_added) || 0,
          abv: 0,
          lals: 0,
          product: hSourceTank.current_product || 'Heads',
          batch_number: data.batch_number,
          notes: `Water addition for heads dilution — ${data.water_added}L water added`,
        });
        await base44.entities.StorageTank.update(data.source_tank_id, {
          current_volume: newVol,
          current_abv: parseFloat(hOutputABV.toFixed(2)),
          status: newVol > 0 ? 'in_use' : 'empty',
        });
        queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
        queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      setOpenType(null);
      setHeadsForm(BLANK_HEADS);
      toast.success('Heads dilution recorded');
    },
  });

  const CalcDisplay = ({ value, label }) => (
    <div>
      <Label className="flex items-center gap-1">{label} <Calculator className="w-3 h-3 text-primary" /></Label>
      <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold transition-colors ${value > 0 ? 'bg-primary/8 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
        {value > 0 ? value.toFixed(3) : '—'}
      </div>
    </div>
  );

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Dilutions" subtitle="Track ethanol and heads dilutions">
        <div className="flex gap-2">
          {/* Ethanol Dilution Dialog */}
          <Dialog open={openType === 'ethanol'} onOpenChange={v => setOpenType(v ? 'ethanol' : null)}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FlaskConical className="w-4 h-4" />Ethanol Dilution
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  Ethanol Dilution (96% → Tank X/Y)
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={e => { e.preventDefault(); ethanolMutation.mutate(ethanolForm); }} className="space-y-4 mt-2">

                <div>
                  <Label>Date</Label>
                  <Input type="date" value={ethanolForm.date} onChange={e => setE('date', e.target.value)} required />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ethanol Source (Received)</p>
                  <div>
                    <Label>Select Receiving Lot</Label>
                    <Select value={ethanolForm.source_id} onValueChange={handleEthanolSourceChange}>
                      <SelectTrigger><SelectValue placeholder="Choose a received ethanol lot..." /></SelectTrigger>
                      <SelectContent>
                        {receivings.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.material_name} — Lot: {r.batch_number || 'N/A'} ({r.quantity}{r.unit}, {r.abv_percent}% ABV) — {r.date_received}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Volume (L)</Label>
                      <Input type="number" step="0.01" value={ethanolForm.input_ethanol_volume} onChange={e => setE('input_ethanol_volume', e.target.value)} required />
                    </div>
                    <div>
                      <Label>ABV %</Label>
                      <Input type="number" step="0.1" value={ethanolForm.input_abv} onChange={e => setE('input_abv', e.target.value)} required />
                    </div>
                    <CalcDisplay value={eInputLALs} label="LALs" />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Water Addition & Output</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Water Added (L)</Label>
                      <Input type="number" step="0.01" value={ethanolForm.water_added} onChange={e => setE('water_added', e.target.value)} />
                    </div>
                    <CalcDisplay value={eOutputVol} label="Output Vol (L)" />
                    <CalcDisplay value={eOutputABV} label="Output ABV %" />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calculator className="w-3 h-3 text-primary" />
                    Output LALs = <span className="font-semibold text-primary ml-1">{eInputLALs > 0 ? eInputLALs.toFixed(3) : '—'}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination Tank (X or Y — Outdoor)</p>
                  <Select value={ethanolForm.tank_id} onValueChange={v => setE('tank_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Tank X or Y..." /></SelectTrigger>
                    <SelectContent>
                      {ethanolDestTanks.length === 0
                        ? <SelectItem value="none" disabled>No X/Y tanks found</SelectItem>
                        : ethanolDestTanks.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            Tank {t.name} — {t.capacity_litres}L capacity
                            {t.status === 'empty' ? ' (empty)' : ` — ${t.current_volume || 0}L in use`}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  {eSelectedTank && eOutputVol > 0 && (
                    <p className="text-xs text-primary font-medium">
                      Tank {eSelectedTank.name} → {Math.min((eSelectedTank.current_volume || 0) + eOutputVol, eSelectedTank.capacity_litres).toFixed(1)}L
                      / {eSelectedTank.capacity_litres}L at {eOutputABV.toFixed(2)}% ABV
                    </p>
                  )}
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={ethanolForm.status} onValueChange={v => setE('status', v)}>
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
                  <Textarea value={ethanolForm.notes} onChange={e => setE('notes', e.target.value)} />
                </div>

                <Button type="submit" className="w-full" disabled={ethanolMutation.isPending}>
                  {ethanolMutation.isPending ? 'Saving...' : 'Record Ethanol Dilution'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Heads Dilution Dialog */}
          <Dialog open={openType === 'heads'} onOpenChange={v => setOpenType(v ? 'heads' : null)}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Droplets className="w-4 h-4" />Heads Dilution
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  Heads Dilution (Tank E / F / H)
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={e => { e.preventDefault(); headsMutation.mutate(headsForm); }} className="space-y-4 mt-2">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Batch Number</Label>
                    <Input value={headsForm.batch_number} onChange={e => setH('batch_number', e.target.value)} required />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={headsForm.date} onChange={e => setH('date', e.target.value)} required />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source Tank (E, F or H — Heads)</p>
                  <div>
                    <Label>Select Source Tank</Label>
                    <Select value={headsForm.source_tank_id} onValueChange={handleHeadsSourceChange}>
                      <SelectTrigger><SelectValue placeholder="Choose a heads tank..." /></SelectTrigger>
                      <SelectContent>
                        {headsSrcTanks.length === 0
                          ? <SelectItem value="none" disabled>No E/F/H tanks found</SelectItem>
                          : headsSrcTanks.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              Tank {t.name}
                              {t.current_volume > 0
                                ? ` — ${t.current_volume}L @ ${t.current_abv}% ABV`
                                : ' — empty'}
                              {t.current_product ? ` (${t.current_product})` : ''}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Volume (L)</Label>
                      <Input type="number" step="0.01" value={headsForm.input_ethanol_volume} onChange={e => setH('input_ethanol_volume', e.target.value)} required />
                    </div>
                    <div>
                      <Label>ABV %</Label>
                      <Input type="number" step="0.1" value={headsForm.input_abv} onChange={e => setH('input_abv', e.target.value)} required />
                    </div>
                    <CalcDisplay value={hInputLALs} label="LALs" />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Water Addition & Output</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Water Added (L)</Label>
                      <Input type="number" step="0.01" value={headsForm.water_added} onChange={e => setH('water_added', e.target.value)} />
                    </div>
                    <CalcDisplay value={hOutputVol} label="Output Vol (L)" />
                    <CalcDisplay value={hOutputABV} label="Output ABV %" />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calculator className="w-3 h-3 text-primary" />
                    Output LALs = <span className="font-semibold text-primary ml-1">{hInputLALs > 0 ? hInputLALs.toFixed(3) : '—'}</span>
                    <span className="ml-1">— water added in-place to tank {hSourceTank?.name || '…'}</span>
                  </p>
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={headsForm.status} onValueChange={v => setH('status', v)}>
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
                  <Textarea value={headsForm.notes} onChange={e => setH('notes', e.target.value)} />
                </div>

                <Button type="submit" className="w-full" disabled={headsMutation.isPending}>
                  {headsMutation.isPending ? 'Saving...' : 'Record Heads Dilution'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Input Vol (L)</TableHead>
                <TableHead>Input ABV</TableHead>
                <TableHead>Input LALs</TableHead>
                <TableHead>Water (L)</TableHead>
                <TableHead>Output Vol (L)</TableHead>
                <TableHead>Output ABV</TableHead>
                <TableHead>Output LALs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : dilutions.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No dilutions recorded</TableCell></TableRow>
              ) : dilutions.map(d => {
                const isHeads = d.notes?.includes('[Heads Dilution]');
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{d.date ? format(new Date(d.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="font-medium text-sm">{d.batch_number}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isHeads ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isHeads ? <Droplets className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
                        {isHeads ? 'Heads' : 'Ethanol'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{d.input_ethanol_volume}</TableCell>
                    <TableCell className="text-sm">{d.input_abv}%</TableCell>
                    <TableCell className="text-sm font-medium">{d.input_lals?.toFixed(3)}</TableCell>
                    <TableCell className="text-sm">{d.water_added}</TableCell>
                    <TableCell className="text-sm">{d.output_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{d.output_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-medium">{d.output_lals?.toFixed(3)}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
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