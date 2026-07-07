import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Pencil, Trash2 } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format, isPast, isToday, addDays } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const MAINTENANCE_TYPES = ['scheduled','repair','calibration','cleaning','inspection'];
const STATUSES = ['completed','pending','overdue'];

const BLANK = {
  date: new Date().toISOString().split('T')[0],
  equipment_name: '',
  maintenance_type: 'scheduled',
  description: '',
  performed_by: '',
  next_due_date: '',
  status: 'completed',
  cost: '',
  notes: '',
};

export default function MaintenanceRecords() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const qc = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => base44.entities.MaintenanceRecord.list('-date', 500),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => { setEditingId(null); setForm(BLANK); setOpen(true); };
  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({ ...r, cost: r.cost != null ? String(r.cost) : '' });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, cost: data.cost ? parseFloat(data.cost) : undefined };
      if (editingId) await base44.entities.MaintenanceRecord.update(editingId, payload);
      else await base44.entities.MaintenanceRecord.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceRecords'] });
      setOpen(false); setEditingId(null); setForm(BLANK);
      toast.success(editingId ? 'Record updated' : 'Maintenance logged');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.MaintenanceRecord.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenanceRecords'] }),
  });

  // Compute overdue/due-soon
  const overdueItems = records.filter(r => r.next_due_date && isPast(new Date(r.next_due_date)) && r.status !== 'completed');
  const dueSoon = records.filter(r => {
    if (!r.next_due_date) return false;
    const due = new Date(r.next_due_date);
    return !isPast(due) && due <= addDays(new Date(), 14);
  });

  const statusBadge = (r) => {
    if (r.next_due_date && isPast(new Date(r.next_due_date)) && !isToday(new Date(r.next_due_date)))
      return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Overdue</Badge>;
    if (r.status === 'completed')
      return <Badge className="bg-emerald-100 text-emerald-800">Completed</Badge>;
    if (r.status === 'pending')
      return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
    return <Badge variant="outline">{r.status}</Badge>;
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Maintenance Records" subtitle="Equipment maintenance, repairs and calibrations">
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Log Maintenance</Button>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total records', value: records.length, icon: Wrench, warn: false },
          { label: 'Overdue', value: overdueItems.length, icon: AlertTriangle, warn: overdueItems.length > 0 },
          { label: 'Due in 14 days', value: dueSoon.length, icon: Clock, warn: dueSoon.length > 0 },
          { label: 'Completed', value: records.filter(r => r.status === 'completed').length, icon: CheckCircle2, warn: false },
        ].map(({ label, value, icon: Icon, warn }) => (
          <div key={label} className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${warn ? 'text-destructive' : 'text-primary'}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold font-display ${warn ? 'text-destructive' : 'text-primary'}`}>{value}</p>
          </div>
        ))}
      </div>

      {overdueItems.length > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-destructive">{overdueItems.length} overdue maintenance item{overdueItems.length !== 1 ? 's' : ''}</p>
            <p className="text-xs text-destructive/80 mt-0.5">{overdueItems.map(r => r.equipment_name).join(', ')}</p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Performed by</TableHead>
                <TableHead>Next due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : records.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No maintenance records yet</TableCell></TableRow>
              ) : records.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.equipment_name}</TableCell>
                  <TableCell className="text-sm capitalize">{r.maintenance_type}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{r.description || '—'}</TableCell>
                  <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                  <TableCell className="text-sm">{r.next_due_date ? format(new Date(r.next_due_date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell>{statusBadge(r)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(r.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : records.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No maintenance records yet</p>
          ) : records.map(r => (
            <MobileCard
              key={r.id}
              title={r.equipment_name}
              subtitle={`${r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'} • ${r.maintenance_type}`}
              badge={statusBadge(r)}
              accent={r.next_due_date ? <span className="text-xs text-muted-foreground">{format(new Date(r.next_due_date), 'MMM d')}</span> : null}
              actions={
                <>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(r.id); }}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Type" value={r.maintenance_type} />
              <MobileDetailRow label="Performed by" value={r.performed_by || '—'} />
              <MobileDetailRow label="Next due" value={r.next_due_date ? format(new Date(r.next_due_date), 'MMM d, yyyy') : '—'} />
              {r.cost != null && <MobileDetailRow label="Cost" value={`$${r.cost.toFixed(2)}`} />}
              {r.description && <MobileDetailRow label="Description" value={r.description} />}
            </MobileCard>
          ))}
        </MobileCardGrid>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditingId(null); setForm(BLANK); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editingId ? 'Edit' : 'Log'} Maintenance</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.maintenance_type} onValueChange={v => set('maintenance_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{MAINTENANCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Equipment name</Label>
              <Input value={form.equipment_name} onChange={e => set('equipment_name', e.target.value)} placeholder="e.g. Still pump, Boiler, Lab fridge" className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="What was done?" className="mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Performed by</Label>
                <Input value={form.performed_by} onChange={e => set('performed_by', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Cost ($)</Label>
                <Input type="number" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Next due date</Label>
                <Input type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="mt-1" rows={2} />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.equipment_name}>
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Log Maintenance'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}