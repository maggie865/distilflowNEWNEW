import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Calculator, FlaskConical, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import CompleteDistillationDialog from '@/components/distillation/CompleteDistillationDialog';
import CreateBatchDialog from '@/components/distillation/CreateBatchDialog';
import BatchManagement from '@/components/distillation/BatchManagement';

const EMPTY_FORM = {
  batch_number: '', date: new Date().toISOString().split('T')[0],
  product_name: '',
  maceration_date: '', maceration_notes: '',
  input_volume: '', input_abv: '',
  atmospheric_pressure: '', still_temp: '',
  heads_volume: '', heads_abv: '',
  hearts_volume: '', hearts_abv: '',
  tails_volume: '', tails_abv: '',
  dumped_volume: '', dumped_abv: '', dumped_notes: '',
  status: 'planned', notes: ''
};

export default function Distillation() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [runToComplete, setRunToComplete] = useState(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [headsDestination, setHeadsDestination] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [scaledIngredients, setScaledIngredients] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => base44.entities.MasterBatch.list('-date_started', 100),
  });

  // Only show batches that are not yet completed/bottling-done
  const activeBatches = masterBatches.filter(b => b.status !== 'completed' && b.status !== 'bottling');

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 50),
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('created_date', 500),
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 50),
  });

  const { data: storageTanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 50),
  });

  const macerationTanks = storageTanks.filter(t => t.purpose === 'maceration_dilution');

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => {
    setEditing(null);
    setSelectedRecipe(null);
    setScaledIngredients([]);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (run) => {
    setEditing(run);
    setSelectedRecipe(null);
    setScaledIngredients([]);
    setForm({
      batch_number: run.batch_number || '',
      date: run.date || new Date().toISOString().split('T')[0],
      product_name: run.product_name || '',
      maceration_date: run.maceration_date || '',
      maceration_notes: run.maceration_notes || '',
      input_volume: run.input_volume ?? '',
      input_abv: run.input_abv ?? '',
      atmospheric_pressure: run.atmospheric_pressure ?? '',
      still_temp: run.still_temp ?? '',
      heads_volume: run.heads_volume ?? '',
      heads_abv: run.heads_abv ?? '',
      hearts_volume: run.hearts_volume ?? '',
      hearts_abv: run.hearts_abv ?? '',
      tails_volume: run.tails_volume ?? '',
      tails_abv: run.tails_abv ?? '',
      dumped_volume: run.dumped_volume ?? '',
      dumped_abv: run.dumped_abv ?? '',
      dumped_notes: run.dumped_notes || '',
      status: run.status || 'planned',
      notes: run.notes || '',
    });
    setOpen(true);
  };

  const handleRecipeSelect = (recipeId) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) { setSelectedRecipe(null); setScaledIngredients([]); return; }
    setSelectedRecipe(recipe);
    setForm(prev => ({
      ...prev,
      product_name: recipe.name,
      input_abv: recipe.base_ethanol_abv ? String(recipe.base_ethanol_abv) : prev.input_abv,
    }));
    if (form.input_volume && recipe.base_ethanol_volume) {
      scaleIngredients(recipe, parseFloat(form.input_volume));
    }
  };

  const scaleIngredients = (recipe, actualVolume) => {
    if (!recipe?.ingredients?.length || !actualVolume || !recipe.base_ethanol_volume) {
      setScaledIngredients([]);
      return;
    }
    const ratio = actualVolume / recipe.base_ethanol_volume;
    setScaledIngredients(recipe.ingredients.map(ing => {
      const needed = parseFloat((ing.quantity * ratio).toFixed(2));
      const lots = rawMaterials
        .filter(m => m.name?.toLowerCase() === ing.name?.toLowerCase())
        .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const totalStock = lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
      return { ...ing, scaledQuantity: needed, totalStock, lots, sufficient: totalStock >= needed };
    }));
  };

  const handleVolumeChange = (value) => {
    set('input_volume', value);
    if (selectedRecipe && value) {
      scaleIngredients(selectedRecipe, parseFloat(value));
    }
  };

  const inputLALs = form.input_volume && form.input_abv
    ? parseFloat(form.input_volume) * parseFloat(form.input_abv) / 100 : 0;
  const headsLALs = form.heads_volume && form.heads_abv
    ? parseFloat(form.heads_volume) * parseFloat(form.heads_abv) / 100 : 0;
  const heartsLALs = form.hearts_volume && form.hearts_abv
    ? parseFloat(form.hearts_volume) * parseFloat(form.hearts_abv) / 100 : 0;
  const tailsLALs = form.tails_volume && form.tails_abv
    ? parseFloat(form.tails_volume) * parseFloat(form.tails_abv) / 100 : 0;
  // Auto-calculate total output from cuts
  const calcOutputVolume = (parseFloat(form.heads_volume) || 0) + (parseFloat(form.hearts_volume) || 0) + (parseFloat(form.tails_volume) || 0);
  const calcOutputLALs = headsLALs + heartsLALs + tailsLALs;
  // Weighted average ABV from cuts
  const calcOutputAbv = calcOutputVolume > 0 ? (calcOutputLALs / calcOutputVolume) * 100 : 0;
  const outputLALs = calcOutputLALs;

  // Dumped / discarded — auto LALs = whatever is unaccounted after cuts
  const autoDumpedLALs = inputLALs > 0 ? Math.max(0, inputLALs - calcOutputLALs) : 0;
  const dumpedVolume = parseFloat(form.dumped_volume) || 0;
  const dumped_abv = autoDumpedLALs > 0 && dumpedVolume > 0 ? (autoDumpedLALs / dumpedVolume) * 100 : 0;

  const numericFields = ['input_volume','input_abv','atmospheric_pressure','still_temp',
    'heads_volume','heads_abv','hearts_volume','hearts_abv',
    'tails_volume','tails_abv','dumped_volume'];

  const buildPayload = (data) => {
    const payload = { ...data };
    numericFields.forEach(f => { payload[f] = data[f] !== '' ? parseFloat(data[f]) : undefined; });
    payload.input_lals = inputLALs ? parseFloat(inputLALs.toFixed(4)) : undefined;
    payload.heads_lals = headsLALs ? parseFloat(headsLALs.toFixed(4)) : undefined;
    payload.hearts_lals = heartsLALs ? parseFloat(heartsLALs.toFixed(4)) : undefined;
    payload.tails_lals = tailsLALs ? parseFloat(tailsLALs.toFixed(4)) : undefined;
    payload.dumped_lals = autoDumpedLALs > 0 ? parseFloat(autoDumpedLALs.toFixed(4)) : undefined;
    payload.dumped_abv = dumped_abv > 0 ? parseFloat(dumped_abv.toFixed(2)) : undefined;
    payload.output_volume = calcOutputVolume > 0 ? parseFloat(calcOutputVolume.toFixed(3)) : undefined;
    payload.output_abv = calcOutputAbv > 0 ? parseFloat(calcOutputAbv.toFixed(2)) : undefined;
    payload.output_lals = calcOutputLALs > 0 ? parseFloat(calcOutputLALs.toFixed(4)) : undefined;
    return payload;
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.DistillationRun.create(buildPayload(data));
      // FIFO stock depletion only on create (when ingredients are scaled)
      for (const ing of scaledIngredients) {
        let remaining = ing.scaledQuantity;
        for (const lot of ing.lots) {
          if (remaining <= 0) break;
          const deduct = Math.min(lot.quantity || 0, remaining);
          if (deduct > 0) {
            await base44.entities.RawMaterial.update(lot.id, { quantity: parseFloat((lot.quantity - deduct).toFixed(4)) });
          }
          remaining -= deduct;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setOpen(false);
      toast.success('Distillation run recorded');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.DistillationRun.update(editing.id, buildPayload(data));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      setOpen(false);
      toast.success('Distillation run updated');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Distillation" subtitle="Manage distillation runs and batches" />

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Distillation Runs</TabsTrigger>
          <TabsTrigger value="batches">Batch Management</TabsTrigger>
        </TabsList>

        <TabsContent value="batches">
          <BatchManagement />
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Run</Button>
          </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Edit Distillation Run' : 'New Distillation Run'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">

            {/* Recipe loader — new runs only */}
            {!editing && recipes.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <Label className="flex items-center gap-1.5 text-primary">
                  <FlaskConical className="w-3.5 h-3.5" />Load from Recipe
                </Label>
                <Select value={selectedRecipe?.id || ''} onValueChange={handleRecipeSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a recipe to pre-fill…" /></SelectTrigger>
                  <SelectContent>
                    {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Core details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Batch Number</Label>
                {editing ? (
                  // When editing, show plain text (batch number shouldn't change)
                  <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                    {form.batch_number}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Select
                      value={form.batch_number}
                      onValueChange={v => {
                        const batch = masterBatches.find(b => b.batch_code === v);
                        set('batch_number', v);
                        if (batch?.product_name && !form.product_name) set('product_name', batch.product_name);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select batch…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBatches.length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                            No active batches — create one first
                          </div>
                        )}
                        {activeBatches.map(b => (
                          <SelectItem key={b.id} value={b.batch_code}>
                            <span className="font-mono">{b.batch_code}</span>
                            {b.product_name && <span className="text-muted-foreground ml-2 text-xs">— {b.product_name}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0"
                      title="Create new batch"
                      onClick={() => setCreateBatchOpen(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Label>Product Name</Label>
                <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} required />
              </div>
            </div>

            {/* Maceration */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maceration</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Maceration Start Date</Label>
                  <Input type="date" value={form.maceration_date} onChange={e => set('maceration_date', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Maceration Notes</Label>
                  <Textarea rows={2} value={form.maceration_notes} onChange={e => set('maceration_notes', e.target.value)} placeholder="Temperature, duration, observations…" />
                </div>
              </div>
            </div>

            {/* Input / Still conditions */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input & Still Conditions</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.input_volume} onChange={e => handleVolumeChange(e.target.value)} />
                </div>
                <div>
                  <Label>ABV %</Label>
                  <Input type="number" step="0.1" value={form.input_abv} onChange={e => set('input_abv', e.target.value)} />
                </div>
                <div>
                  <Label className="flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${inputLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {inputLALs > 0 ? inputLALs.toFixed(3) : '—'}
                  </div>
                </div>
                <div>
                  <Label>Atm. Pressure (hPa)</Label>
                  <Input type="number" step="0.1" value={form.atmospheric_pressure} onChange={e => set('atmospheric_pressure', e.target.value)} placeholder="e.g. 1013" />
                </div>
                <div>
                  <Label>Still Temp (°C)</Label>
                  <Input type="number" step="0.1" value={form.still_temp} onChange={e => set('still_temp', e.target.value)} placeholder="e.g. 78.5" />
                </div>
              </div>
            </div>

            {/* Scaled ingredients with FIFO stock check (new runs only) */}
            {scaledIngredients.length > 0 && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-primary" />
                  Scaled Botanicals for {form.input_volume}L
                </p>
                <div className="space-y-1.5">
                  {scaledIngredients.map((ing, i) => (
                    <div key={i} className="py-1 border-b border-border/50 last:border-0">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          {ing.lots.length > 0
                            ? ing.sufficient
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                          }
                          <span>{ing.name}</span>
                        </div>
                        <span className="font-semibold text-primary">{ing.scaledQuantity} {ing.unit}</span>
                      </div>
                      {ing.lots.length > 0 ? (
                        <p className={`text-xs mt-0.5 ml-5 ${ing.sufficient ? 'text-muted-foreground' : 'text-amber-600'}`}>
                          {ing.totalStock.toFixed(2)} {ing.unit} in stock across {ing.lots.length} lot{ing.lots.length > 1 ? 's' : ''}
                          {!ing.sufficient && ` — short by ${(ing.scaledQuantity - ing.totalStock).toFixed(2)} ${ing.unit}`}
                        </p>
                      ) : (
                        <p className="text-xs mt-0.5 ml-5 text-destructive">Not found in stock</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Scaled from {selectedRecipe.base_ethanol_volume}L base recipe
                  {' '}(×{(parseFloat(form.input_volume) / selectedRecipe.base_ethanol_volume).toFixed(3)}) · Stock depleted FIFO on save
                </p>
              </div>
            )}

            {/* Cuts */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuts</p>

              {/* Heads */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Heads</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.heads_volume} onChange={e => set('heads_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.heads_abv} onChange={e => set('heads_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${headsLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {headsLALs > 0 ? headsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hearts */}
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <p className="text-xs font-medium text-emerald-600">Hearts</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.hearts_volume} onChange={e => set('hearts_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.hearts_abv} onChange={e => set('hearts_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-emerald-600" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${heartsLALs > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-input text-muted-foreground'}`}>
                      {heartsLALs > 0 ? heartsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tails */}
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground">Tails</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.tails_volume} onChange={e => set('tails_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.tails_abv} onChange={e => set('tails_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${tailsLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {tailsLALs > 0 ? tailsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Output — auto-calculated from cuts */}
            {calcOutputVolume > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />Total Output Collected (calculated from cuts)
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Volume (L)</p>
                    <p className="font-semibold">{calcOutputVolume.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg ABV %</p>
                    <p className="font-semibold">{calcOutputAbv.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total LALs</p>
                    <p className="font-semibold text-primary">{calcOutputLALs.toFixed(3)}</p>
                  </div>
                </div>
                {inputLALs > 0 && (
                  <p className="text-xs text-muted-foreground pt-1 border-t border-primary/10">
                    LAL yield:{' '}
                    <span className="font-semibold text-primary">
                      {((calcOutputLALs / inputLALs) * 100).toFixed(1)}%
                    </span>
                    {' '}({calcOutputLALs.toFixed(3)} of {inputLALs.toFixed(3)} input LALs)
                  </p>
                )}
              </div>
            )}

            {/* Dumped / Discarded */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dumped / Discarded</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.dumped_volume} onChange={e => set('dumped_volume', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">ABV % <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${dumped_abv > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {dumped_abv > 0 ? dumped_abv.toFixed(2) + '%' : '—'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${autoDumpedLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {autoDumpedLALs > 0 ? autoDumpedLALs.toFixed(3) : '—'}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Dump Notes</Label>
                <Textarea rows={2} value={form.dumped_notes} onChange={e => set('dumped_notes', e.target.value)} placeholder="What was discarded and why…" />
              </div>
            </div>

            {/* Mass Balance Summary */}
            {inputLALs > 0 && calcOutputLALs > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Mass Balance</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Input LALs</span><span className="font-semibold">{inputLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heads LALs</span><span>{headsLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Hearts LALs</span><span className="text-emerald-700 font-semibold">{heartsLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tails LALs</span><span>{tailsLALs.toFixed(3)}</span></div>
                </div>
                <div className="border-t border-amber-200 pt-2 flex justify-between text-sm">
                  <span className="text-amber-700 font-medium">Dumped / Discarded LALs</span>
                  <span className={`font-semibold ${autoDumpedLALs < 0.001 ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {autoDumpedLALs.toFixed(3)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="macerating">Macerating</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" variant="outline" className="flex-1" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Progress'}
              </Button>
              {editing && editing.status !== 'completed' && (
                <Button
                  type="button"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    updateMutation.mutate(form, {
                      onSuccess: () => {
                        setHeadsDestination('');
                        setConfirmCompleteOpen(true);
                      }
                    });
                  }}
                >
                  Complete Still Run
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Complete Still Run dialog */}
      <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Complete Still Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Transfer Heads to Maceration/Dilution Tank</Label>
              <Select value={headsDestination} onValueChange={setHeadsDestination}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select destination…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ibc_heads_tails">IBC — Heads &amp; Tails Tank</SelectItem>
                  {macerationTanks.map(t => (
                    <SelectItem key={t.id} value={t.name}>
                      Tank {t.name}
                      {t.current_product && <span className="text-muted-foreground ml-2 text-xs">— {t.current_product}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heads</span>
                <span className="font-medium">{form.heads_volume || 0}L @ {form.heads_abv || 0}% ABV</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tails</span>
                <span className="font-medium">{form.tails_volume || 0}L @ {form.tails_abv || 0}% ABV → auto-sent to IBC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dumped</span>
                <span className="font-medium">{form.dumped_volume || 0}L → recorded to Wastage Report</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmCompleteOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!headsDestination || isPending}
                onClick={async () => {
                  await base44.entities.DistillationRun.update(editing.id, {
                    ...buildPayload(form),
                    status: 'completed',
                    heads_destination: headsDestination,
                  });
                  if (dumpedVolume > 0 || autoDumpedLALs > 0) {
                    await base44.entities.WastageRecord.create({
                      date: form.date,
                      batch_number: form.batch_number,
                      product_name: form.product_name,
                      volume: dumpedVolume,
                      abv: dumped_abv,
                      lals: autoDumpedLALs,
                      reason: form.dumped_notes || 'Distillation waste — heads/tails/dumped',
                      source: 'distillation',
                      run_id: editing.id,
                    });
                  }
                  queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
                  queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });
                  toast.success('Still run completed — wastage recorded');
                  setConfirmCompleteOpen(false);
                  setOpen(false);
                }}
              >
                Confirm &amp; Complete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Maceration</TableHead>
                <TableHead>In Vol (L)</TableHead>
                <TableHead>In ABV</TableHead>
                <TableHead>Hearts (L)</TableHead>
                <TableHead>Out LALs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : runs.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No distillation runs yet</TableCell></TableRow>
              ) : runs.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.batch_number}</TableCell>
                  <TableCell className="text-sm">{r.product_name}</TableCell>
                  <TableCell className="text-sm">{r.maceration_date ? format(new Date(r.maceration_date), 'MMM d') : '—'}</TableCell>
                  <TableCell className="text-sm">{r.input_volume ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.input_abv ? `${r.input_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{r.hearts_volume ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.output_lals?.toFixed(3) ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CompleteDistillationDialog
        run={runToComplete}
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onCompleted={() => setOpen(false)}
      />

      <CreateBatchDialog
        open={createBatchOpen}
        onOpenChange={setCreateBatchOpen}
        onCreated={(batch) => {
          set('batch_number', batch.batch_code);
          if (batch.product_name && !form.product_name) set('product_name', batch.product_name);
        }}
      />

        </TabsContent>
      </Tabs>
    </div>
  );
}