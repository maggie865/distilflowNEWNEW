import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const TYPES = ['ethanol', 'botanical', 'grain', 'sugar', 'water', 'flavoring', 'other'];
const UNITS = ['litres', 'kg', 'units'];

const typeColors = {
  ethanol:   'bg-amber-100 text-amber-800',
  botanical: 'bg-emerald-100 text-emerald-800',
  grain:     'bg-yellow-100 text-yellow-800',
  sugar:     'bg-pink-100 text-pink-800',
  water:     'bg-blue-100 text-blue-800',
  flavoring: 'bg-purple-100 text-purple-800',
  other:     'bg-muted text-muted-foreground',
};

const emptyForm = {
  name: '', type: '', quantity: '', unit: 'litres',
  abv_percent: '', lals: '', supplier: '',
  cost_per_unit: '', batch_number: '', notes: '',
};

function MaterialForm({ initial, onSave, onCancel, isPending }) {
  const [form, setForm] = useState(initial || emptyForm);
  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const calculatedLALs = form.type === 'ethanol' && form.quantity && form.abv_percent
    ? (parseFloat(form.quantity) * parseFloat(form.abv_percent) / 100).toFixed(3)
    : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      quantity: parseFloat(form.quantity) || 0,
      abv_percent: form.abv_percent ? parseFloat(form.abv_percent) : undefined,
      lals: calculatedLALs ? parseFloat(calculatedLALs) : (form.lals ? parseFloat(form.lals) : undefined),
      cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Material Name *</Label>
          <Input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Malted Barley" />
        </div>
        <div>
          <Label>Type *</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {TYPES.map(t => (
                <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Lot / Batch Code</Label>
          <Input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} placeholder="e.g. LOT-2026-001" />
        </div>
        <div>
          <Label>Stock Quantity *</Label>
          <Input type="number" step="0.01" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
        </div>
        <div>
          <Label>Unit</Label>
          <Select value={form.unit} onValueChange={v => set('unit', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Supplier</Label>
          <Input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Supplier name" />
        </div>
        <div>
          <Label>Cost per Unit ($)</Label>
          <Input type="number" step="0.01" min="0" value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} placeholder="0.00" />
        </div>

        {form.type === 'ethanol' && (
          <>
            <div>
              <Label>ABV %</Label>
              <Input type="number" step="0.1" min="0" max="100" value={form.abv_percent} onChange={e => set('abv_percent', e.target.value)} />
            </div>
            <div>
              <Label>LALs</Label>
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                {calculatedLALs ?? (form.lals || '—')}
                {calculatedLALs && <span className="ml-1 text-xs text-muted-foreground">(calculated)</span>}
              </div>
            </div>
          </>
        )}
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." rows={2} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Material'}
        </Button>
      </div>
    </form>
  );
}

export default function RawMaterials() {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.RawMaterial.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setAddOpen(false);
      toast.success('Material added');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => db.RawMaterial.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setEditItem(null);
      toast.success('Material updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.RawMaterial.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setDeleteItem(null);
      toast.success('Material deleted');
    },
  });

  const filtered = materials.filter(m => {
    const matchSearch = !search || m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.supplier?.toLowerCase().includes(search.toLowerCase()) ||
      m.batch_number?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || m.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Raw Materials" subtitle="Manage stock levels, suppliers, costs and lot codes">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add Material</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Add Raw Material</DialogTitle>
            </DialogHeader>
            <MaterialForm
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setAddOpen(false)}
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, supplier or lot code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map(t => (
              <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap mb-5">
        {TYPES.map(type => {
          const count = materials.filter(m => m.type === type).length;
          if (!count) return null;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                typeFilter === type
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Lot Code</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>ABV / LALs</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Unit Cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {materials.length === 0 ? 'No materials yet — add your first one.' : 'No results match your search.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(m => (
                <TableRow key={m.id} className="hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium text-sm">{m.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>
                      {m.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">{m.batch_number || '—'}</TableCell>
                  <TableCell className="text-sm">
                    <span className={`font-semibold ${(m.quantity || 0) === 0 ? 'text-destructive' : ''}`}>
                      {m.quantity ?? 0}
                    </span>{' '}
                    <span className="text-muted-foreground">{m.unit}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {m.type === 'ethanol' ? (
                      <div>
                        <span className="font-medium">{m.abv_percent ?? '—'}%</span>
                        {m.lals != null && <span className="text-muted-foreground text-xs ml-1">/ {m.lals.toFixed(2)} LAL</span>}
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {m.cost_per_unit != null ? `$${m.cost_per_unit.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditItem(m)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteItem(m)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit — {editItem?.name}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <MaterialForm
              initial={{
                ...editItem,
                quantity: editItem.quantity?.toString() ?? '',
                abv_percent: editItem.abv_percent?.toString() ?? '',
                lals: editItem.lals?.toString() ?? '',
                cost_per_unit: editItem.cost_per_unit?.toString() ?? '',
              }}
              onSave={(data) => updateMutation.mutate({ id: editItem.id, data })}
              onCancel={() => setEditItem(null)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={open => !open && setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Delete Material</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteItem?.name}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteItem.id)}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
