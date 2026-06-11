import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Warehouse, Wine, Package, Pencil, Trash2, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';

const typeColors = {
  ethanol: 'bg-amber-100 text-amber-800',
  botanical: 'bg-emerald-100 text-emerald-800',
  grain: 'bg-yellow-100 text-yellow-800',
  sugar: 'bg-pink-100 text-pink-800',
  water: 'bg-blue-100 text-blue-800',
  flavoring: 'bg-purple-100 text-purple-800',
  packaging: 'bg-sky-100 text-sky-800',
  other: 'bg-muted text-muted-foreground',
};

// ── Adjust Stock Dialog ──────────────────────────────────────────────────────
function AdjustDialog({ item, entity, onClose, queryKey }) {
  const qc = useQueryClient();
  const isFinished = entity === 'FinishedGood';
  const [mode, setMode] = useState('set'); // 'set' | 'add' | 'subtract'
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const current = isFinished ? (item.quantity_bottles || 0) : (item.quantity || 0);
      let newQty;
      const v = parseFloat(value);
      if (mode === 'set') newQty = v;
      else if (mode === 'add') newQty = current + v;
      else newQty = Math.max(0, current - v);

      const update = isFinished ? { quantity_bottles: newQty } : { quantity: newQty };

      // Recalculate LALs if raw material with ABV
      if (!isFinished && item.abv_percent) {
        update.lals = parseFloat((newQty * item.abv_percent / 100).toFixed(3));
      }
      if (isFinished && item.abv_percent && item.bottle_size_ml) {
        update.total_lals = parseFloat((newQty * item.bottle_size_ml * item.abv_percent / 100 / 1000).toFixed(3));
      }

      return base44.entities[entity].update(item.id, update);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" /> Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{isFinished ? item.product_name : item.name}</span>
            {' — current: '}<span className="font-semibold">{isFinished ? item.quantity_bottles : item.quantity} {isFinished ? 'bottles' : item.unit}</span>
          </p>
          <div className="space-y-1">
            <Label>Adjustment type</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Set to exact value</SelectItem>
                <SelectItem value="add">Add to current</SelectItem>
                <SelectItem value="subtract">Subtract from current</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Value</Label>
            <Input type="number" min="0" step="0.001" value={value} onChange={e => setValue(e.target.value)} placeholder="Enter amount" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!value || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ──────────────────────────────────────────────────────────────
function EditDialog({ item, entity, fields, onClose, queryKey }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...item });

  const mutation = useMutation({
    mutationFn: () => base44.entities[entity].update(item.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Record</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {fields.map(f => (
            <div key={f.key} className={`space-y-1 ${f.full ? 'col-span-2' : ''}`}>
              <Label>{f.label}</Label>
              {f.type === 'select' ? (
                <Select value={form[f.key] || ''} onValueChange={v => setForm(p => ({ ...p, [f.key]: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {f.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type || 'text'}
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || '' : e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ item, entity, label, onClose, queryKey }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => base44.entities[entity].delete(item.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); onClose(); },
  });
  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <strong>{label}</strong> from inventory. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Action buttons ───────────────────────────────────────────────────────────
function Actions({ onAdjust, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAdjust} title="Adjust stock"><SlidersHorizontal className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={onDelete} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

// ── Finished Goods Table (consolidated by product + bottle size) ─────────────
function FinishedGoodsTable({ finishedGoods, loading, onOpen }) {
  const [expanded, setExpanded] = useState({});

  // Group by product_name + bottle_size_ml
  const groups = finishedGoods.reduce((acc, g) => {
    const key = `${g.product_name}||${g.bottle_size_ml}`;
    if (!acc[key]) acc[key] = { product_name: g.product_name, bottle_size_ml: g.bottle_size_ml, abv_percent: g.abv_percent, batches: [] };
    if ((g.quantity_bottles || 0) > 0) acc[key].batches.push(g);
    return acc;
  }, {});

  const groupList = Object.entries(groups).map(([key, g]) => ({
    key,
    ...g,
    total_bottles: g.batches.reduce((s, b) => s + (b.quantity_bottles || 0), 0),
    total_lals: g.batches.reduce((s, b) => s + (b.total_lals || 0), 0),
  })).filter(g => g.total_bottles > 0);

  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Bottle Size</TableHead>
              <TableHead>ABV</TableHead>
              <TableHead>Total Bottles</TableHead>
              <TableHead>Total LALs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : groupList.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No finished goods in stock</TableCell></TableRow>
            ) : groupList.map(g => (
              <>
                <TableRow
                  key={g.key}
                  className="cursor-pointer hover:bg-muted/50 font-medium"
                  onClick={() => toggle(g.key)}
                >
                  <TableCell className="w-6 pr-0">
                    {g.batches.length > 0
                      ? (expanded[g.key] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)
                      : null}
                  </TableCell>
                  <TableCell className="font-semibold text-sm">{g.product_name}</TableCell>
                  <TableCell className="text-sm">{g.bottle_size_ml ? `${g.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="text-sm">{g.abv_percent ? `${g.abv_percent}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-bold text-primary">{g.total_bottles}</TableCell>
                  <TableCell className="text-sm font-semibold">{g.total_lals.toFixed(3)}</TableCell>
                </TableRow>
                {expanded[g.key] && g.batches.map(b => (
                  <TableRow key={b.id} className="bg-muted/30">
                    <TableCell />
                    <TableCell className="text-sm text-muted-foreground pl-6">↳ {b.batch_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.bottle_size_ml ? `${b.bottle_size_ml}ml` : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.abv_percent ? `${b.abv_percent}%` : '—'}</TableCell>
                    <TableCell className="text-sm">{b.quantity_bottles}</TableCell>
                    <TableCell className="text-sm">{b.total_lals?.toFixed(3) || '—'}</TableCell>
                    <TableCell>
                      <Actions
                        onAdjust={() => onOpen('adjust', b, 'FinishedGood', 'finishedGoods')}
                        onEdit={() => onOpen('edit', b, 'FinishedGood', 'finishedGoods')}
                        onDelete={() => onOpen('delete', b, 'FinishedGood', 'finishedGoods')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [dialog, setDialog] = useState(null); // { type: 'adjust'|'edit'|'delete', item, entity, queryKey }

  const { data: rawMaterials = [], isLoading: loadingRaw } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 100),
  });

  const { data: finishedGoods = [], isLoading: loadingFinished } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 100),
  });

  const packagingItems = rawMaterials.filter(m => m.type?.toLowerCase() === 'packaging');
  const nonPackagingRaw = rawMaterials.filter(m => m.type?.toLowerCase() !== 'packaging');
  const totalEthanolLALs = rawMaterials.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);
  const totalBottles = finishedGoods.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalFinishedLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);

  const open = (type, item, entity, queryKey) => setDialog({ type, item, entity, queryKey });
  const close = () => setDialog(null);

  const rawFields = [
    { key: 'name', label: 'Name', full: true },
    { key: 'type', label: 'Type', type: 'select', options: ['ethanol','botanical','grain','sugar','water','flavoring','packaging','other'] },
    { key: 'supplier', label: 'Supplier' },
    { key: 'batch_number', label: 'Batch #' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'unit', label: 'Unit', type: 'select', options: ['litres','kg','units'] },
    { key: 'abv_percent', label: 'ABV %', type: 'number' },
    { key: 'lals', label: 'LALs', type: 'number' },
    { key: 'cost_per_unit', label: 'Cost/Unit', type: 'number' },
    { key: 'notes', label: 'Notes', full: true },
  ];

  const finishedFields = [
    { key: 'product_name', label: 'Product Name', full: true },
    { key: 'batch_number', label: 'Batch #' },
    { key: 'bottle_size_ml', label: 'Bottle Size (ml)', type: 'number' },
    { key: 'abv_percent', label: 'ABV %', type: 'number' },
    { key: 'quantity_bottles', label: 'Bottles', type: 'number' },
    { key: 'total_lals', label: 'Total LALs', type: 'number' },
    { key: 'notes', label: 'Notes', full: true },
  ];

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Inventory" subtitle="Track all raw materials and finished goods" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Raw Materials" value={nonPackagingRaw.length} subtitle="items" icon={Warehouse} />
        <StatCard title="Packaging Items" value={packagingItems.length} subtitle="item types" icon={Package} />
        <StatCard title="Ethanol LALs" value={totalEthanolLALs.toFixed(2)} subtitle="in stock" icon={Warehouse} />
        <StatCard title="Finished Bottles" value={totalBottles} subtitle="in stock" icon={Wine} />
        <StatCard title="Finished LALs" value={totalFinishedLALs.toFixed(2)} subtitle="bottled" icon={Wine} />
      </div>

      <Tabs defaultValue="raw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="packaging">Packaging</TabsTrigger>
          <TabsTrigger value="finished">Finished Goods</TabsTrigger>
        </TabsList>

        {/* Raw Materials */}
        <TabsContent value="raw">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : nonPackagingRaw.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No raw materials in stock</TableCell></TableRow>
                  ) : nonPackagingRaw.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell><Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>{m.type}</Badge></TableCell>
                      <TableCell className="text-sm">{m.quantity} {m.unit}</TableCell>
                      <TableCell className="text-sm">{m.abv_percent ? `${m.abv_percent}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{m.lals ? m.lals.toFixed(3) : '—'}</TableCell>
                      <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
                      <TableCell className="text-sm">{m.batch_number || '—'}</TableCell>
                      <TableCell>
                        <Actions
                          onAdjust={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}
                          onEdit={() => open('edit', m, 'RawMaterial', 'rawMaterials')}
                          onDelete={() => open('delete', m, 'RawMaterial', 'rawMaterials')}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Packaging */}
        <TabsContent value="packaging">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : packagingItems.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No packaging items in stock.</TableCell></TableRow>
                  ) : packagingItems.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm font-semibold">{m.quantity}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
                      <TableCell className="text-sm">{m.batch_number || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.notes || '—'}</TableCell>
                      <TableCell>
                        <Actions
                          onAdjust={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}
                          onEdit={() => open('edit', m, 'RawMaterial', 'rawMaterials')}
                          onDelete={() => open('delete', m, 'RawMaterial', 'rawMaterials')}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Finished Goods */}
        <TabsContent value="finished">
          <FinishedGoodsTable
            finishedGoods={finishedGoods}
            loading={loadingFinished}
            onOpen={open}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {dialog?.type === 'adjust' && (
        <AdjustDialog item={dialog.item} entity={dialog.entity} queryKey={dialog.queryKey} onClose={close} />
      )}
      {dialog?.type === 'edit' && (
        <EditDialog
          item={dialog.item}
          entity={dialog.entity}
          queryKey={dialog.queryKey}
          fields={dialog.entity === 'FinishedGood' ? finishedFields : rawFields}
          onClose={close}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteConfirm
          item={dialog.item}
          entity={dialog.entity}
          queryKey={dialog.queryKey}
          label={dialog.entity === 'FinishedGood' ? dialog.item.product_name : dialog.item.name}
          onClose={close}
        />
      )}
    </div>
  );
}