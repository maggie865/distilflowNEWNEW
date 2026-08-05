import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import Pagination from '@/components/ui/Pagination';
import { Plus, Search, Pencil, Trash2, Cylinder, Droplets, Percent, History } from 'lucide-react';
import { differenceInYears, differenceInMonths, format, parseISO } from 'date-fns';

const BARREL_TYPES = ['ex-bourbon', 'ex-sherry', 'ex-port', 'ex-wine', 'ex-rum', 'new_oak', 'charred', 'other'];
const PREVIOUS_USES = ['first_fill', 'second_fill', 'third_fill', 'refill'];
const STATUSES = ['in_storage', 'maturing', 'emptied', 'sold', 'returned', 'leaking'];

const fmtLabel = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ageString = (fillDate) => {
  if (!fillDate) return '—';
  try {
    const d = parseISO(fillDate);
    const yrs = differenceInYears(new Date(), d);
    const mos = differenceInMonths(new Date(), d) % 12;
    if (yrs === 0 && mos === 0) return '< 1 month';
    const parts = [];
    if (yrs > 0) parts.push(`${yrs}y`);
    if (mos > 0) parts.push(`${mos}m`);
    return parts.join(' ');
  } catch { return '—'; }
};

const ageDecimal = (fillDate) => {
  if (!fillDate) return 0;
  try {
    const d = parseISO(fillDate);
    const mos = differenceInMonths(new Date(), d);
    return mos / 12;
  } catch { return 0; }
};

const statusBadgeVariant = (status) => {
  if (status === 'leaking') return 'destructive';
  if (['emptied', 'sold', 'returned'].includes(status)) return 'outline';
  return 'default';
};

