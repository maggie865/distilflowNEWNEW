import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Pencil, Link2, Search } from 'lucide-react';
import { toast } from 'sonner';

const MATERIAL_TYPES = ['Ethanol', 'Botanicals', 'Packaging', 'Grain', 'Sugar', 'Water', 'Flavoring', 'Other'];
const BLANK = { alias_name: '', stock_item_name: '', material_type: '' };

export default function ProductLinkManager() {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');

  const { data: aliases = [], isLoading } = useQuery({ queryKey: ['productAliases'], queryFn: () => base44.entities.ProductAlias.list('alias_name', 5000) });
  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => base44.entities.RawMaterial.list('name', 5000) });

  const stockNames = [...new Set(rawMaterials.map(r => r.name).filter(Boolean))].sort();

  const filtered = search
    ? aliases.filter(a => (a.alias_name || '').toLowerCase().includes(search.toLowerCase()) || (a.stock_item_name || '').toLowerCase().includes(search.toLowerCase()))
    : aliases;

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.alias_name.trim() || !data.stock_item_name.trim()) throw new Error('Both supplier name and stock item are required');
      const payload = { alias_name: data.alias_name.trim(), stock_item_name: data.stock_item_name.trim(), material_type: data.material_type || undefined };
      if (editingId) await base44.entities.ProductAlias.update(editingId, payload);
      else await base44.entities.ProductAlias.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productAliases'] });
      setForm(BLANK); setEditingId(null);
      toast.success(editingId ? 'Product link updated' : 'Product link created');
    },
    onError: (err) => toast.error(err.message || 'Failed to save'),
  });

  const delMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductAlias.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productAliases'] }); toast.success('Link deleted'); },
  });

  const edit = (a) => { setEditingId(a.id); setForm({ alias_name: a.alias_name || '', stock_item_name: a.stock_item_name || '', material_type: a.material_type || '' }); };
  const reset = () => { setEditingId(null); setForm(BLANK); };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Product Links</CardTitle>
        <CardDescription>Map supplier packing-slip product names to your stock items. When receiving, matching supplier names auto-link to the stock item so inventory aligns.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">{editingId ? 'Edit link' : 'New product link'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Supplier product name (as on slip)</Label>
              <Input value={form.alias_name} onChange={e => setForm({ ...form, alias_name: e.target.value })} placeholder="e.g. Lactonol 96% ENA" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Links to stock item</Label>
              <Input list="stock-item-list" value={form.stock_item_name} onChange={e => setForm({ ...form, stock_item_name: e.target.value })} placeholder="Pick or type stock item" />
              <datalist id="stock-item-list">{stockNames.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Material type</Label>
              <select value={form.material_type} onChange={e => setForm({ ...form, material_type: e.target.value })} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                <option value="">—</option>
                {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{editingId ? 'Save Changes' : 'Add Link'}</Button>
            {editingId && <Button variant="outline" onClick={reset}>Cancel</Button>}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search links…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-sm mb-3" />
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No product links yet. Add one above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier name</TableHead>
                <TableHead>Links to stock item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-sm">{a.alias_name}</TableCell>
                  <TableCell className="text-sm"><span className="inline-flex items-center gap-1 text-green-700"><Link2 className="w-3 h-3" />{a.stock_item_name}</span></TableCell>
                  <TableCell className="text-sm">{a.material_type || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => edit(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm('Delete this link?')) delMutation.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}