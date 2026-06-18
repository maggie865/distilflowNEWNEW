import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, BarChart3, Pencil, Trash2, FlaskConical, CheckCircle2, Clock, PackageCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import BottlingRunTracker from '@/components/bottling/BottlingRunTracker';

const BOTTLE_SIZES = [200, 700];

export default function BottlingFloor() {
  const [activeRun, setActiveRun] = useState(null);
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');
  const [bottleSizeMl, setBottleSizeMl] = useState('700');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [staffNames, setStaffNames] = useState([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '' });
  const [editingRun, setEditingRun] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deletingRun, setDeletingRun] = useState(null);
  const [approvingBatch, setApprovingBatch] = useState(null);

  const queryClient = useQueryClient();

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => db.MasterBatch.list('-date_started', 100),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list(),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => db.Recipe.list('name', 100),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingFloorRuns'],
    queryFn: () => db.BottlingRun.list('-date', 100),
  });

  // Only tanks that are final_product_storage and in_use (ready to bottle from)
  const finishingTanks = tanks.filter(t => t.purpose === 'final_product_storage' && t.status === 'in_use');

  // Batches that have a product in a finishing tank
  const bottleReadyBatches = masterBatches.filter(b => {
    const matchingTank = finishingTanks.find(t =>
      t.current_batch === b.batch_code || t.current_product === b.product_name
    );
    return matchingTank != null;
  });

  const selectedBatch = masterBatches.find(b => b.id === selectedBatchId);

  // Find tank(s) holding this batch
  const batchTanks = selectedBatch
    ? finishingTanks.filter(t =>
        t.current_batch === selectedBatch.batch_code ||
        t.current_product === selectedBatch.product_name
      )
    : [];

  const selectedTank = tanks.find(t => t.id === selectedTankId);

  // Packaging recipes — auto-match by bottle size
  const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');

  // Find the packaging recipe whose packaging items include a bottle matching this size
  const autoMatchedRecipe = bottleSizeMl
    ? packagingRecipes.find(r =>
        r.packaging?.some(p =>
          p.type === 'bottle' && (
            p.name?.includes(bottleSizeMl) ||
            p.name?.toLowerCase().includes(`${bottleSizeMl}ml`) ||
            p.name?.toLowerCase().includes(`${bottleSizeMl} ml`)
          )
        )
      )
    : null;

  // Use the auto-matched recipe, or fall back to manually selected one
  const selectedRecipe = autoMatchedRecipe || recipes.find(r => r.id === selectedRecipeId);
  const bottlesPerCase = selectedRecipe?.bottles_per_case || 6;

  const resetForm = () => {
    setSelectedBatchId('');
    setSelectedTankId('');
    setBottleSizeMl('700');
    setSelectedRecipeId('');
    setStaffNames([]);
    setNewStaffName('');
  };

  const addStaff = () => {
    const name = newStaffName.trim();
    if (name && !staffNames.includes(name)) {
      setStaffNames([...staffNames, name]);
      setNewStaffName('');
    }
  };

  const removeStaff = (idx) => setStaffNames(staffNames.filter((_, i) => i !== idx));

  const canStart = selectedBatchId && selectedTankId;

  const startRun = () => {
    setActiveRun({
      batch_code: selectedBatch.batch_code,
      product_name: selectedBatch.product_name,
      tank_id: selectedTankId,
      tank_name: selectedTank?.name || '',
      bottle_size_ml: parseInt(bottleSizeMl),
      bottles_per_case: bottlesPerCase,
      abv: selectedTank?.current_abv || 0,
      available_volume: selectedTank?.current_volume || 0,
      recipe: selectedRecipe || null,
      staff: staffNames,
    });
    setShowNewRun(false);
    toast.success('Bottling run started!');
  };

  // Complete run — handles cases, extra bottles, tasting bottles, finished goods, tank deduction
  const completeRunMutation = useMutation({
    mutationFn: async ({ cases, extraBottles, tastingBottles }) => {
      const totalBottles = cases * activeRun.bottles_per_case + extraBottles;
      const spiritUsedLitres = (totalBottles * activeRun.bottle_size_ml) / 1000;
      const abv = activeRun.abv || 0;
      const lals = (spiritUsedLitres * abv) / 100;
      const lalPerBottle = totalBottles > 0 ? lals / totalBottles : 0;

      // 1. Create BottlingRun record
      await db.BottlingRun.create({
        batch_number: activeRun.batch_code,
        product_name: activeRun.product_name,
        date: new Date().toISOString().split('T')[0],
        input_volume: spiritUsedLitres,
        input_abv: abv,
        input_lals: parseFloat(lals.toFixed(4)),
        bottle_size_ml: activeRun.bottle_size_ml,
        bottles_produced: totalBottles,
        lals_per_bottle: parseFloat(lalPerBottle.toFixed(5)),
        status: 'completed',
        notes: `Staff: ${activeRun.staff.join(', ')} | Cases: ${cases} | Extra bottles: ${extraBottles} | Tasting: ${tastingBottles}`,
      });

      // 2. Deduct from source tank
      const tank = tanks.find(t => t.id === activeRun.tank_id);
      if (tank) {
        const newVolume = Math.max(0, (tank.current_volume || 0) - spiritUsedLitres);
        await db.StorageTank.update(tank.id, { current_volume: newVolume });

        await db.TankMovement.create({
          date: new Date().toISOString().split('T')[0],
          action: 'bottling_draw',
          tank_name: tank.name,
          volume_litres: spiritUsedLitres,
          abv,
          lals: parseFloat(lals.toFixed(4)),
          product: activeRun.product_name,
          batch_number: activeRun.batch_code,
          operator: activeRun.staff[0] || 'Unknown',
          notes: `Bottling complete — ${cases} cases + ${extraBottles} extra bottles`,
        });
      }

      // 3. Update main finished goods stock (cases + extra bottles)
      if (totalBottles > 0) {
        const existing = await db.FinishedGood.filter({
          product_name: activeRun.product_name,
          batch_number: activeRun.batch_code,
          bottle_size_ml: activeRun.bottle_size_ml,
        });
        if (existing.length > 0) {
          const fg = existing[0];
          await db.FinishedGood.update(fg.id, {
            quantity_bottles: (fg.quantity_bottles || 0) + totalBottles,
            total_lals: (fg.total_lals || 0) + parseFloat(lals.toFixed(4)),
          });
        } else {
          await db.FinishedGood.create({
            product_name: activeRun.product_name,
            batch_number: activeRun.batch_code,
            bottle_size_ml: activeRun.bottle_size_ml,
            abv_percent: abv,
            quantity_bottles: totalBottles,
            total_lals: parseFloat(lals.toFixed(4)),
          });
        }
      }

      // 4. Add tasting bottles to a tasting stock item
      if (tastingBottles > 0) {
        const tastingName = `${activeRun.product_name} — Tasting`;
        const tastingLals = (tastingBottles * activeRun.bottle_size_ml / 1000) * abv / 100;
        const existingTasting = await db.FinishedGood.filter({ product_name: tastingName });
        if (existingTasting.length > 0) {
          const tg = existingTasting[0];
          await db.FinishedGood.update(tg.id, {
            quantity_bottles: (tg.quantity_bottles || 0) + tastingBottles,
            total_lals: (tg.total_lals || 0) + parseFloat(tastingLals.toFixed(4)),
          });
        } else {
          await db.FinishedGood.create({
            product_name: tastingName,
            batch_number: activeRun.batch_code,
            bottle_size_ml: activeRun.bottle_size_ml,
            abv_percent: abv,
            quantity_bottles: tastingBottles,
            total_lals: parseFloat(tastingLals.toFixed(4)),
            notes: 'Tasting bottles — rejected from main run',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setActiveRun(null);
      resetForm();
      toast.success('Run complete — stock updated!');
    },
  });

  // Edit run — updates only safe metadata fields (date, notes, status)
  const editRunMutation = useMutation({
    mutationFn: async (data) => {
      await db.BottlingRun.update(editingRun.id, {
        date: data.date,
        notes: data.notes,
        status: data.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      setEditingRun(null);
      toast.success('Run updated');
    },
  });

  // Approve batch for bottling
  const approveBatchMutation = useMutation({
    mutationFn: async (batch) => {
      await db.MasterBatch.update(batch.id, { status: 'bottle_ready' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      setApprovingBatch(null);
      toast.success('Batch approved for bottling');
    },
  });

  // Delete run — reverses all inventory impacts
  const deleteRunMutation = useMutation({
    mutationFn: async (run) => {
      const bottlesProduced = run.bottles_produced || 0;
      const spiritVolume = run.input_volume || 0;
      const abv = run.input_abv || 0;
      const lals = run.input_lals || 0;

      // 1. Return spirit to source tank — find by batch/product
      const matchingTank = tanks.find(t =>
        t.current_batch === run.batch_number || t.current_product === run.product_name
      );
      if (matchingTank) {
        await db.StorageTank.update(matchingTank.id, {
          current_volume: (matchingTank.current_volume || 0) + spiritVolume,
        });
        // Log the reversal as a tank movement
        await db.TankMovement.create({
          date: new Date().toISOString().split('T')[0],
          action: 'transfer_in',
          tank_name: matchingTank.name,
          volume_litres: spiritVolume,
          abv,
          lals,
          product: run.product_name,
          batch_number: run.batch_number,
          notes: `Reversal: bottling run deleted (${run.date})`,
        });
      }

      // 2. Deduct from finished goods
      if (bottlesProduced > 0) {
        const existingFG = await db.FinishedGood.filter({
          product_name: run.product_name,
          batch_number: run.batch_number,
          bottle_size_ml: run.bottle_size_ml,
        });
        if (existingFG.length > 0) {
          const fg = existingFG[0];
          const newQty = Math.max(0, (fg.quantity_bottles || 0) - bottlesProduced);
          const newLals = Math.max(0, (fg.total_lals || 0) - lals);
          if (newQty === 0) {
            await db.FinishedGood.delete(fg.id);
          } else {
            await db.FinishedGood.update(fg.id, {
              quantity_bottles: newQty,
              total_lals: parseFloat(newLals.toFixed(4)),
            });
          }
        }
      }

      // 3. Parse tasting bottles from notes and reverse tasting stock
      const tastingMatch = run.notes?.match(/Tasting:\s*(\d+)/);
      const tastingCount = tastingMatch ? parseInt(tastingMatch[1]) : 0;
      if (tastingCount > 0) {
        const tastingName = `${run.product_name} — Tasting`;
        const existingTasting = await db.FinishedGood.filter({ product_name: tastingName });
        if (existingTasting.length > 0) {
          const tg = existingTasting[0];
          const tastingLals = (tastingCount * (run.bottle_size_ml || 700) / 1000) * abv / 100;
          const newQty = Math.max(0, (tg.quantity_bottles || 0) - tastingCount);
          const newLals = Math.max(0, (tg.total_lals || 0) - tastingLals);
          if (newQty === 0) {
            await db.FinishedGood.delete(tg.id);
          } else {
            await db.FinishedGood.update(tg.id, {
              quantity_bottles: newQty,
              total_lals: parseFloat(newLals.toFixed(4)),
            });
          }
        }
      }

      // 4. Delete the run record
      await db.BottlingRun.delete(run.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setDeletingRun(null);
      toast.success('Run deleted and inventory reversed');
    },
  });

  const filteredHistory = bottlingRuns.filter(run => {
    if (historyFilter.startDate && new Date(run.date) < new Date(historyFilter.startDate)) return false;
    if (historyFilter.endDate && new Date(run.date) > new Date(historyFilter.endDate)) return false;
    return true;
  });

  if (activeRun) {
    return (
      <BottlingRunTracker
        run={activeRun}
        onComplete={(data) => completeRunMutation.mutate(data)}
        onCancel={() => setActiveRun(null)}
        isCompleting={completeRunMutation.isPending}
      />
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Bottling Floor" subtitle="Live production tracking and case management">
        <Button onClick={() => setShowNewRun(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Start Run
        </Button>
      </PageHeader>

      {/* Batch Approval Dialog */}
      <Dialog open={!!approvingBatch} onOpenChange={v => !v && setApprovingBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Approve Batch for Bottling</DialogTitle>
          </DialogHeader>
          {approvingBatch && (
            <div className="space-y-4 mt-4">
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                <p className="text-sm font-semibold text-blue-900">{approvingBatch.batch_code}</p>
                <p className="text-xs text-blue-700 mt-1">{approvingBatch.product_name}</p>
              </div>
              <p className="text-sm text-foreground">Mark this batch as approved to control which batches can be released for bottling?</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setApprovingBatch(null)}>Cancel</Button>
                <Button className="flex-1" onClick={() => approveBatchMutation.mutate(approvingBatch)} disabled={approveBatchMutation.isPending}>
                  {approveBatchMutation.isPending ? 'Approving…' : 'Approve'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Start New Run Dialog */}
      <Dialog open={showNewRun} onOpenChange={v => { setShowNewRun(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Start Bottling Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-4">

            {/* Batch selection — only from finishing tanks */}
            <div>
              <Label>Batch (Finishing Tanks Only)</Label>
              <Select
                value={selectedBatchId}
                onValueChange={v => {
                  setSelectedBatchId(v);
                  const batch = masterBatches.find(b => b.id === v);
                  const batchTankList = batch
                    ? finishingTanks.filter(t =>
                        t.current_batch === batch.batch_code ||
                        t.current_product === batch.product_name
                      )
                    : [];
                  // Auto-select tank if only one matches
                  setSelectedTankId(batchTankList.length === 1 ? batchTankList[0].id : '');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a batch ready to bottle" /></SelectTrigger>
                <SelectContent>
                  {bottleReadyBatches.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No batches in finishing tanks
                    </div>
                  )}
                  {bottleReadyBatches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_code} — {b.product_name}
                      {b.status === 'bottle_ready' && <span className="ml-2 text-green-600">✓ Approved</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-filled info */}
            {selectedBatch && (
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-semibold">{selectedBatch.product_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ABV</p>
                  <p className="font-semibold">
                    {batchTanks[0]?.current_abv != null ? `${batchTanks[0].current_abv}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Source tank (from batch's finishing tanks) */}
            {batchTanks.length > 0 && (
              <div>
                <Label>Source Tank</Label>
                <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                  <SelectTrigger><SelectValue placeholder="Select tank" /></SelectTrigger>
                  <SelectContent>
                    {batchTanks.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {t.current_volume?.toFixed(1) || 0}L @ {t.current_abv || 0}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Bottle size */}
            <div>
              <Label>Bottle Size (ml)</Label>
              <Select value={bottleSizeMl} onValueChange={v => { setBottleSizeMl(v); setSelectedRecipeId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOTTLE_SIZES.map(size => (
                    <SelectItem key={size} value={size.toString()}>{size}ml</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Packaging recipe — auto-matched from bottle size, manual fallback */}
            <div>
              <Label>Packaging Recipe</Label>
              {autoMatchedRecipe ? (
                <div className="mt-1 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-green-800">{autoMatchedRecipe.name}</p>
                      <p className="text-xs text-green-700 mt-0.5">
                        Auto-matched · {autoMatchedRecipe.bottles_per_case || 6} bottles per case
                      </p>
                    </div>
                    <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">Auto</Badge>
                  </div>
                  {autoMatchedRecipe.packaging?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-green-200 space-y-0.5">
                      {autoMatchedRecipe.packaging.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs text-green-700">
                          <span>{p.name}</span>
                          <span>{p.quantity} {p.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="No recipe matched — select manually" /></SelectTrigger>
                    <SelectContent>
                      {packagingRecipes.length === 0 && (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">No packaging recipes found</div>
                      )}
                      {packagingRecipes.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}{r.bottles_per_case ? ` — ${r.bottles_per_case} btls/case` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRecipe && (
                    <p className="text-xs text-muted-foreground mt-1">{selectedRecipe.bottles_per_case} bottles per case</p>
                  )}
                </>
              )}
            </div>

            {/* Team */}
            <div>
              <Label>Production Team</Label>
              <div className="flex gap-2 mt-1 mb-2">
                <Input
                  placeholder="Enter name and press Enter"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStaff()}
                  className="text-base"
                />
                <Button type="button" variant="outline" size="icon" onClick={addStaff}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {staffNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {staffNames.map((name, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
                      {name}
                      <button onClick={() => removeStaff(i)} className="text-muted-foreground hover:text-destructive ml-1">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={startRun}
              disabled={!canStart}
              className="w-full h-12 text-base font-semibold"
            >
              Start Bottling
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Status Summary */}
      {(() => {
        const inProgress = bottlingRuns.filter(r => r.status === 'in_progress');
        const completed = bottlingRuns.filter(r => r.status === 'completed');
        const planned = bottlingRuns.filter(r => r.status === 'planned');
        const totalBottles = completed.reduce((sum, r) => sum + (r.bottles_produced || 0), 0);

        const stats = [
          {
            label: 'Waiting to Bottle',
            value: bottleReadyBatches.length,
            sub: `batch${bottleReadyBatches.length !== 1 ? 'es' : ''} ready`,
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50 border-amber-200',
          },
          {
            label: 'In Progress',
            value: inProgress.length + (activeRun ? 1 : 0),
            sub: `run${(inProgress.length + (activeRun ? 1 : 0)) !== 1 ? 's' : ''} active`,
            icon: FlaskConical,
            color: 'text-blue-600',
            bg: 'bg-blue-50 border-blue-200',
          },
          {
            label: 'Completed',
            value: completed.length,
            sub: `run${completed.length !== 1 ? 's' : ''} finished`,
            icon: CheckCircle2,
            color: 'text-green-600',
            bg: 'bg-green-50 border-green-200',
          },
          {
            label: 'Total Bottles Produced',
            value: totalBottles.toLocaleString(),
            sub: 'across all completed runs',
            icon: PackageCheck,
            color: 'text-primary',
            bg: 'bg-accent border-accent-foreground/10',
          },
        ];

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
                <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Bottling History */}
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Bottling History
          </h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              type="date"
              value={historyFilter.startDate}
              onChange={e => setHistoryFilter({ ...historyFilter, startDate: e.target.value })}
              className="text-sm w-auto"
            />
            <Input
              type="date"
              value={historyFilter.endDate}
              onChange={e => setHistoryFilter({ ...historyFilter, endDate: e.target.value })}
              className="text-sm w-auto"
            />
            <Button variant="outline" onClick={() => setHistoryFilter({ startDate: '', endDate: '' })} className="text-sm">
              Clear
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Bottles</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No bottling runs yet
                    </TableCell>
                  </TableRow>
                ) : filteredHistory.map(run => (
                  <TableRow key={run.id}>
                    <TableCell>{run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="font-mono font-semibold">{run.batch_number}</TableCell>
                    <TableCell>{run.product_name}</TableCell>
                    <TableCell className="font-semibold">{run.bottles_produced || 0}</TableCell>
                    <TableCell>{run.bottle_size_ml}ml</TableCell>
                    <TableCell><StatusBadge status={run.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => {
                            const batch = masterBatches.find(b => b.batch_code === run.batch_number);
                            if (batch && batch.status !== 'bottle_ready') {
                              setApprovingBatch(batch);
                            }
                          }}
                          disabled={!masterBatches.find(b => b.batch_code === run.batch_number) || masterBatches.find(b => b.batch_code === run.batch_number)?.status === 'bottle_ready'}
                        >
                          {masterBatches.find(b => b.batch_code === run.batch_number)?.status === 'bottle_ready' ? '✓ Approved' : 'Approve'}
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditingRun(run); setEditForm({ date: run.date, notes: run.notes || '', status: run.status }); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingRun(run)}
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
      </div>

      {/* Edit Run Dialog */}
      <Dialog open={!!editingRun} onOpenChange={v => !v && setEditingRun(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Bottling Run</DialogTitle>
          </DialogHeader>
          {editingRun && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                <p className="font-semibold">{editingRun.product_name}</p>
                <p className="text-muted-foreground text-xs">{editingRun.batch_number} · {editingRun.bottles_produced} bottles · {editingRun.bottle_size_ml}ml</p>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingRun(null)}>Cancel</Button>
                <Button className="flex-1" disabled={editRunMutation.isPending} onClick={() => editRunMutation.mutate(editForm)}>
                  {editRunMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deletingRun} onOpenChange={v => !v && setDeletingRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bottling Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the run for <strong>{deletingRun?.product_name}</strong> ({deletingRun?.batch_number}) and reverse all inventory changes:
              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                <li>Return <strong>{deletingRun?.input_volume?.toFixed(1)}L</strong> of spirit back to the source tank</li>
                <li>Remove <strong>{deletingRun?.bottles_produced}</strong> bottles from finished goods stock</li>
                <li>Reverse any tasting bottle stock additions</li>
              </ul>
              <p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteRunMutation.mutate(deletingRun)}
              disabled={deleteRunMutation.isPending}
            >
              {deleteRunMutation.isPending ? 'Deleting…' : 'Delete & Reverse'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