export default function WhiskeyBarrels() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({});

  const { data: barrels = [], isLoading } = useQuery({
    queryKey: ['whiskeyBarrels'],
    queryFn: () => base44.entities.WhiskeyBarrel.list('-fill_date', 5000),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.WhiskeyBarrel.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['whiskeyBarrels']); toast({ title: 'Barrel registered' }); setDialogOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WhiskeyBarrel.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['whiskeyBarrels']); toast({ title: 'Barrel updated' }); setDialogOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WhiskeyBarrel.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['whiskeyBarrels']); toast({ title: 'Barrel deleted' }); setDeleteTarget(null); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = useMemo(() => {
    let r = barrels;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(b =>
        (b.barrel_number || '').toLowerCase().includes(q) ||
        (b.product_name || '').toLowerCase().includes(q) ||
        (b.owner || '').toLowerCase().includes(q) ||
        (b.location_description || '').toLowerCase().includes(q) ||
        (b.cooperage || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') r = r.filter(b => (b.status || 'maturing') === statusFilter);
    if (typeFilter !== 'all') r = r.filter(b => (b.barrel_type || 'ex-bourbon') === typeFilter);
    return r;
  }, [barrels, search, statusFilter, typeFilter]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(() => {
    const active = barrels.filter(b => ['in_storage', 'maturing'].includes(b.status || 'maturing'));
    const totalVolume = active.reduce((s, b) => s + (b.volume_litres || 0), 0);
    const totalLals = active.reduce((s, b) => s + ((b.volume_litres || 0) * (b.abv_percent || 0) / 100), 0);
    const avgAge = active.length > 0
      ? (active.reduce((s, b) => s + ageDecimal(b.fill_date), 0) / active.length).toFixed(1)
      : '0.0';
    return { count: active.length, totalVolume, totalLals, avgAge };
  }, [barrels]);

  const openNew = () => {
    setEditing(null);
    setForm({
      barrel_number: '',
      product_name: '',
      barrel_type: 'ex-bourbon',
      capacity_litres: 200,
      volume_litres: 200,
      abv_percent: '',
      fill_date: format(new Date(), 'yyyy-MM-dd'),
      previous_use: 'first_fill',
      cooperage: '',
      owner: '',
      location_description: '',
      status: 'maturing',
      last_checked_date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({ ...b });
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.barrel_number || !form.product_name) {
      toast({ title: 'Barrel number and product name are required', variant: 'destructive' });
      return;
    }
    const payload = { ...form };
    ['capacity_litres', 'volume_litres', 'abv_percent'].forEach(k => {
      payload[k] = payload[k] === '' || payload[k] === null ? undefined : Number(payload[k]);
    });
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader title="Whiskey Barrels" subtitle="Register and monitor barrels maturing in storage">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Register Barrel
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Cylinder className="w-3 h-3" /> Active Barrels</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.count}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Total Volume</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.totalVolume.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> L</span></p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="w-3 h-3" /> Total LALs</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.totalLals.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><History className="w-3 h-3" /> Avg Age</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.avgAge}<span className="text-sm font-normal text-muted-foreground"> yrs</span></p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search barrel number, product, owner, location..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {BARREL_TYPES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Cylinder className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No barrels found. Click "Register Barrel" to add one.
        </CardContent></Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barrel #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">ABV</TableHead>
                  <TableHead>Fill Date</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono font-semibold">{b.barrel_number}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.product_name}</div>
                      {b.owner && <div className="text-xs text-muted-foreground">Owner: {b.owner}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{fmtLabel(b.barrel_type)}</TableCell>
                    <TableCell className="text-right">{(b.volume_litres || 0).toLocaleString()} L</TableCell>
                    <TableCell className="text-right">{b.abv_percent ? `${b.abv_percent}%` : '—'}</TableCell>
                    <TableCell className="text-sm">{b.fill_date ? format(parseISO(b.fill_date), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ageString(b.fill_date)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{b.location_description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(b.status)}>
                        {fmtLabel(b.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(b)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <MobileCardGrid>
            {paginated.map(b => (
              <MobileCard
                key={b.id}
                title={`${b.barrel_number} — ${b.product_name}`}
                subtitle={b.owner ? `Owner: ${b.owner}` : fmtLabel(b.barrel_type)}
                badge={<Badge variant={statusBadgeVariant(b.status)}>{fmtLabel(b.status)}</Badge>}
                accent={<span className="text-xs font-semibold text-primary">{ageString(b.fill_date)}</span>}
                actions={
                  <>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeleteTarget(b)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                  </>
                }
              >
                <MobileDetailRow label="Volume" value={`${(b.volume_litres || 0).toLocaleString()} L`} />
                <MobileDetailRow label="ABV" value={b.abv_percent ? `${b.abv_percent}%` : '—'} />
                <MobileDetailRow label="Fill date" value={b.fill_date ? format(parseISO(b.fill_date), 'dd MMM yyyy') : '—'} />
                <MobileDetailRow label="Location" value={b.location_description || '—'} />
                {b.cooperage && <MobileDetailRow label="Cooperage" value={b.cooperage} />}
                {b.last_checked_date && <MobileDetailRow label="Last checked" value={format(parseISO(b.last_checked_date), 'dd MMM yyyy')} />}
                {b.notes && <MobileDetailRow label="Notes" value={b.notes} />}
              </MobileCard>
            ))}
          </MobileCardGrid>
        </>
      )}

      {filtered.length > 0 && (
        <Pagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      )}

      {/* Register / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Barrel' : 'Register Barrel'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Barrel Number *</Label>
              <Input value={form.barrel_number || ''} onChange={e => setField('barrel_number', e.target.value)} placeholder="e.g. WB-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.product_name || ''} onChange={e => setField('product_name', e.target.value)} placeholder="e.g. Single Malt Whiskey" />
            </div>
            <div className="space-y-1.5">
              <Label>Barrel Type</Label>
              <Select value={form.barrel_type || 'ex-bourbon'} onValueChange={v => setField('barrel_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BARREL_TYPES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Previous Use</Label>
              <Select value={form.previous_use || 'first_fill'} onValueChange={v => setField('previous_use', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PREVIOUS_USES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacity (L)</Label>
              <Input type="number" value={form.capacity_litres ?? ''} onChange={e => setField('capacity_litres', e.target.value)} placeholder="200" />
            </div>
            <div className="space-y-1.5">
              <Label>Current Volume (L)</Label>
              <Input type="number" value={form.volume_litres ?? ''} onChange={e => setField('volume_litres', e.target.value)} placeholder="200" />
            </div>
            <div className="space-y-1.5">
              <Label>ABV %</Label>
              <Input type="number" step="0.1" value={form.abv_percent ?? ''} onChange={e => setField('abv_percent', e.target.value)} placeholder="63.5" />
            </div>
            <div className="space-y-1.5">
              <Label>Fill Date</Label>
              <Input type="date" value={form.fill_date || ''} onChange={e => setField('fill_date', e.target.value)} />
              {form.fill_date && <p className="text-xs text-muted-foreground">Age: {ageString(form.fill_date)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Cooperage</Label>
              <Input value={form.cooperage || ''} onChange={e => setField('cooperage', e.target.value)} placeholder="e.g. ISC, Speyside" />
            </div>
            <div className="space-y-1.5">
              <Label>Owner (if 3rd party)</Label>
              <Input value={form.owner || ''} onChange={e => setField('owner', e.target.value)} placeholder="Blank if owned by distillery" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location_description || ''} onChange={e => setField('location_description', e.target.value)} placeholder="e.g. Warehouse A, Rack 3" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || 'maturing'} onValueChange={v => setField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{fmtLabel(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Last Checked Date</Label>
              <Input type="date" value={form.last_checked_date || ''} onChange={e => setField('last_checked_date', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes || ''} onChange={e => setField('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save Changes' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete barrel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove barrel "{deleteTarget?.barrel_number}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}