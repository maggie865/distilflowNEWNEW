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

  const [mergeTastingResult, setMergeTastingResult] = useState(null);

  const mergeTastingMutation = useMutation({
    mutationFn: async () => {
      const allFG = await base44.entities.FinishedGood.list('product_name', 5000);
      // Find all records with "Tasting" in the name
      const tastingRecords = allFG.filter(g => (g.product_name || '').includes('Tasting'));
      
      // Group by batch_number + bottle_size_ml to find duplicates
      const groups = {};
      for (const g of tastingRecords) {
        // Normalise name by removing size suffix from product name
        const baseName = (g.product_name || '').replace(/\s+\d+ml\s*—/, ' —').trim();
        const key = `${baseName}||${g.batch_number}||${g.bottle_size_ml}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(g);
      }

      // Find groups with more than one record
      const dupes = Object.entries(groups).filter(([, recs]) => recs.length > 1);
      if (dupes.length === 0) return { merged: 0 };

      let merged = 0;
      for (const [, recs] of dupes) {
        // Keep the first, merge others into it
        const [keep, ...rest] = recs;
        const totalQty = recs.reduce((s, r) => s + (r.quantity_bottles || 0), 0);
        const totalLals = recs.reduce((s, r) => s + (r.total_lals || 0), 0);
        // Normalise name to remove size from product name
        const cleanName = keep.product_name.replace(/\s+\d+ml\s*—/, ' —').trim();
        await base44.entities.FinishedGood.update(keep.id, {
          product_name: cleanName,
          quantity_bottles: totalQty,
          total_lals: parseFloat(totalLals.toFixed(4)),
          is_tasting: true,
        });
        for (const r of rest) {
          await base44.entities.FinishedGood.delete(r.id);
        }
        merged++;
      }
      return { merged };
    },
    onSuccess: (data) => {
      if (data.merged === 0) toast.success('No duplicate tasting records found — all clean');
      else {
        toast.success(`Merged ${data.merged} duplicate tasting record groups`);
        qc.invalidateQueries({ queryKey: ['finishedGoods'] });
        qc.invalidateQueries({ queryKey: ['finishedGoodsReconcile'] });
      }
      setMergeTastingResult(data);
    },
    onError: () => toast.error('Merge failed'),
  });

  const [ethanolResetDone, setEthanolResetDone] = useState(false);

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

      {/* Merge Duplicate Tasting Records */}
      <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-700">🧪</span>
            <h3 className="font-semibold text-amber-800 text-sm">Merge Duplicate Tasting Records</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => mergeTastingMutation.mutate()} disabled={mergeTastingMutation.isPending}>
            {mergeTastingMutation.isPending ? 'Merging...' : 'Fix Duplicate Tasting Records'}
          </Button>
        </div>
        <p className="text-xs text-amber-700">If you see two versions of tasting stock for the same product (e.g. "London Dry Gin — Tasting" and "London Dry Gin 200ml — Tasting"), this tool merges them into a single record and combines the quantities.</p>
        {mergeTastingResult && mergeTastingResult.merged === 0 && (
          <p className="text-xs text-emerald-700 font-medium">✅ No duplicates found — tasting records are clean.</p>
        )}
      </div>

      {/* Backfill Botanical Lot History */}
      <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700">🌿</span>
            <h3 className="font-semibold text-emerald-800 text-sm">Backfill Botanical Lot History</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => botanicalBackfillMutation.mutate()} disabled={botanicalBackfillMutation.isPending}>
            {botanicalBackfillMutation.isPending ? 'Backfilling...' : 'Backfill from Receivals'}
          </Button>
        </div>
        <p className="text-xs text-emerald-700">Reads all your historical botanical receiving records and populates the lot/batch codes under each raw material. Run once — skips any ingredient that already has lots assigned.</p>
        {botanicalBackfillResult && (
          <p className="text-xs text-emerald-800 font-medium">
            {botanicalBackfillResult.updated === 0
              ? '✅ All botanical lots already populated.'
              : `✅ Populated lot history for ${botanicalBackfillResult.updated} of ${botanicalBackfillResult.total} botanical ingredients.`}
          </p>
        )}
      </div>

      {/* Reset Ethanol to Single Clean Record */}
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🧪</span>
            <h3 className="font-semibold text-blue-800 text-sm">Reset Ethanol to Single Record</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
            disabled={ethanolResetDone}
            onClick={async () => {
              if (!confirm('Delete all current ethanol RawMaterial records and rebuild from ALL your ethanol receiving records, with distillation usage already deducted. Continue?')) return;
              try {
                // 1. Delete all existing ethanol RM records
                const allRM = await base44.entities.RawMaterial.list('name', 5000);
                const ethanolRM = allRM.filter(r =>
                  (r.type || '').toLowerCase() === 'ethanol' ||
                  (r.name || '').toLowerCase().includes('ethanol') ||
                  (r.name || '').toLowerCase().includes('lactonol') ||
                  (r.name || '').toLowerCase().includes('lactanol') ||
                  (r.name || '').toLowerCase().includes('neutral alcohol')
                );
                for (const r of ethanolRM) await base44.entities.RawMaterial.delete(r.id);

                // 2. Build lots from ALL ethanol receiving records oldest first
                const allReceivings = await base44.entities.Receiving.list('-date_received', 5000);
                const ethReceivings = allReceivings
                  .filter(r => (r.material_type || '').toLowerCase() === 'ethanol')
                  .sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''));

                if (ethReceivings.length === 0) { toast.error('No ethanol receiving records found'); return; }

                const lots = ethReceivings.map(r => ({
                  lot_number: r.batch_number || r.packing_slip_number || r.material_name || null,
                  date_received: r.date_received,
                  quantity_received: r.quantity || 0,
                  quantity_remaining: r.quantity || 0,
                  supplier: r.supplier_name || null,
                  cost_per_unit: r.cost_per_unit || null,
                  receiving_id: r.id,
                }));

                const totalReceived = ethReceivings.reduce((s, r) => s + (r.quantity || 0), 0);
                const totalReceivedLals = ethReceivings.reduce((s, r) => s + (r.lals || 0), 0);
                const abv = ethReceivings[ethReceivings.length - 1]?.abv_percent || 96;
                const supplier = ethReceivings[ethReceivings.length - 1]?.supplier_name || '';

                // 3. Total ethanol consumed = sum of all completed distillation run input_volume
                // (Dilution does NOT deduct — ethanol in tanks is still your inventory)
                const allDistRuns = await base44.entities.DistillationRun.list('-date', 5000);
                const completedRuns = allDistRuns.filter(r =>
                  r.status === 'completed' && (r.input_volume || 0) > 0
                );
                const totalUsedVol = completedRuns.reduce((s, r) => s + (r.input_volume || 0), 0);
                const totalUsedLals = completedRuns.reduce((s, r) =>
                  s + (r.input_lals || (r.input_volume || 0) * (r.input_abv || abv) / 100), 0);

                const netQty = Math.max(0, totalReceived - totalUsedVol);
                const netLals = Math.max(0, totalReceivedLals - totalUsedLals);

                // 4. FIFO deplete lots oldest first to match actual usage
                let remainingUsed = totalUsedVol;
                const adjustedLots = lots.map(lot => {
                  if (remainingUsed <= 0) return lot;
                  const deplete = Math.min(lot.quantity_remaining || 0, remainingUsed);
                  remainingUsed -= deplete;
                  return { ...lot, quantity_remaining: parseFloat(Math.max(0, (lot.quantity_remaining || 0) - deplete).toFixed(4)) };
                });

                // 5. Create one clean record
                await base44.entities.RawMaterial.create({
                  name: 'Ethanol',
                  type: 'ethanol',
                  quantity: parseFloat(netQty.toFixed(4)),
                  unit: 'litres',
                  lals: parseFloat(netLals.toFixed(4)),
                  abv_percent: abv,
                  supplier,
                  lots: adjustedLots,
                });

                qc.invalidateQueries({ queryKey: ['rawMaterials'] });
                qc.invalidateQueries({ queryKey: ['rawMaterials-ethanol'] });
                setEthanolResetDone(true);
                toast.success(
                  `Done — ${ethReceivings.length} receiving record${ethReceivings.length !== 1 ? 's' : ''}, ` +
                  `${totalReceived.toFixed(2)}L total received · ` +
                  `${totalUsedVol.toFixed(2)}L consumed in ${completedRuns.length} distillation run${completedRuns.length !== 1 ? 's' : ''} · ` +
                  `${netQty.toFixed(2)}L remaining in inventory`
                );
              } catch(e) { toast.error('Failed: ' + e.message); }
            }}
          >
            {ethanolResetDone ? '✅ Done' : 'Reset Ethanol'}
          </Button>
        </div>
        <p className="text-xs text-blue-700">
          Reads <strong>all</strong> your ethanol receiving records and all completed distillation runs, then creates one clean <strong>Ethanol</strong> record. Ethanol only leaves inventory at distillation — diluted stock in tanks is still counted as inventory.
        </p>
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