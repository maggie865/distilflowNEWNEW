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