import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, ClipboardCheck, CheckCircle2, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

export default function StockTakes() {
  const [newOpen, setNewOpen] = useState(false);
  const [conductedBy, setConductedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [activeStockTake, setActiveStockTake] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const queryClient = useQueryClient();

  const { data: stockTakes = [], isLoading } = useQuery({
    queryKey: ['stockTakes'],
    queryFn: () => db.StockTake.list('-date', 50),
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ['stockTakeLines'],
    queryFn: () => db.StockTakeLine.list('material_name', 1000),
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 500),
  });

  // Create a new stock take and pre-populate lines from current inventory
  const createMutation = useMutation({
    mutationFn: async () => {
      const stockTake = await db.StockTake.create({
        date: new Date().toISOString().split('T')[0],
        conducted_by: conductedBy || undefined,
        status: 'draft',
        notes: notes || undefined,
      });

      // Pre-populate lines from all current raw materials
      for (const mat of rawMaterials) {
        await db.StockTakeLine.create({
          stock_take_id: stockTake.id,
          raw_material_id: mat.id,
          material_name: mat.name,
          unit: mat.unit,
          system_quantity: mat.quantity || 0,
          counted_quantity: null,
        });
      }

      return stockTake;
    },
    onSuccess: (stockTake) => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
      setNewOpen(false);
      setConductedBy('');
      setNotes('');
      setActiveStockTake(stockTake.id);
      toast.success('Stock take created — enter your counted quantities');
    },
  });

  // Update a single line's counted quantity
  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, counted }) =>
      db.StockTakeLine.update(lineId, { counted_quantity: counted !== '' ? parseFloat(counted) : null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
    },
  });

  // Complete the stock take
  const completeMutation = useMutation({
    mutationFn: (id) => db.StockTake.update(id, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      setActiveStockTake(null);
      toast.success('Stock take completed and saved');
    },
  });

  // Apply variances — update raw material quantities to match counted values
  const applyVariancesMutation = useMutation({
    mutationFn: async (stockTakeId) => {
      const lines = allLines.filter(l => l.stock_take_id === stockTakeId && l.counted_quantity != null);
      for (const line of lines) {
        if (line.raw_material_id) {
          const mat = rawMaterials.find(m => m.id === line.raw_material_id);
          const update = { quantity: line.counted_quantity };
          if (mat?.abv_percent && mat?.type === 'ethanol') {
            update.lals = parseFloat((line.counted_quantity * mat.abv_percent / 100).toFixed(3));
          }
          await db.RawMaterial.update(line.raw_material_id, update);
        }
      }
      await db.StockTake.update(stockTakeId, { status: 'completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setActiveStockTake(null);
      toast.success('Variances applied — inventory updated to counted quantities');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.StockTake.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockTakes'] });
      queryClient.invalidateQueries({ queryKey: ['stockTakeLines'] });
      setDeletingId(null);
      toast.success('Stock take deleted');
    },
  });

  const getLinesForTake = (id) => allLines.filter(l => l.stock_take_id === id);

  const getVarianceSummary = (lines) => {
    const counted = lines.filter(l => l.counted_quantity != null);
    const withVariance = counted.filter(l => Math.abs(l.variance || 0) > 0.001);
    const totalVariance = counted.reduce((s, l) => s + (l.variance || 0), 0);
    return { counted: counted.length, total: lines.length, withVariance: withVariance.length, totalVariance };
  };

  const VarianceIcon = ({ variance }) => {
    if (variance == null) return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
    if (Math.abs(variance) < 0.001) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (variance > 0) return <TrendingUp className="w-3.5 h-3.5 text-blue-500" />;
    return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  };

  const varianceColor = (variance) => {
    if (variance == null || Math.abs(variance) < 0.001) return '';
    if (variance > 0) return 'text-blue-600 font-semibold';
    return 'text-destructive font-semibold';
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Stock Takes" subtitle="Record physical counts and reconcile against system stock">
        <Button onClick={() => setNewOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Stock Take
        </Button>
      </PageHeader>

      {/* Active stock take entry */}
      {activeStockTake && (() => {
        const lines = getLinesForTake(activeStockTake);
        const summary = getVarianceSummary(lines);
        return (
          <Card className="mb-6 border-primary/30 overflow-hidden">
            <div className="bg-primary/5 border-b border-primary/20 px-5 py-4 flex items-center gap-3">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Stock take in progress</p>
                <p className="text-xs text-muted-foreground">{summary.counted} of {summary.total} items counted · {summary.withVariance} variance{summary.withVariance !== 1 ? 's' : ''} found</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setActiveStockTake(null)}>Hide</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={applyVariancesMutation.isPending}
                  onClick={() => {
                    if (confirm('This will update all inventory quantities to match your counted values. Continue?')) {
                      applyVariancesMutation.mutate(activeStockTake);
                    }
                  }}
                >
                  {applyVariancesMutation.isPending ? 'Applying…' : 'Apply & Update Inventory'}
                </Button>
                <Button
                  size="sm"
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate(activeStockTake)}
                >
                  {completeMutation.isPending ? 'Saving…' : 'Complete (no changes)'}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>System qty</TableHead>
                    <TableHead>Counted qty</TableHead>
                    <TableHead>Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => (
                    <TableRow key={line.id} className={line.variance != null && Math.abs(line.variance) > 0.001 ? 'bg-amber-50/50' : ''}>
                      <TableCell className="font-medium text-sm">{line.material_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                      <TableCell className="text-sm">{line.system_quantity?.toFixed(3) ?? '—'}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="Enter count…"
                          defaultValue={line.counted_quantity ?? ''}
                          className="h-8 w-32 text-sm"
                          onBlur={e => {
                            const val = e.target.value;
                            if (val !== String(line.counted_quantity ?? '')) {
                              updateLineMutation.mutate({ lineId: line.id, counted: val });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <VarianceIcon variance={line.variance} />
                          {line.counted_quantity != null && (
                            <span className={`text-sm ${varianceColor(line.variance)}`}>
                              {line.variance > 0 ? '+' : ''}{line.variance?.toFixed(3) ?? '—'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        );
      })()}

      {/* History */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
        ) : stockTakes.length === 0 ? (
          <Card className="p-10 text-center">
            <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="font-medium text-muted-foreground">No stock takes yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first stock take to start reconciling inventory</p>
          </Card>
        ) : stockTakes.map(st => {
          const lines = getLinesForTake(st.id);
          const summary = getVarianceSummary(lines);
          const isExpanded = expandedId === st.id;
          const isActive = activeStockTake === st.id;

          return (
            <Card key={st.id} className="overflow-hidden">
              <button
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
                onClick={() => setExpandedId(isExpanded ? null : st.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{format(new Date(st.date), 'MMM d, yyyy')}</span>
                    <Badge variant="secondary" className={st.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                      {st.status === 'completed' ? 'Completed' : 'Draft'}
                    </Badge>
                    {st.conducted_by && <span className="text-xs text-muted-foreground">by {st.conducted_by}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-muted-foreground">{summary.counted}/{summary.total} items counted</span>
                    {summary.withVariance > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> {summary.withVariance} variance{summary.withVariance !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {st.status === 'draft' && !isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={e => { e.stopPropagation(); setActiveStockTake(st.id); }}
                    >
                      Continue
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={e => { e.stopPropagation(); setDeletingId(st.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && lines.length > 0 && (
                <div className="border-t border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>System qty</TableHead>
                        <TableHead>Counted qty</TableHead>
                        <TableHead>Variance</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map(line => (
                        <TableRow key={line.id} className={line.variance != null && Math.abs(line.variance) > 0.001 ? 'bg-amber-50/30' : ''}>
                          <TableCell className="text-sm font-medium">{line.material_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                          <TableCell className="text-sm">{line.system_quantity?.toFixed(3) ?? '—'}</TableCell>
                          <TableCell className="text-sm">{line.counted_quantity?.toFixed(3) ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <VarianceIcon variance={line.variance} />
                              <span className={`text-sm ${varianceColor(line.variance)}`}>
                                {line.counted_quantity != null
                                  ? `${line.variance > 0 ? '+' : ''}${line.variance?.toFixed(3)}`
                                  : '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{line.notes || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* New Stock Take Dialog */}
      <Dialog open={newOpen} onOpenChange={v => { setNewOpen(v); if (!v) { setConductedBy(''); setNotes(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> New Stock Take
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              This will create a stock take pre-filled with all <strong>{rawMaterials.length} raw materials</strong> at their current system quantities. Enter your physical counts to find variances.
            </p>
            <div>
              <Label>Conducted by</Label>
              <Input
                value={conductedBy}
                onChange={e => setConductedBy(e.target.value)}
                placeholder="Your name (optional)"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Monthly audit (optional)"
                className="mt-1"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || rawMaterials.length === 0}
            >
              {createMutation.isPending ? 'Creating…' : 'Start Stock Take'}
            </Button>
            {rawMaterials.length === 0 && (
              <p className="text-xs text-destructive text-center">No raw materials in inventory yet</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={v => !v && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stock take?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the stock take and all its counted lines. Inventory quantities will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
