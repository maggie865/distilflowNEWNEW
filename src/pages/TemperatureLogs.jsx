import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Thermometer, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const UNIT_TYPES = ['refrigerator','freezer','cool_room','ambient'];
const SAFE_RANGES = {
  refrigerator: { min: 2, max: 5 },
  freezer: { min: -25, max: -15 },
  cool_room: { min: 2, max: 8 },
  ambient: { min: 15, max: 25 },
};

const BLANK = {
  date: new Date().toISOString().split('T')[0],
  time: new Date().toTimeString().slice(0,5),
  unit_name: '',
  unit_type: 'refrigerator',
  temperature_c: '',
  min_safe_c: 2,
  max_safe_c: 5,
  recorded_by: '',
  corrective_action: '',
  notes: '',
};

export default function TemperatureLogs() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['temperatureLogs'],
    queryFn: () => base44.entities.TemperatureLog.list('-date', 500),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleTypeChange = (type) => {
    const range = SAFE_RANGES[type] || { min: 0, max: 10 };
    setForm(f => ({ ...f, unit_type: type, min_safe_c: range.min, max_safe_c: range.max }));
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const temp = parseFloat(data.temperature_c);
      const inRange = temp >= data.min_safe_c && temp <= data.max_safe_c;
      await base44.entities.TemperatureLog.create({
        ...data,
        temperature_c: temp,
        in_range: inRange,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['temperatureLogs'] });
      setOpen(false);
      setForm(BLANK);
      toast.success('Temperature logged');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TemperatureLog.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['temperatureLogs'] }),
  });

  // Summary stats
  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.date === today);
  const outOfRange = logs.filter(l => l.in_range === false).length;
  const unitNames = [...new Set(logs.map(l => l.unit_name).filter(Boolean))].sort();
  const filteredLogs = logs.filter(l =>
    (filterUnit === 'all' || l.unit_name === filterUnit) &&
    (filterType === 'all' || l.unit_type === filterType)
  );

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Temperature Logs" subtitle="Record fridge and freezer temperatures">
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Log Temperature
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Today's readings", value: todayLogs.length, icon: Thermometer, ok: true },
          { label: 'Out of range (all time)', value: outOfRange, icon: AlertTriangle, ok: outOfRange === 0 },
          { label: 'Units tracked', value: unitNames.length, icon: Thermometer, ok: true },
          { label: 'Total readings', value: logs.length, icon: CheckCircle2, ok: true },
        ].map(({ label, value, icon: Icon, ok }) => (
          <div key={label} className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${ok ? 'text-primary' : 'text-destructive'}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold font-display ${ok ? 'text-primary' : 'text-destructive'}`}>{value}</p>
          </div>
        ))}
      </div>

      {outOfRange > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">{outOfRange} out-of-range reading{outOfRange !== 1 ? 's' : ''} recorded</p>
            <p className="text-xs text-destructive/80 mt-0.5">Review the table below and ensure corrective actions have been taken.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Filter by unit</Label>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All units</SelectItem>
              {unitNames.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Filter by type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {UNIT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Temp °C</TableHead>
                <TableHead>Safe range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Corrective action</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No temperature logs match these filters</TableCell></TableRow>
              ) : filteredLogs.map(l => (
                <TableRow key={l.id} className={l.in_range === false ? 'bg-destructive/5' : ''}>
                  <TableCell className="text-sm">{l.date ? format(new Date(l.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-mono">{l.time || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{l.unit_name}</TableCell>
                  <TableCell className="text-sm capitalize">{(l.unit_type || '').replace('_', ' ')}</TableCell>
                  <TableCell className={`text-sm font-bold ${l.in_range === false ? 'text-destructive' : 'text-emerald-600'}`}>
                    {l.temperature_c}°C
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.min_safe_c}° – {l.max_safe_c}°</TableCell>
                  <TableCell>
                    {l.in_range === false ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                        <AlertTriangle className="w-3 h-3" /> Out of range
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" /> OK
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{l.recorded_by || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{l.corrective_action || '—'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => { if (confirm('Delete this log entry?')) deleteMutation.mutate(l.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No logs match these filters</p>
          ) : filteredLogs.map(l => (
            <MobileCard
              key={l.id}
              title={l.unit_name}
              subtitle={`${l.date ? format(new Date(l.date), 'MMM d, yyyy') : '—'} • ${l.time || '—'} • ${l.recorded_by || '—'}`}
              badge={
                l.in_range === false ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="w-3 h-3" /> Out</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> OK</span>
                )
              }
              accent={<span className={`text-2xl font-bold ${l.in_range === false ? 'text-destructive' : 'text-emerald-600'}`}>{l.temperature_c}°</span>}
              actions={
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => { if (confirm('Delete this log entry?')) deleteMutation.mutate(l.id); }}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
              }
            >
              <MobileDetailRow label="Unit Type" value={(l.unit_type || '').replace('_', ' ')} />
              <MobileDetailRow label="Safe Range" value={`${l.min_safe_c}° – ${l.max_safe_c}°`} />
              {l.corrective_action && <MobileDetailRow label="Action Taken" value={l.corrective_action} />}
            </MobileCard>
          ))}
        </MobileCardGrid>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setForm(BLANK); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Log Temperature</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Time</Label>
                <Input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Unit name</Label>
              <Input value={form.unit_name} onChange={e => set('unit_name', e.target.value)} placeholder="e.g. Fridge 1, Lab Freezer" className="mt-1" />
            </div>
            <div>
              <Label>Unit type</Label>
              <Select value={form.unit_type} onValueChange={handleTypeChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Temperature °C</Label>
                <Input type="number" step="0.1" value={form.temperature_c} onChange={e => set('temperature_c', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Min safe °C</Label>
                <Input type="number" step="0.1" value={form.min_safe_c} onChange={e => set('min_safe_c', parseFloat(e.target.value))} className="mt-1" />
              </div>
              <div>
                <Label>Max safe °C</Label>
                <Input type="number" step="0.1" value={form.max_safe_c} onChange={e => set('max_safe_c', parseFloat(e.target.value))} className="mt-1" />
              </div>
            </div>
            {form.temperature_c !== '' && (
              <div className={`rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${
                parseFloat(form.temperature_c) >= form.min_safe_c && parseFloat(form.temperature_c) <= form.max_safe_c
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                {parseFloat(form.temperature_c) >= form.min_safe_c && parseFloat(form.temperature_c) <= form.max_safe_c
                  ? <><CheckCircle2 className="w-4 h-4" /> Within safe range</>
                  : <><AlertTriangle className="w-4 h-4" /> Out of safe range — corrective action required</>
                }
              </div>
            )}
            {form.temperature_c !== '' && (parseFloat(form.temperature_c) < form.min_safe_c || parseFloat(form.temperature_c) > form.max_safe_c) && (
              <div>
                <Label>Corrective action taken</Label>
                <Input value={form.corrective_action} onChange={e => set('corrective_action', e.target.value)} placeholder="e.g. Unit adjusted, contents moved to Fridge 2" className="mt-1" />
              </div>
            )}
            <div>
              <Label>Recorded by</Label>
              <Input value={form.recorded_by} onChange={e => set('recorded_by', e.target.value)} placeholder="Your name" className="mt-1" />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.unit_name || form.temperature_c === ''}
            >
              {createMutation.isPending ? 'Saving...' : 'Log Temperature'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}