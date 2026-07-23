import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const SIZE_ORDER = [700, 200];

export default function StockReconciliation() {
  const qc = useQueryClient();
  const [counts, setCounts] = useState({});   // { finishedGoodId: { physical: string, notes: string } }
  const [confirmed, setConfirmed] = useState({}); // { finishedGoodId: true }
  const [tastingExpanded, setTastingExpanded] = useState(false);

  const [backfillPreview, setBackfillPreview] = useState(null);

  const backfillPreviewMutation = useMutation({
    mutationFn: async () => {
      // Fetch all bottling runs, recipes and raw materials
      const [allRuns, allRecipes, allRM] = await Promise.all([
        base44.entities.BottlingRun.list('-date', 5000),
        base44.entities.Recipe.list('name', 500),
        base44.entities.RawMaterial.list('name', 5000),
      ]);

      const findRM = (pkgName) => {
        const target = (pkgName || '').toLowerCase().trim();
        let match = allRM.find(r => (r.name || '').toLowerCase().trim() === target);
        if (!match) match = allRM.find(r => {
          const name = (r.name || '').toLowerCase().trim();
          return name.includes(target) || target.includes(name);
        });
        return match;
      };

      // Group deductions by RawMaterial id
      const deductions = {};
      const runDetails = [];

      for (const run of allRuns) {
        // Find recipe — match by recipe_id or by product_name + bottle_size
        let recipe = allRecipes.find(r => r.id === run.recipe_id);
        if (!recipe) {
          recipe = allRecipes.find(r =>
            r.recipe_type === 'packaging' &&
            r.name?.toLowerCase().includes(String(run.bottle_size_ml || '').toLowerCase())
          );
        }
        if (!recipe?.packaging?.length) continue;

        const bottles = run.bottles_produced || 0;
        if (bottles <= 0) continue;

        const runItems = [];
        for (const pkg of recipe.packaging) {
          if (!pkg.name) continue;
          const rm = findRM(pkg.name);
          if (!rm) continue;
          const needed = (pkg.quantity || 1) * bottles;
          if (!deductions[rm.id]) deductions[rm.id] = { rm, total: 0 };
          deductions[rm.id].total += needed;
          runItems.push({ pkgName: pkg.name, rmName: rm.name, needed });
        }
        if (runItems.length > 0) {
          runDetails.push({ run, recipe, items: runItems });
        }
      }

      // Build summary of what will be deducted
      return Object.values(deductions).map(({ rm, total }) => ({
        id: rm.id,
        name: rm.name,
        currentQty: rm.quantity || 0,
        deduction: total,
        newQty: Math.max(0, (rm.quantity || 0) - total),
        runs: runDetails.filter(r => r.items.some(i => i.rmName === rm.name)).length,
      }));
    },
    onSuccess: (data) => {
      setBackfillPreview(data);
      if (data.length === 0) toast.info('No historical packaging deductions to apply — all runs either have no recipe or no packaging items matched');
    },
    onError: () => toast.error('Failed to calculate backfill'),
  });

  const backfillApplyMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        await base44.entities.RawMaterial.update(item.id, {
          quantity: parseFloat(item.newQty.toFixed(4)),
        });
      }
      return items.length;
    },
    onSuccess: (count) => {
      toast.success(`Applied packaging deductions to ${count} inventory items`);
      setBackfillPreview(null);
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
    },
    onError: () => toast.error('Failed to apply deductions'),
  });

  const { data: finishedGoods = [], isLoading } = useQuery({
    queryKey: ['finishedGoodsReconcile'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 5000),
  });

  // Separate Tasting items
  const tastingItems = useMemo(
    () => finishedGoods.filter(g => (g.product_name || '').toLowerCase().includes('tasting')),
    [finishedGoods]
  );
  const regularItems = useMemo(
    () => finishedGoods.filter(g => !(g.product_name || '').toLowerCase().includes('tasting')),
    [finishedGoods]
  );

  // Group by bottle size (700ml first, then 200ml, then others)
  const grouped = useMemo(() => {
    const bySize = {};
    regularItems.forEach(g => {
      const size = g.bottle_size_ml ?? 'no-size';
      if (!bySize[size]) bySize[size] = [];
      bySize[size].push(g);
    });
    return Object.entries(bySize).sort(([a], [b]) => {
      const aNum = a === 'no-size' ? Infinity : parseInt(a);
      const bNum = b === 'no-size' ? Infinity : parseInt(b);
      const aIdx = SIZE_ORDER.indexOf(aNum);
      const bIdx = SIZE_ORDER.indexOf(bNum);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return aNum - bNum;
    });
  }, [regularItems]);

  const enteredCount = Object.values(counts).filter(c => c.physical !== '' && c.physical !== undefined).length;
  const reconciledCount = Object.keys(confirmed).length;
  const totalToReconcile = regularItems.length;

  const updateCount = (id, field, value) => {
    setCounts(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const singleMutation = useMutation({
    mutationFn: async ({ fg }) => {
      const entry = counts[fg.id];
      const newQty = parseInt(entry.physical) || 0;
      const noteText = entry.notes || 'Stock reconciliation';
      const dateStr = format(new Date(), 'dd MMM yyyy');
      const reconciliationNote = `[${dateStr}] ${noteText}`;
      const existingNotes = fg.notes ? fg.notes + ' | ' : '';
      await base44.entities.FinishedGood.update(fg.id, {
        quantity_bottles: newQty,
        notes: existingNotes + reconciliationNote,
      });
      return fg.id;
    },
    onSuccess: (id) => {
      setConfirmed(prev => ({ ...prev, [id]: true }));
      qc.invalidateQueries({ queryKey: ['finishedGoodsReconcile'] });
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      toast.success('Stock reconciled successfully');
    },
    onError: () => toast.error('Failed to reconcile stock'),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const toSave = regularItems.filter(g => {
        const entry = counts[g.id];
        return entry && entry.physical !== '' && entry.physical !== undefined && parseInt(entry.physical) !== (g.quantity_bottles || 0);
      });
      const updates = toSave.map(g => {
        const entry = counts[g.id];
        const newQty = parseInt(entry.physical) || 0;
        const noteText = entry.notes || 'Stock reconciliation';
        const dateStr = format(new Date(), 'dd MMM yyyy');
        const reconciliationNote = `[${dateStr}] ${noteText}`;
        const existingNotes = g.notes ? g.notes + ' | ' : '';
        return {
          id: g.id,
          quantity_bottles: newQty,
          notes: existingNotes + reconciliationNote,
        };
      });
      if (updates.length === 0) return [];
      await base44.entities.FinishedGood.bulkUpdate(updates);
      return updates.map(u => u.id);
    },
    onSuccess: (ids) => {
      const newConfirmed = { ...confirmed };
      ids.forEach(id => { newConfirmed[id] = true; });
      setConfirmed(newConfirmed);
      qc.invalidateQueries({ queryKey: ['finishedGoodsReconcile'] });
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      toast.success(`${ids.length} record${ids.length !== 1 ? 's' : ''} reconciled successfully`);
    },
    onError: () => toast.error('Failed to reconcile stock in bulk'),
  });

  const renderRow = (g) => {
    const entry = counts[g.id] || {};
    const physical = entry.physical;
    const hasPhysical = physical !== '' && physical !== undefined;
    const systemQty = g.quantity_bottles || 0;
    const variance = hasPhysical ? (parseInt(physical) || 0) - systemQty : null;
    const isConfirmed = confirmed[g.id];
    const canConfirm = hasPhysical && parseInt(physical) !== systemQty && !isConfirmed;

    return (
      <TableRow key={g.id} className={isConfirmed ? 'bg-emerald-50/50' : ''}>
        <TableCell className="text-sm font-medium">{g.product_name}</TableCell>
        <TableCell className="text-sm font-mono text-xs">{g.batch_number}</TableCell>
        <TableCell className="text-sm">{g.bottle_size_ml ? `${g.bottle_size_ml}ml` : '—'}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{systemQty}</TableCell>
        <TableCell>
          <Input
            type="number"
            min="0"
            value={physical ?? ''}
            onChange={e => updateCount(g.id, 'physical', e.target.value)}
            placeholder="Enter count"
            disabled={isConfirmed}
            className="h-8 w-28 text-sm"
          />
        </TableCell>
        <TableCell className="text-sm font-semibold">
          {variance === null ? (
            <span className="text-muted-foreground">—</span>
          ) : variance === 0 ? (
            <span className="text-muted-foreground">0</span>
          ) : variance > 0 ? (
            <span className="text-emerald-600">+{variance}</span>
          ) : (
            <span className="text-destructive">{variance}</span>
          )}
        </TableCell>
        <TableCell>
          <Input
            type="text"
            value={entry.notes || ''}
            onChange={e => updateCount(g.id, 'notes', e.target.value)}
            placeholder="Reason for adjustment"
            disabled={isConfirmed}
            className="h-8 w-48 text-sm"
          />
        </TableCell>
        <TableCell>
          {isConfirmed ? (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Reconciled
            </Badge>
          ) : (
            <Button
              size="sm"
              disabled={!canConfirm || singleMutation.isPending}
              onClick={() => singleMutation.mutate({ fg: g })}
            >
              {singleMutation.isPending && singleMutation.variables?.fg?.id === g.id ? 'Saving…' : 'Confirm'}
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      {/* Packaging Backfill Tool */}
      <div className="border border-purple-200 bg-purple-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-purple-700">📦</span>
            <h3 className="font-semibold text-purple-800 text-sm">Backfill Historical Packaging Deductions</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => backfillPreviewMutation.mutate()} disabled={backfillPreviewMutation.isPending}>
            {backfillPreviewMutation.isPending ? 'Calculating...' : 'Calculate Deductions'}
          </Button>
        </div>
        <p className="text-xs text-purple-700">Scans all historical bottling runs and calculates the packaging that should have been deducted from inventory. Run this once to sync your packaging stock with actual usage.</p>
        <div className="bg-amber-50 border border-amber-200 rounded p-2">
          <p className="text-xs text-amber-700">⚠ This will deduct from your current inventory quantities based on ALL past bottling runs. Only run this once — running it again will double-deduct.</p>
        </div>
        {backfillPreview && backfillPreview.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-purple-800">The following packaging deductions will be applied:</p>
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Packaging Item</th>
                    <th className="text-right p-2">Current Stock</th>
                    <th className="text-right p-2 text-red-600">Total Deduction</th>
                    <th className="text-right p-2 text-purple-700 font-bold">New Stock</th>
                    <th className="text-right p-2">Bottling Runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backfillPreview.map(item => (
                    <tr key={item.id} className={item.newQty === 0 ? 'bg-red-50' : ''}>
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2 text-right">{item.currentQty}</td>
                      <td className="p-2 text-right text-red-600">-{item.deduction.toFixed(0)}</td>
                      <td className="p-2 text-right font-bold text-purple-700">{item.newQty.toFixed(0)}</td>
                      <td className="p-2 text-right text-muted-foreground">{item.runs} runs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">If any "New Stock" values look wrong, adjust your current inventory quantities first before running this.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => backfillApplyMutation.mutate(backfillPreview)} disabled={backfillApplyMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
                {backfillApplyMutation.isPending ? 'Applying...' : `Apply ${backfillPreview.length} Deduction${backfillPreview.length !== 1 ? 's' : ''}`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBackfillPreview(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Summary Banner */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total to Reconcile</p>
              <p className="text-2xl font-bold font-display text-foreground">{totalToReconcile}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Counts Entered</p>
              <p className="text-2xl font-bold font-display text-blue-600">{enteredCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Reconciled This Session</p>
              <p className="text-2xl font-bold font-display text-emerald-600">{reconciledCount}</p>
            </div>
          </div>
          <Button
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending || enteredCount === 0}
            className="gap-2"
          >
            <ClipboardCheck className="w-4 h-4" />
            {bulkMutation.isPending ? 'Saving…' : 'Confirm All Entered'}
          </Button>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>System Qty</TableHead>
                <TableHead>Physical Count</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-28">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : grouped.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No finished goods found</TableCell></TableRow>
              ) : grouped.flatMap(([sizeKey, items]) => {
                return [
                  <TableRow key={`size-${sizeKey}`} className="bg-accent/20">
                    <TableCell colSpan={8} className="font-bold text-sm py-2">
                      {sizeKey === 'no-size' ? 'No Size' : `${sizeKey}ml`} — {items.length} record{items.length !== 1 ? 's' : ''}
                    </TableCell>
                  </TableRow>,
                  ...items.map(renderRow),
                ];
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Tasting Items - Collapsed */}
      {tastingItems.length > 0 && (
        <Collapsible open={tastingExpanded} onOpenChange={setTastingExpanded}>
          <Card className="overflow-hidden">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                <span className="font-semibold text-sm flex items-center gap-2">
                  {tastingExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Tasting Bottles ({tastingItems.length})
                </span>
                <span className="text-xs text-muted-foreground">Click to expand</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>System Qty</TableHead>
                      <TableHead>Physical Count</TableHead>
                      <TableHead>Variance</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tastingItems.map(renderRow)}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}