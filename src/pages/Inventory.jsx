import { useState } from 'react';
// Net stock is computed dynamically from production records — no static deductions needed
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
import { Warehouse, Wine, Package, Pencil, Trash2, SlidersHorizontal, ChevronDown, ChevronRight, Bell, AlertTriangle } from 'lucide-react';
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

  const { data: rawMaterials = [], isLoading: loadingRaw } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 100),
  });

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('date', 200),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('date', 200),
  });

  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('date', 500),
  });

  const { data: finishedGoods = [], isLoading: loadingFinished } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 100),
  });

  const { data: thresholds = [] } = useQuery({
    queryKey: ['stockThresholds'],
    queryFn: () => base44.entities.StockThreshold.list('material_name', 200),
  });

  const { data: allReceivings = [] } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 2000),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 50),
  });

  const { data: allDispatches = [], isLoading: loadingDispatches } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 2000),
  });
  const loading3PLDispatches = false;

  // Build dispatch totals per batch+product key
  const dispatchedByBatch = allDispatches.reduce((acc, d) => {
    const key = `${d.batch_number}||${d.product_name}`;
    acc[key] = (acc[key] || 0) + (d.quantity_bottles || 0);
    return acc;
  }, {});

  // Compute live remaining stock per FinishedGood record
  const finishedGoodsWithStock = finishedGoods.map(g => {
    const key = `${g.batch_number}||${g.product_name}`;
    const dispatched = dispatchedByBatch[key] || 0;
    const bottled = g.quantity_bottles || 0;
    const remaining = Math.max(0, bottled - dispatched);
    const lalsPerBottle = bottled > 0 && g.total_lals ? g.total_lals / bottled : 0;
    return {
      ...g,
      quantity_bottles: remaining,
      total_lals: parseFloat((remaining * lalsPerBottle).toFixed(3)),
    };
  });

  // Total litres of each ethanol type consumed across all distillation runs
  // Use input_volume (actual litres charged to still) directly
  const ethanolConsumedByLotCode = distillationRuns
    .filter(r => r.input_volume)
    .reduce((acc, r) => {
      const lot = (r.ethanol_lot_code || '').toLowerCase();
      acc[lot] = (acc[lot] || 0) + (r.input_volume || 0);
      return acc;
    }, {});

  // Dilution runs that consume raw ethanol directly (non-hearts, input_abv !== 79)
  const rawEthanolConsumedInDilutions = dilutions
    .filter(d => d.input_abv !== 79 && d.input_ethanol_volume)
    .reduce((s, d) => s + (d.input_ethanol_volume || 0), 0);

  // ── Recipe-driven deduction calculations ────────────────────────────────────

  // Spirit recipes: build a map of { ingredientNameLower -> totalConsumed }
  // by matching each distillation run's product_name to a spirit recipe
  const spiritRecipes = recipes.filter(r => r.recipe_type === 'spirit');
  const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');

  // For each spirit recipe, count how many completed distillation runs used it
  const botanicalConsumedByName = {};
  spiritRecipes.forEach(recipe => {
    if (!recipe.ingredients?.length) return;
    const runsForRecipe = distillationRuns.filter(
      r => r.product_name?.toLowerCase().trim() === recipe.name?.toLowerCase().trim() && r.input_volume
    ).length;
    if (runsForRecipe === 0) return;
    recipe.ingredients.forEach(ing => {
      const key = (ing.name || '').toLowerCase().trim();
      if (!key) return;
      botanicalConsumedByName[key] = (botanicalConsumedByName[key] || 0) + (ing.quantity || 0) * runsForRecipe;
    });
  });

  // For packaging recipes: build a map of { packagingNameLower -> totalConsumed }
  // by matching each bottling run's product_name to a packaging recipe
  const packagingConsumedByName = {};
  packagingRecipes.forEach(recipe => {
    if (!recipe.packaging?.length) return;
    const bottlesForRecipe = bottlingRuns
      .filter(r => r.product_name?.toLowerCase().trim() === recipe.name?.toLowerCase().trim())
      .reduce((s, r) => s + (r.bottles_produced || 0), 0);
    if (bottlesForRecipe === 0) return;
    recipe.packaging.forEach(pkg => {
      const key = (pkg.name || '').toLowerCase().trim();
      if (!key) return;
      const qty = (pkg.quantity || 1) * bottlesForRecipe;
      packagingConsumedByName[key] = (packagingConsumedByName[key] || 0) + qty;
    });
  });

  // Total bottles produced (still needed for finished goods display)
  const totalBottlesBottled700 = bottlingRuns
    .filter(r => r.bottle_size_ml === 700)
    .reduce((s, r) => s + (r.bottles_produced || 0), 0);
  const totalBottlesBottled200 = bottlingRuns
    .filter(r => r.bottle_size_ml === 200)
    .reduce((s, r) => s + (r.bottles_produced || 0), 0);

  // Build received quantities per material name from Receiving records
  const receivedByName = allReceivings.reduce((acc, r) => {
    const key = (r.material_name || '').toLowerCase().trim();
    if (!acc[key]) acc[key] = { quantity: 0, lals: 0, unit: r.unit };
    acc[key].quantity += r.quantity || 0;
    acc[key].lals += r.lals || 0;
    return acc;
  }, {});

  // Build a merged list: start from Receiving records for materials not in RawMaterial
  const receivingMaterialNames = Object.keys(receivedByName);
  const rawMaterialNames = rawMaterials.map(m => (m.name || '').toLowerCase().trim());
  const receivingOnlyMaterials = receivingMaterialNames
    .filter(k => !rawMaterialNames.includes(k))
    .map(k => {
      const sample = allReceivings.find(r => (r.material_name || '').toLowerCase().trim() === k);
      return {
        id: 'recv-' + k,
        name: sample?.material_name || k,
        type: (sample?.material_type || 'other').toLowerCase(),
        quantity: receivedByName[k].quantity,
        lals: receivedByName[k].lals,
        unit: receivedByName[k].unit || 'units',
        _fromReceiving: true,
      };
    });

  const allRawMaterials = [...rawMaterials, ...receivingOnlyMaterials];

  // Apply net-stock to raw materials
  const rawMaterialsWithNetStock = allRawMaterials.map(m => {
    const nameKey = (m.name || '').toLowerCase().trim();
    const received = receivedByName[nameKey];

    // For materials that only exist in RawMaterial (manually added), keep their quantity
    // For materials that exist in Receiving, use received total as the base
    let netQty = received ? received.quantity : (m.quantity || 0);
    let netLals = received ? received.lals : (m.lals || 0);

    const nameLower = m.name?.toLowerCase() || '';

    if (m.type === 'ethanol') {
      const isLactonol = nameLower.includes('lactonol');
      const isEna = nameLower.includes('extra neutral') || nameLower.includes('ena');
      let consumed = 0;
      if (isLactonol) {
        consumed += (ethanolConsumedByLotCode['eth-lactonol'] || 0) + (ethanolConsumedByLotCode['lactonol'] || 0);
        consumed += rawEthanolConsumedInDilutions;
      } else if (isEna) {
        consumed += (ethanolConsumedByLotCode['eth-ena'] || 0) + (ethanolConsumedByLotCode['ena'] || 0);
      } else {
        const matched = ['eth-lactonol', 'lactonol', 'eth-ena', 'ena'];
        consumed += Object.entries(ethanolConsumedByLotCode)
          .filter(([k]) => !matched.includes(k))
          .reduce((s, [, v]) => s + v, 0);
      }
      netLals = Math.max(0, netLals - (consumed * (m.abv_percent || 0) / 100));
      netQty = Math.max(0, netQty - consumed);
    }

    // Deduct botanicals based on actual recipe × distillation run count
    if (m.type === 'botanical') {
      // Try exact match first, then partial match
      const exactKey = Object.keys(botanicalConsumedByName).find(k => k === nameLower);
      const partialKey = exactKey || Object.keys(botanicalConsumedByName).find(k => nameLower.includes(k) || k.includes(nameLower));
      if (partialKey) {
        const consumed = botanicalConsumedByName[partialKey] || 0;
        netQty = Math.max(0, netQty - consumed);
      }
    }

    // Deduct packaging consumed in bottling runs using actual packaging recipes
    if (m.type === 'packaging') {
      // Try exact match first, then partial
      const exactKey = Object.keys(packagingConsumedByName).find(k => k === nameLower);
      const partialKey = exactKey || Object.keys(packagingConsumedByName).find(k => nameLower.includes(k) || k.includes(nameLower));
      if (partialKey) {
        netQty = Math.max(0, netQty - (packagingConsumedByName[partialKey] || 0));
      }
    }

    netLals = m.abv_percent && m.type === 'ethanol'
      ? parseFloat((netQty * m.abv_percent / 100).toFixed(3))
      : (received ? received.lals : m.lals);

    return { ...m, quantity: parseFloat(netQty.toFixed(2)), lals: netLals };
  });

  const packagingItems = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() === 'packaging');
  const nonPackagingRaw = rawMaterialsWithNetStock.filter(m => m.type?.toLowerCase() !== 'packaging');
  const totalEthanolLALs = rawMaterialsWithNetStock.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);
  const totalBottles = finishedGoodsWithStock.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalFinishedLALs = finishedGoodsWithStock.reduce((s, g) => s + (g.total_lals || 0), 0);

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
            finishedGoods={finishedGoodsWithStock}
            loading={loadingFinished || loadingDispatches || loading3PLDispatches}
            onOpen={open}
          />
        </TabsContent>
        {/* Low Stock Alerts */}
        <TabsContent value="alerts">
          <LowStockAlerts rawMaterials={rawMaterialsWithNetStock} thresholds={thresholds} />
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