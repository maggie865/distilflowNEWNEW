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

  const [ethanolMergeResult, setEthanolMergeResult] = useState(null);
  const [ethanolRecords, setEthanolRecords] = useState(null);  // null = not loaded
  const [selectedToMerge, setSelectedToMerge] = useState([]);
  const [masterName, setMasterName] = useState('Ethanol');
  const [ethanolCleanupResult, setEthanolCleanupResult] = useState(null);

  // One-time cleanup: dissolve the bad "Ethanol" merged record back into correct records
  const ethanolCleanupMutation = useMutation({
    mutationFn: async () => {
      const allRM = await base44.entities.RawMaterial.list('name', 5000);
      
      // Find the bad merged "Ethanol" record (named exactly "Ethanol" with mixed lots)
      const badRecord = allRM.find(r => (r.name || '').trim() === 'Ethanol' && (r.type || '').toLowerCase() === 'ethanol');
      if (!badRecord) throw new Error('No record named exactly "Ethanol" found — may already be cleaned up');

      const lots = Array.isArray(badRecord.lots) ? badRecord.lots : [];
      
      // Find correct target records
      const lactonolRecord = allRM.find(r =>
        r.id !== badRecord.id &&
        (r.type || '').toLowerCase() === 'ethanol' &&
        ((r.name || '').toLowerCase().includes('lactonol') || (r.name || '').toLowerCase().includes('lactanol'))
      );
      const wheatRecord = allRM.find(r =>
        r.id !== badRecord.id &&
        (r.type || '').toLowerCase() === 'ethanol' &&
        ((r.name || '').toLowerCase().includes('wheat') || (r.name || '').toLowerCase().includes('neutral') || (r.name || '').toLowerCase().includes('ena'))
      );

      // Distribute lots to correct records
      let lactonolLots = Array.isArray(lactonolRecord?.lots) ? [...lactonolRecord.lots] : [];
      let wheatLots = Array.isArray(wheatRecord?.lots) ? [...wheatRecord.lots] : [];

      for (const lot of lots) {
        const lotNum = (lot.lot_number || '').toLowerCase();
        const isWheat = lotNum.includes('wheat') || lotNum.includes('ens') || lotNum.includes('ena');
        const isLactonol = lotNum.includes('lactonol') || lotNum.includes('lactanol') || lotNum.match(/^790009/);
        
        if (lot.quantity_remaining <= 0) continue; // skip depleted lots

        if (isWheat && wheatRecord) {
          wheatLots.push({ ...lot, lot_number: lot.lot_number?.replace('(depleted)', '').trim() });
        } else if (lactonolRecord) {
          lactonolLots.push({ ...lot, lot_number: lot.lot_number?.replace('(depleted)', '').trim() });
        }
      }

      // Update lactonol record
      if (lactonolRecord && lactonolLots.length > lactonolRecord.lots?.length) {
        const addedQty = lots.filter(l => {
          const ln = (l.lot_number || '').toLowerCase();
          return !ln.includes('wheat') && !ln.includes('ens') && !ln.includes('ena') && l.quantity_remaining > 0;
        }).reduce((s, l) => s + (l.quantity_remaining || 0), 0);
        await base44.entities.RawMaterial.update(lactonolRecord.id, {
          quantity: parseFloat(((lactonolRecord.quantity || 0) + addedQty).toFixed(4)),
          lals: parseFloat(((lactonolRecord.lals || 0) + addedQty * 0.96).toFixed(4)),
          lots: lactonolLots,
        });
      }

      // Update wheat record
      if (wheatRecord && wheatLots.length > (wheatRecord.lots?.length || 0)) {
        const addedQty = lots.filter(l => {
          const ln = (l.lot_number || '').toLowerCase();
          return (ln.includes('wheat') || ln.includes('ens') || ln.includes('ena')) && l.quantity_remaining > 0;
        }).reduce((s, l) => s + (l.quantity_remaining || 0), 0);
        await base44.entities.RawMaterial.update(wheatRecord.id, {
          quantity: parseFloat(((wheatRecord.quantity || 0) + addedQty).toFixed(4)),
          lals: parseFloat(((wheatRecord.lals || 0) + addedQty * 0.96).toFixed(4)),
          lots: wheatLots,
        });
      }

      // Delete the bad merged record
      await base44.entities.RawMaterial.delete(badRecord.id);
      return { done: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
      qc.invalidateQueries({ queryKey: ['rawMaterials-ethanol'] });
      setEthanolCleanupResult(true);
      toast.success('Cleaned up — "Ethanol" record dissolved, lots moved to correct records');
    },
    onError: (e) => toast.error(e.message || 'Cleanup failed'),
  });
  const [botanicalBackfillResult, setBotanicalBackfillResult] = useState(null);

  const botanicalBackfillMutation = useMutation({
    mutationFn: async () => {
      // Fetch all receivings and raw materials
      const [allReceivings, allRM] = await Promise.all([
        base44.entities.Receiving.list('-date_received', 5000),
        base44.entities.RawMaterial.list('name', 5000),
      ]);

      const botanicalReceivings = allReceivings.filter(r =>
        (r.material_type || '').toLowerCase().startsWith('botanical')
      );

      // Group receivings by material_name
      const byMaterial = {};
      for (const r of botanicalReceivings) {
        const key = (r.material_name || '').toLowerCase().trim();
        if (!byMaterial[key]) byMaterial[key] = [];
        byMaterial[key].push(r);
      }

      let updated = 0;
      for (const [key, receivings] of Object.entries(byMaterial)) {
        // Find the matching RawMaterial record
        const rm = allRM.find(m => (m.name || '').toLowerCase().trim() === key);
        if (!rm) continue;

        // Sort receivings oldest first (FIFO order)
        receivings.sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''));

        // Only build lots if none exist yet (don't overwrite existing lot tracking)
        const existingLots = Array.isArray(rm.lots) ? rm.lots : [];
        if (existingLots.length > 0) continue; // already has lots

        const lots = receivings.map(r => ({
          lot_number: r.batch_number || null,
          date_received: r.date_received,
          quantity_received: r.quantity || 0,
          // quantity_remaining: use current RM quantity proportionally
          // We can't know exactly how much of each lot was used, so set remaining = received
          // and let the current RM.quantity be the source of truth for total
          quantity_remaining: r.quantity || 0,
          supplier: r.supplier_name || null,
          cost_per_unit: r.cost_per_unit || null,
          receiving_id: r.id,
        }));

        // Adjust lot remainders so they sum to the current RM quantity (FIFO)
        const totalReceived = lots.reduce((s, l) => s + l.quantity_received, 0);
        const currentQty = rm.quantity || 0;
        let remainingToAllocate = currentQty;
        const adjustedLots = lots.map(lot => {
          const pct = totalReceived > 0 ? lot.quantity_received / totalReceived : 0;
          // Give oldest lots zero remaining first (FIFO depletion assumption)
          return lot;
        });
        // FIFO: oldest lots depleted first — set remaining to 0 for old lots until we've allocated currentQty
        for (let i = adjustedLots.length - 1; i >= 0; i--) {
          const lot = adjustedLots[i];
          const take = Math.min(lot.quantity_received, remainingToAllocate);
          adjustedLots[i] = { ...lot, quantity_remaining: parseFloat(take.toFixed(4)) };
          remainingToAllocate -= take;
          if (remainingToAllocate <= 0) {
            // All older lots are fully depleted
            for (let j = i - 1; j >= 0; j--) {
              adjustedLots[j] = { ...adjustedLots[j], quantity_remaining: 0 };
            }
            break;
          }
        }

        await base44.entities.RawMaterial.update(rm.id, { lots: adjustedLots });
        updated++;
      }

      return { updated, total: Object.keys(byMaterial).length };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
      setBotanicalBackfillResult(data);
      if (data.updated === 0) toast.success('All botanical lots already populated — nothing to backfill');
      else toast.success(`Backfilled lot history for ${data.updated} botanical ingredients`);
    },
    onError: (e) => toast.error('Backfill failed: ' + e.message),
  });

  const loadEthanolRecordsMutation = useMutation({
    mutationFn: async () => {
      const allRM = await base44.entities.RawMaterial.list('name', 5000);
      // Include all ethanol records including ones with 'ethanol' in the name
      return allRM.filter(r =>
        (r.type || '').toLowerCase() === 'ethanol' ||
        (r.name || '').toLowerCase().includes('ethanol') ||
        (r.name || '').toLowerCase().includes('lactonol') ||
        (r.name || '').toLowerCase().includes('lactanol') ||
        (r.name || '').toLowerCase().includes('neutral alcohol') ||
        (r.name || '').toLowerCase().includes('ena')
      );
    },
    onSuccess: (records) => {
      setEthanolRecords(records);
      setSelectedToMerge([]);
    },
    onError: () => toast.error('Failed to load ethanol records'),
  });

  const mergeEthanolMutation = useMutation({
    mutationFn: async ({ ids, name }) => {
      if (ids.length < 2) throw new Error('Select at least 2 records to merge');
      const allRM = await base44.entities.RawMaterial.list('name', 5000);
      const toMerge = allRM.filter(r => ids.includes(r.id));
      toMerge.sort((a, b) => (a.date_received || a.created_date || '').localeCompare(b.date_received || b.created_date || ''));
      const [master, ...duplicates] = toMerge;

      const mergedLots = [];
      for (const rec of toMerge) {
        const existingLots = Array.isArray(rec.lots) ? rec.lots : [];
        if (existingLots.length > 0) {
          mergedLots.push(...existingLots);
        } else {
          mergedLots.push({
            lot_number: rec.batch_number || rec.name || 'Legacy stock',
            date_received: rec.date_received || null,
            quantity_received: rec.quantity || 0,
            quantity_remaining: rec.quantity || 0,
            supplier: rec.supplier || null,
            cost_per_unit: rec.cost_per_unit || null,
          });
        }
      }
      mergedLots.sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''));

      const totalQty = toMerge.reduce((s, r) => s + (r.quantity || 0), 0);
      const totalLals = toMerge.reduce((s, r) => s + (r.lals || 0), 0);

      await base44.entities.RawMaterial.update(master.id, {
        name: name || master.name,
        quantity: parseFloat(totalQty.toFixed(4)),
        lals: parseFloat(totalLals.toFixed(4)),
        lots: mergedLots,
      });
      for (const dup of duplicates) {
        await base44.entities.RawMaterial.delete(dup.id);
      }
      return { merged: duplicates.length, name: name || master.name, totalQty, lots: mergedLots.length };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
      qc.invalidateQueries({ queryKey: ['rawMaterials-ethanol'] });
      setEthanolMergeResult(data);
      setEthanolRecords(null);
      setSelectedToMerge([]);
      toast.success(`Merged into "${data.name}" — ${data.lots} lots, ${data.totalQty.toFixed(2)}L total`);
    },
    onError: (e) => toast.error(e.message || 'Merge failed'),
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

      {/* One-time cleanup: dissolve bad merged "Ethanol" record */}
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <h3 className="font-semibold text-red-800 text-sm">Fix Bad Ethanol Merge</h3>
          </div>
          <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => { if (confirm('This will dissolve the "Ethanol" record and move its lots back to Lactonol Ethanol and Extra Neutral Alcohol. Continue?')) ethanolCleanupMutation.mutate(); }}
            disabled={ethanolCleanupMutation.isPending || ethanolCleanupResult}>
            {ethanolCleanupResult ? '✅ Done' : ethanolCleanupMutation.isPending ? 'Fixing...' : 'Fix Now'}
          </Button>
        </div>
        <p className="text-xs text-red-700">
          Removes the incorrectly merged "Ethanol" record and moves its 7900095318 lot (464.19L) into <strong>Lactonol Ethanol</strong>. The depleted wheat lot is discarded. Run once only.
        </p>
      </div>

      {/* Merge Ethanol Records */}
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-700">🧪</span>
            <h3 className="font-semibold text-blue-800 text-sm">Merge Ethanol Records</h3>
          </div>
          {!ethanolRecords && (
            <Button size="sm" variant="outline" onClick={() => loadEthanolRecordsMutation.mutate()} disabled={loadEthanolRecordsMutation.isPending}>
              {loadEthanolRecordsMutation.isPending ? 'Loading...' : 'Show Ethanol Records'}
            </Button>
          )}
          {ethanolRecords && (
            <Button size="sm" variant="ghost" onClick={() => setEthanolRecords(null)}>Close</Button>
          )}
        </div>
        <p className="text-xs text-blue-700">Select which ethanol records to merge into one master record with lot tracking. Keep different ethanol types (e.g. wheat vs corn) as separate records by not selecting them together.</p>
        {ethanolRecords && (
          <div className="space-y-3">
            <div className="space-y-2">
              {ethanolRecords.map(r => (
                <label key={r.id} className="flex items-center gap-3 p-2.5 bg-white border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={selectedToMerge.includes(r.id)}
                    onChange={e => setSelectedToMerge(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                    className="w-4 h-4"
                  />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground ml-2">{(r.quantity || 0).toFixed(2)}L · {(r.lals || 0).toFixed(2)} LALs</span>
                    {r.batch_number && <span className="text-muted-foreground ml-2">· {r.batch_number}</span>}
                    {r.supplier && <span className="text-muted-foreground ml-2">· {r.supplier}</span>}
                    {Array.isArray(r.lots) && r.lots.length > 0 && <span className="text-blue-600 ml-2">· {r.lots.length} lots</span>}
                  </div>
                </label>
              ))}
            </div>
            {selectedToMerge.length >= 2 && (
              <div className="space-y-2 pt-1 border-t border-blue-200">
                <div>
                  <label className="text-xs font-semibold text-blue-800">Master record name</label>
                  <input
                    value={masterName}
                    onChange={e => setMasterName(e.target.value)}
                    className="mt-1 w-full border border-blue-300 rounded-md px-2 py-1.5 text-sm bg-white"
                    placeholder="e.g. Ethanol (Lactonol)"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => mergeEthanolMutation.mutate({ ids: selectedToMerge, name: masterName })}
                  disabled={mergeEthanolMutation.isPending}
                >
                  {mergeEthanolMutation.isPending ? 'Merging...' : `Merge ${selectedToMerge.length} selected records into "${masterName}"`}
                </Button>
              </div>
            )}
            {selectedToMerge.length === 1 && (
              <p className="text-xs text-blue-600">Select at least one more record to merge.</p>
            )}
            {selectedToMerge.length === 0 && (
              <p className="text-xs text-blue-600">Tick the records you want to merge together. Unticked records stay separate.</p>
            )}
          </div>
        )}
        {ethanolMergeResult && (
          <p className="text-xs text-emerald-700 font-medium">✅ Merged into "{ethanolMergeResult.name}": {ethanolMergeResult.totalQty?.toFixed(2)}L across {ethanolMergeResult.lots} lots.</p>
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