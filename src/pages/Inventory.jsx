import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useRawMaterialsNetStock } from '@/hooks/useRawMaterialsNetStock';
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
import { Warehouse, Wine, Package, Pencil, Trash2, SlidersHorizontal, ChevronDown, ChevronRight, Bell, AlertTriangle, ClipboardCheck } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StockReconciliation from '@/components/inventory/StockReconciliation';
import Pagination from '@/components/ui/Pagination';

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
  const [value, setValue] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const newQty = parseFloat(value) || 0;

      // quantity_bottles / quantity is already the correct displayed stock — store directly.
      const storedQty = newQty;
      const update = isFinished ? { quantity_bottles: storedQty } : { quantity: storedQty };

      // Recalculate LALs if raw material with ABV
      if (!isFinished && item.abv_percent) {
        update.lals = parseFloat((newQty * item.abv_percent / 100).toFixed(3));
      }
      if (isFinished && item.abv_percent && item.bottle_size_ml) {
        update.total_lals = parseFloat((newQty * item.bottle_size_ml * item.abv_percent / 100 / 1000).toFixed(3));
      }

      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      return entityMap[entity].update(item.id, update);
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
            <Label>New quantity</Label>
            <Input type="number" min="0" step="0.001" value={value} onChange={e => setValue(e.target.value)} placeholder="Enter new total quantity" />
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
    mutationFn: () => {
      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      return entityMap[entity].update(item.id, form);
    },
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
    mutationFn: () => {
      const entityMap = { RawMaterial: base44.entities.RawMaterial, FinishedGood: base44.entities.FinishedGood };
      return entityMap[entity].delete(item.id);
    },
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

