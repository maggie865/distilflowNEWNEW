import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import BottlingRunTracker from '@/components/bottling/BottlingRunTracker';

const BOTTLE_SIZES = [200, 350, 500, 700, 750, 1000];

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

  const queryClient = useQueryClient();

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => base44.entities.MasterBatch.list('-date_started', 100),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list(),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 100),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingFloorRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 100),
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

  // Packaging recipes that match the selected bottle size
  const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');
  const matchingRecipes = packagingRecipes.filter(r => {
    // Match by bottle size in recipe packaging items
    if (!bottleSizeMl) return true;
    const hasMatchingBottle = r.packaging?.some(p =>
      p.type === 'bottle' && p.name?.toLowerCase().includes(bottleSizeMl)
    );
    return hasMatchingBottle || packagingRecipes.length <= 3; // show all if few options
  });

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);
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

  const canStart = selectedBatchId && selectedTankId && staffNames.length > 0;

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
      await base44.entities.BottlingRun.create({
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
        await base44.entities.StorageTank.update(tank.id, { current_volume: newVolume });

        await base44.entities.TankMovement.create({
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
        const existing = await base44.entities.FinishedGood.filter({
          product_name: activeRun.product_name,
          batch_number: activeRun.batch_code,
        });
        if (existing.length > 0) {
          const fg = existing[0];
          await base44.entities.FinishedGood.update(fg.id, {
            quantity_bottles: (fg.quantity_bottles || 0) + totalBottles,
            total_lals: (fg.total_lals || 0) + parseFloat(lals.toFixed(4)),
          });
        } else {
          await base44.entities.FinishedGood.create({
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
        const existingTasting = await base44.entities.FinishedGood.filter({ product_name: tastingName });
        if (existingTasting.length > 0) {
          const tg = existingTasting[0];
          await base44.entities.FinishedGood.update(tg.id, {
            quantity_bottles: (tg.quantity_bottles || 0) + tastingBottles,
            total_lals: (tg.total_lals || 0) + parseFloat(tastingLals.toFixed(4)),
          });
        } else {
          await base44.entities.FinishedGood.create({
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
                  setSelectedTankId(''); // reset tank when batch changes
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

            {/* Packaging recipe */}
            <div>
              <Label>Packaging Recipe</Label>
              <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
                <SelectTrigger><SelectValue placeholder="Select packaging recipe" /></SelectTrigger>
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
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedRecipe.bottles_per_case} bottles per case
                </p>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}