// ── Finished Goods Table (grouped by bottle size, then by product) ──────────
function FinishedGoodsTable({ finishedGoods, loading, onOpen }) {
  const [expanded, setExpanded] = useState({});

  // First group by bottle_size_ml, then by product_name within each size
  // Merge records with the same batch_number into a single row with summed totals
  const bySize = {};
  finishedGoods.filter(g => (g.quantity_bottles || 0) > 0).forEach(g => {
    const sizeKey = g.bottle_size_ml ?? 'no-size';
    if (!bySize[sizeKey]) bySize[sizeKey] = {};

    const prodKey = g.product_name || 'Unknown';
    if (!bySize[sizeKey][prodKey]) {
      bySize[sizeKey][prodKey] = { product_name: g.product_name, bottle_size_ml: g.bottle_size_ml, abv_percent: g.abv_percent, batches: [] };
    }
    const existing = bySize[sizeKey][prodKey].batches.find(b => b.batch_number === g.batch_number);
    if (existing) {
      existing.quantity_bottles += (g.quantity_bottles || 0);
      existing.total_lals += (g.total_lals || 0);
    } else {
      bySize[sizeKey][prodKey].batches.push({ ...g, quantity_bottles: g.quantity_bottles || 0, total_lals: g.total_lals || 0 });
    }
  });

  const sizeOrder = [700, 200]; // Display 700ml first, then 200ml
  const sizes = Object.keys(bySize)
    .sort((a, b) => {
      const aNum = a === 'no-size' ? Infinity : parseInt(a);
      const bNum = b === 'no-size' ? Infinity : parseInt(b);
      return sizeOrder.indexOf(aNum) !== -1 && sizeOrder.indexOf(bNum) !== -1 
        ? sizeOrder.indexOf(aNum) - sizeOrder.indexOf(bNum)
        : aNum - bNum;
    });

  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6"></TableHead>
              <TableHead>Bottle Size</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>ABV</TableHead>
              <TableHead>Total Bottles</TableHead>
              <TableHead>Total LALs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : sizes.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No finished goods in stock</TableCell></TableRow>
            ) : sizes.flatMap(sizeKey => {
              const sizeGroup = bySize[sizeKey];
              const products = Object.entries(sizeGroup);
              
              return [
                // Size header row (collapsible)
                <TableRow key={`size-${sizeKey}`} className="bg-accent/20 hover:bg-accent/30 cursor-pointer font-bold" onClick={() => toggle(`size-${sizeKey}`)}>
                  <TableCell className="w-6 pr-0">
                    {expanded[`size-${sizeKey}`] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </TableCell>
                  <TableCell className="font-bold text-sm">{sizeKey === 'no-size' ? 'No Size' : `${sizeKey}ml`}</TableCell>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    {products.length} product{products.length !== 1 ? 's' : ''} · {products.reduce((s, [, p]) => s + p.batches.reduce((bs, b) => bs + (b.quantity_bottles || 0), 0), 0)} total bottles
                  </TableCell>
                </TableRow>,
                // Product rows (nested under size)
                ...(expanded[`size-${sizeKey}`] ? products.flatMap(([prodKey, prodGroup]) => {
                  const prodKey2 = `${sizeKey}||${prodKey}`;
                  const totalBottles = prodGroup.batches.reduce((s, b) => s + (b.quantity_bottles || 0), 0);
                  const totalLals = prodGroup.batches.reduce((s, b) => s + (b.total_lals || 0), 0);
                  
                  return [
                    <TableRow key={prodKey2} className="cursor-pointer hover:bg-muted/50" onClick={() => toggle(prodKey2)}>
                      <TableCell className="w-6 pr-0 pl-6">
                        {prodGroup.batches.length > 0 && (expanded[prodKey2] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                      </TableCell>
                      <TableCell className="text-sm"></TableCell>
                      <TableCell className="font-semibold text-sm">{prodKey}</TableCell>
                      <TableCell className="text-sm">{prodGroup.abv_percent ? `${prodGroup.abv_percent}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-bold text-primary">{totalBottles}</TableCell>
                      <TableCell className="text-sm font-semibold">{totalLals.toFixed(3)}</TableCell>
                    </TableRow>,
                    // Batch rows (nested under product)
                    ...(expanded[prodKey2] ? prodGroup.batches.map(b => (
                      <TableRow key={b.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell></TableCell>
                        <TableCell className="text-sm text-muted-foreground pl-12">↳ {b.batch_number}</TableCell>
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
                    )) : [])
                  ];
                }) : [])
              ];
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}


// ── Low Stock Alerts Component ───────────────────────────────────────────────
function LowStockAlerts({ rawMaterials, thresholds }) {
  const qc = useQueryClient();

  const setMutation = useMutation({
    mutationFn: async ({ materialId, materialName, unit, threshold }) => {
      const existing = thresholds.find(t => t.raw_material_id === materialId);
      if (threshold === '' || parseFloat(threshold) <= 0) {
        if (existing) await base44.entities.StockThreshold.delete(existing.id);
        return;
      }
      if (existing) {
        await base44.entities.StockThreshold.update(existing.id, { threshold: parseFloat(threshold) });
      } else {
        await base44.entities.StockThreshold.create({
          raw_material_id: materialId,
          material_name: materialName,
          threshold: parseFloat(threshold),
          unit,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stockThresholds'] }),
  });

  const alertItems = rawMaterials
    .map(m => {
      const t = thresholds.find(th => th.raw_material_id === m.id);
      const isLow = t && (m.quantity || 0) <= t.threshold;
      return { ...m, threshold: t?.threshold, isLow };
    })
    .filter(m => m.isLow);

  const allItems = rawMaterials.filter(m => m.type !== 'packaging');

  return (
    <div className="space-y-6">
      {/* Current alerts */}
      {alertItems.length > 0 && (
        <Card className="border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">{alertItems.length} item{alertItems.length !== 1 ? 's' : ''} below minimum stock level</p>
          </div>
          <div className="divide-y divide-border">
            {alertItems.map(m => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-destructive">{m.quantity?.toFixed(2)} {m.unit}</p>
                  <p className="text-xs text-muted-foreground">min: {m.threshold} {m.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {alertItems.length === 0 && thresholds.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <Bell className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">All items are above their minimum stock levels</p>
        </div>
      )}

      {/* Set thresholds table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-sm font-semibold">Set minimum stock levels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Leave blank to disable alerts for that item</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Current stock</TableHead>
                <TableHead>Minimum level</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems.map(m => {
                const t = thresholds.find(th => th.raw_material_id === m.id);
                const isLow = t && (m.quantity || 0) <= t.threshold;
                return (
                  <TableRow key={m.id} className={isLow ? 'bg-amber-50/50' : ''}>
                    <TableCell className="font-medium text-sm">{m.name}</TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">{m.type}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className={isLow ? 'text-destructive font-semibold' : ''}>
                        {m.quantity?.toFixed(2)} {m.unit}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={t?.threshold ?? ''}
                          placeholder="e.g. 50"
                          className="h-8 w-28 text-sm"
                          onBlur={e => {
                            const val = e.target.value;
                            if (val !== String(t?.threshold ?? '')) {
                              setMutation.mutate({
                                materialId: m.id,
                                materialName: m.name,
                                unit: m.unit,
                                threshold: val,
                              });
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{m.unit}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {!t ? (
                        <span className="text-xs text-muted-foreground">No alert set</span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Low stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          ✓ OK
                        </span>
                      )}
                    </TableCell>
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [dialog, setDialog] = useState(null); // { type: 'adjust'|'edit'|'delete', item, entity, queryKey }
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(50);
  const [pkgPage, setPkgPage] = useState(1);
  const [pkgPageSize, setPkgPageSize] = useState(50);

  const {
    rawMaterialsWithNetStock: rawMaterialsWithNetStockFromHook,
    isLoading: loadingRaw,
    spiritRecipes,
    packagingRecipes,
    botanicalConsumedByName,
    packagingConsumedByName,
    receivedByName,
    totalBottlesBottled700,
    totalBottlesBottled200,
  } = useRawMaterialsNetStock();
  const rawMaterials = rawMaterialsWithNetStockFromHook;

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 5000),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 5000),
  });

  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 5000),
  });

  const { data: finishedGoods = [], isLoading: loadingFinished } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 5000),
  });

  const { data: thresholds = [] } = useQuery({
    queryKey: ['stockThresholds'],
    queryFn: async () => { try { return await base44.entities.StockThreshold.list('material_name', 5000); } catch { return []; } },
  });

  const { data: allReceivings = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 5000),
  });

  // quantity_bottles on each FinishedGood record is already the correct post-dispatch figure.
  // No dispatch subtraction is needed here — doing so would double-count.
  const rawMaterialsWithNetStock = rawMaterialsWithNetStockFromHook;

  const packagingItems = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() === 'packaging');
  const nonPackagingRaw = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() !== 'packaging');
  const pagedRaw = nonPackagingRaw.slice((rawPage - 1) * rawPageSize, rawPage * rawPageSize);
  const pagedPkg = packagingItems.slice((pkgPage - 1) * pkgPageSize, pkgPage * pkgPageSize);
  const totalEthanolLALs = rawMaterialsWithNetStock.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);
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
          <TabsTrigger value="alerts" className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            Low Stock Alerts
          </TabsTrigger>
          <TabsTrigger value="reconcile" className="flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Reconcile
          </TabsTrigger>
          <TabsTrigger value="debug" className="text-amber-600 font-bold">🔍 Debug</TabsTrigger>
        </TabsList>

        {/* Raw Materials */}
        <TabsContent value="raw">
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
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
                  ) : pagedRaw.map(m => (
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
            <MobileCardGrid>
              {loadingRaw ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : nonPackagingRaw.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No raw materials in stock</p>
              ) : pagedRaw.map(m => (
                <MobileCard
                  key={m.id}
                  title={m.name}
                  subtitle={m.supplier || '—'}
                  badge={<Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>{m.type}</Badge>}
                  accent={<span className="text-sm font-bold">{m.quantity} {m.unit}</span>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}><SlidersHorizontal className="w-3.5 h-3.5" /> Adjust</Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('edit', m, 'RawMaterial', 'rawMaterials')}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => open('delete', m, 'RawMaterial', 'rawMaterials')}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  }
                >
                  <MobileDetailRow label="ABV" value={m.abv_percent ? `${m.abv_percent}%` : '—'} />
                  <MobileDetailRow label="LALs" value={m.lals ? m.lals.toFixed(3) : '—'} highlight />
                  <MobileDetailRow label="Batch" value={m.batch_number || '—'} />
                </MobileCard>
              ))}
            </MobileCardGrid>
            <Pagination total={nonPackagingRaw.length} page={rawPage} pageSize={rawPageSize} onPageChange={setRawPage} onPageSizeChange={(s) => { setRawPageSize(s); setRawPage(1); }} />
          </Card>
        </TabsContent>

        {/* Packaging */}
        <TabsContent value="packaging">
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
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
                  ) : pagedPkg.map(m => (
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
            <MobileCardGrid>
              {loadingRaw ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : packagingItems.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No packaging items in stock</p>
              ) : pagedPkg.map(m => (
                <MobileCard
                  key={m.id}
                  title={m.name}
                  subtitle={m.supplier || '—'}
                  accent={<span className="text-sm font-bold">{m.quantity} {m.unit}</span>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('adjust', m, 'RawMaterial', 'rawMaterials')}><SlidersHorizontal className="w-3.5 h-3.5" /> Adjust</Button>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => open('edit', m, 'RawMaterial', 'rawMaterials')}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => open('delete', m, 'RawMaterial', 'rawMaterials')}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </>
                  }
                >
                  <MobileDetailRow label="Batch" value={m.batch_number || '—'} />
                  <MobileDetailRow label="Notes" value={m.notes || '—'} />
                </MobileCard>
              ))}
            </MobileCardGrid>
            <Pagination total={packagingItems.length} page={pkgPage} pageSize={pkgPageSize} onPageChange={setPkgPage} onPageSizeChange={(s) => { setPkgPageSize(s); setPkgPage(1); }} />
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
        {/* Low Stock Alerts */}
        <TabsContent value="alerts">
          <LowStockAlerts rawMaterials={rawMaterialsWithNetStock} thresholds={thresholds} />
        </TabsContent>

        <TabsContent value="reconcile">
          <StockReconciliation />
        </TabsContent>

        <TabsContent value="debug">
          <div className="space-y-4 text-xs font-mono">

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-bold text-amber-800 mb-2">Recipes loaded</p>
              <p className="text-amber-700">Spirit recipes: {spiritRecipes.length} | Packaging recipes: {packagingRecipes.length}</p>
              {spiritRecipes.map(r => (
                <div key={r.id} className="mt-2 border-t border-amber-200 pt-2">
                  <p className="font-semibold">"{r.name}" — base: {r.base_ethanol_volume}L @ {r.base_ethanol_abv}% ABV</p>
                  <p>Ingredients: {(r.ingredients || []).map(i => `${i.name} (${i.quantity}${i.unit})`).join(', ') || 'NONE'}</p>
                </div>
              ))}
              {packagingRecipes.map(r => (
                <div key={r.id} className="mt-2 border-t border-amber-200 pt-2">
                  <p className="font-semibold">"{r.name}" (packaging)</p>
                  <p>Items: {(r.packaging || []).map(p => `${p.name} (x${p.quantity})`).join(', ') || 'NONE'}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="font-bold text-blue-800 mb-2">Distillation runs matched to recipes</p>
              {spiritRecipes.map(recipe => {
                const matched = distillationRuns.filter(r =>
                  r.input_volume &&
                  (r.product_name || '').toLowerCase().trim() === (recipe.name || '').toLowerCase().trim()
                );
                return (
                  <div key={recipe.id} className="mt-1">
                    <p>"{recipe.name}": <strong>{matched.length} runs matched</strong></p>
                    {matched.length === 0 && (
                      <p className="text-red-600">⚠ No runs matched. Run product names: {[...new Set(distillationRuns.map(r => r.product_name))].join(', ') || 'none'}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-bold text-green-800 mb-2">Botanical deductions calculated</p>
              {Object.keys(botanicalConsumedByName).length === 0
                ? <p className="text-red-600">⚠ Nothing calculated — check recipe ingredients and distillation run product names match</p>
                : Object.entries(botanicalConsumedByName).map(([k, v]) => (
                    <p key={k}>{k}: <strong>{v.toFixed(3)} kg</strong></p>
                  ))
              }
            </div>

            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <p className="font-bold text-purple-800 mb-2">Packaging deductions calculated</p>
              <p className="mb-1">700ml bottles produced: {totalBottlesBottled700} | 200ml: {totalBottlesBottled200}</p>
              {Object.keys(packagingConsumedByName).length === 0
                ? <p className="text-red-600">⚠ Nothing calculated — check packaging recipe names contain bottle size (e.g. 700ml)</p>
                : Object.entries(packagingConsumedByName).map(([k, v]) => (
                    <p key={k}>{k}: <strong>{v.toFixed(0)} units</strong></p>
                  ))
              }
              {packagingRecipes.map(recipe => {
                const recipeName = (recipe.name || '').toLowerCase();
                const sizeMatch = recipeName.match(/(\d+)ml/);
                const recipeSizeMl = sizeMatch ? parseInt(sizeMatch[1]) : null;
                const matched = recipeSizeMl
                  ? bottlingRuns.filter(r => r.bottle_size_ml === recipeSizeMl)
                  : bottlingRuns.filter(r => (r.product_name || '').toLowerCase().trim() === recipeName);
                return (
                  <div key={recipe.id} className="mt-1">
                    <p>"{recipe.name}" (matching by {recipeSizeMl ? `${recipeSizeMl}ml size` : 'product name'}): <strong>{matched.length} runs, {matched.reduce((s,r) => s+(r.bottles_produced||0),0)} bottles</strong></p>
                    {matched.length === 0 && (
                      <p className="text-red-600">⚠ No runs matched. Bottle sizes found: {[...new Set(bottlingRuns.map(r => String(r.bottle_size_ml)))].join(', ') || 'none'}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="font-bold text-gray-800 mb-2">Received items by name and type</p>
              {Object.entries(receivedByName).map(([k, v]) => (
                <p key={k}>{k}: {v.quantity} {v.unit} | type: <strong>{v.type}</strong></p>
              ))}
              {Object.keys(receivedByName).length === 0 && <p className="text-red-600">⚠ No receiving records found</p>}
            </div>

          </div>
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