import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, ChevronRight, ChevronDown, CheckCircle2, Clock, X, ExternalLink, FlaskConical, ClipboardList } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const RECALL_STEPS = [
  { num: 1, key: 'step1_notes', label: 'Investigate', desc: 'Gather info, identify affected batches, put stock on hold', color: 'bg-orange-500' },
  { num: 2, key: 'step2_notes', label: 'Inform', desc: 'Tell your verifier and MPI within 24 hours', color: 'bg-amber-500', urgent: true },
  { num: 3, key: 'step3_notes', label: 'Assess', desc: 'Complete risk assessment, decide recall level', color: 'bg-yellow-500' },
  { num: 4, key: 'step4_notes', label: 'Check', desc: 'MPI agrees with your risk assessment and decision', color: 'bg-blue-500' },
  { num: 5, key: 'step5_notes', label: 'Communicate', desc: 'Notify customers, retailers and consumers', color: 'bg-purple-500' },
  { num: 6, key: 'step6_notes', label: 'Audit', desc: 'Reconcile returned product, identify corrective actions', color: 'bg-emerald-500' },
];

const STATUS_STEP_MAP = {
  investigating: 1, informed: 2, assessed: 3, checked: 4, communicating: 5, auditing: 6, closed: 6,
};

const REASON_TYPES = ['allergen','foreign_matter','microbiological','chemical','other'];

const BLANK = {
  recall_number: `RECALL-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
  product_name: '', batch_numbers: '', date_initiated: new Date().toISOString().split('T')[0],
  reason_type: 'allergen', reason_detail: '', recall_level: 'consumer',
  status: 'investigating', bottles_affected: '', bottles_recovered: '',
  mpi_notified_at: '', mpi_case_officer: '', distribution_list: '', corrective_actions: '',
  step1_notes: '', step2_notes: '', step3_notes: '', step4_notes: '', step5_notes: '', step6_notes: '',
  notes: '', is_mock: false,
};

const BLANK_MOCK = {
  recall_number: `MOCK-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
  product_name: '', batch_numbers: '', date_initiated: new Date().toISOString().split('T')[0],
  reason_type: 'allergen', reason_detail: '', recall_level: 'consumer',
  status: 'investigating', bottles_affected: '', bottles_recovered: '',
  mpi_notified_at: '', mpi_case_officer: '', distribution_list: '', corrective_actions: '',
  step1_notes: '', step2_notes: '', step3_notes: '', step4_notes: '', step5_notes: '', step6_notes: '',
  notes: '',
  // Mock-specific fields
  conducted_by: '', time_to_complete_mins: '',
  distribution_list_accurate: false, stock_located: false, mpi_contact_identified: false,
  outcome: '', next_mock_due: '',
};

function RecallCard({ recall, dispatches, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const currentStep = STATUS_STEP_MAP[recall.status] || 1;

  // Build distribution list from dispatch records
  const affectedBatches = (recall.batch_numbers || '').split(',').map(b => b.trim()).filter(Boolean);
  const involvedDispatches = dispatches.filter(d =>
    affectedBatches.some(b => (d.batch_number || '').toLowerCase().includes(b.toLowerCase()))
  );
  const customerList = [...new Map(involvedDispatches.map(d => [d.customer_name, d])).values()];

  const statusColors = {
    investigating: 'bg-orange-100 text-orange-800',
    informed: 'bg-amber-100 text-amber-800',
    assessed: 'bg-yellow-100 text-yellow-800',
    checked: 'bg-blue-100 text-blue-800',
    communicating: 'bg-purple-100 text-purple-800',
    auditing: 'bg-indigo-100 text-indigo-800',
    closed: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <Card className={`overflow-hidden ${recall.status !== 'closed' ? 'border-destructive/30' : ''}`}>
      <button
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{recall.recall_number}</span>
            <span className="text-sm text-muted-foreground">— {recall.product_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[recall.status] || 'bg-gray-100 text-gray-600'}`}>
              {recall.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{recall.date_initiated ? format(new Date(recall.date_initiated), 'MMM d, yyyy') : '—'}</span>
            <span>Reason: {(recall.reason_type || '').replace('_', ' ')}</span>
            <span>Level: {recall.recall_level}</span>
          </div>
          {/* Step progress bar */}
          <div className="flex items-center gap-1 mt-2">
            {RECALL_STEPS.map(s => (
              <div key={s.num} className={`h-1.5 flex-1 rounded-full ${currentStep >= s.num ? s.color : 'bg-muted'}`} />
            ))}
            <span className="text-xs text-muted-foreground ml-2">Step {currentStep}/6</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={e => { e.stopPropagation(); onEdit(recall); }}>Edit</Button>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-5 space-y-5">
          {/* MPI contact */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">MPI must be notified within 24 hours of recall decision</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-amber-700">
                  <span>📞 0800 00 83 33</span>
                  <a href="mailto:Food.Recalls@mpi.govt.nz" className="underline">Food.Recalls@mpi.govt.nz</a>
                  <a href="https://www.mpi.govt.nz/food-business/food-recall/" target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1">
                    MPI guidance <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {recall.mpi_notified_at && (
                  <p className="text-xs text-amber-700 mt-1">✓ MPI notified: {recall.mpi_notified_at}</p>
                )}
                {recall.mpi_case_officer && (
                  <p className="text-xs text-amber-700">Case officer: {recall.mpi_case_officer}</p>
                )}
              </div>
            </div>
          </div>

          {/* Auto-generated distribution list */}
          {customerList.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Distribution list — customers who received affected batches</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Customer</th>
                      <th className="text-left px-3 py-2 font-medium">Address</th>
                      <th className="text-left px-3 py-2 font-medium">Batch</th>
                      <th className="text-right px-3 py-2 font-medium">Bottles</th>
                      <th className="text-left px-3 py-2 font-medium">Dispatch date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {involvedDispatches.map((d, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{d.customer_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.customer_address || '—'}</td>
                        <td className="px-3 py-2 font-mono">{d.batch_number}</td>
                        <td className="px-3 py-2 text-right">{d.quantity_bottles}</td>
                        <td className="px-3 py-2">{d.dispatch_date ? format(new Date(d.dispatch_date), 'MMM d, yyyy') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step notes */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Step notes</p>
            {RECALL_STEPS.map(s => (
              <div key={s.num} className="flex gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 ${currentStep >= s.num ? s.color : 'bg-muted'}`}>
                  {currentStep > s.num ? '✓' : s.num}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground mb-1">{s.desc}</p>
                  {recall[s.key] && <p className="text-sm bg-muted/40 rounded p-2">{recall[s.key]}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Recovery stats */}
          {(recall.bottles_affected || recall.bottles_recovered) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground">Bottles affected</p>
                <p className="text-2xl font-bold">{recall.bottles_affected || '—'}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground">Bottles recovered</p>
                <p className="text-2xl font-bold text-emerald-600">{recall.bottles_recovered || '—'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function FoodRecallManager() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const qc = useQueryClient();

  const { data: recalls = [], isLoading } = useQuery({
    queryKey: ['foodRecalls'],
    queryFn: () => base44.entities.FoodRecall.list('-date_initiated', 100),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 2000),
  });

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => base44.entities.MasterBatch.list('-date_started', 200),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 200),
  });

  const { data: mockRecalls = [], isLoading: loadingMocks } = useQuery({
    queryKey: ['mockRecalls'],
    queryFn: () => base44.entities.MockRecall.list('-date_conducted', 50),
  });

  const [mockOpen, setMockOpen] = useState(false);
  const [mockForm, setMockForm] = useState(BLANK_MOCK);
  const [editingMockId, setEditingMockId] = useState(null);
  const [selectedBatches, setSelectedBatches] = useState([]);

  // Build unique batch list from master batches + bottling runs
  const allBatches = [
    ...masterBatches.map(b => ({ code: b.batch_code, product: b.product_name, source: 'master' })),
    ...bottlingRuns
      .filter(b => b.batch_number && !masterBatches.find(m => m.batch_code === b.batch_number))
      .map(b => ({ code: b.batch_number, product: b.product_name, source: 'bottling' })),
  ].filter(b => b.code);

  const setM = (k, v) => setMockForm(f => ({ ...f, [k]: v }));

  const saveMockMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        time_to_complete_mins: data.time_to_complete_mins ? parseInt(data.time_to_complete_mins) : undefined,
        bottles_affected: data.bottles_affected ? parseInt(data.bottles_affected) : undefined,
        bottles_recovered: data.bottles_recovered ? parseInt(data.bottles_recovered) : undefined,
      };
      if (editingMockId) await base44.entities.MockRecall.update(editingMockId, payload);
      else await base44.entities.MockRecall.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mockRecalls'] });
      setMockOpen(false); setEditingMockId(null); setMockForm(BLANK_MOCK);
      toast.success(editingMockId ? 'Mock recall updated' : 'Mock recall logged');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMockMutation = useMutation({
    mutationFn: (id) => base44.entities.MockRecall.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mockRecalls'] }),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    setForm({ ...BLANK, recall_number: `RECALL-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}` });
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({ ...BLANK, ...r, bottles_affected: r.bottles_affected ?? '', bottles_recovered: r.bottles_recovered ?? '' });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        bottles_affected: data.bottles_affected ? parseInt(data.bottles_affected) : undefined,
        bottles_recovered: data.bottles_recovered ? parseInt(data.bottles_recovered) : undefined,
      };
      if (editingId) await base44.entities.FoodRecall.update(editingId, payload);
      else await base44.entities.FoodRecall.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['foodRecalls'] });
      setOpen(false); setEditingId(null); setForm(BLANK);
      toast.success(editingId ? 'Recall updated' : 'Recall initiated');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const activeRecalls = recalls.filter(r => r.status !== 'closed');

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Food Recall Manager" subtitle="MPI-compliant 6-step recall process">
        <Button onClick={() => { setMockOpen(true); setEditingMockId(null); setMockForm({...BLANK_MOCK, recall_number: `MOCK-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`}); }} variant="outline" className="gap-2">
          <ClipboardList className="w-4 h-4" /> Log Mock Recall
        </Button>
        <Button onClick={openNew} className="gap-2 bg-destructive hover:bg-destructive/90">
          <AlertTriangle className="w-4 h-4" /> Initiate Recall
        </Button>
      </PageHeader>

      <Tabs defaultValue="recalls">
        <TabsList className="mb-5">
          <TabsTrigger value="recalls" className="gap-2"><AlertTriangle className="w-4 h-4" /> Recalls</TabsTrigger>
          <TabsTrigger value="mock" className="gap-2"><ClipboardList className="w-4 h-4" /> Mock Recalls</TabsTrigger>
        </TabsList>

        <TabsContent value="recalls">

      {activeRecalls.length > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">{activeRecalls.length} active recall{activeRecalls.length !== 1 ? 's' : ''} in progress</p>
            <p className="text-xs text-destructive/80">MPI contact: 0800 00 83 33 · Food.Recalls@mpi.govt.nz</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active recalls', value: activeRecalls.length, warn: activeRecalls.length > 0 },
          { label: 'Closed recalls', value: recalls.filter(r => r.status === 'closed').length, warn: false },
          { label: 'Total batches affected', value: recalls.filter(r => r.status !== 'closed').reduce((s, r) => s + (r.bottles_affected || 0), 0), warn: false },
          { label: 'Total recalls', value: recalls.length, warn: false },
        ].map(({ label, value, warn }) => (
          <div key={label} className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-2xl font-bold font-display ${warn ? 'text-destructive' : 'text-primary'}`}>{value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
      ) : recalls.length === 0 ? (
        <Card className="p-10 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="font-medium">No recalls on record</p>
          <p className="text-sm text-muted-foreground mt-1">Use the Initiate Recall button if a product issue is identified</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {recalls.map(r => (
            <RecallCard key={r.id} recall={r} dispatches={dispatches} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditingId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {editingId ? 'Update Recall' : 'Initiate Food Recall'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Basic details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recall number</Label>
                <Input value={form.recall_number} onChange={e => set('recall_number', e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Date initiated</Label>
                <Input type="date" value={form.date_initiated} onChange={e => set('date_initiated', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Product name</Label>
                <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="e.g. London Dry Gin" className="mt-1" />
              </div>
              <div>
                <Label>Affected batches</Label>
                <div className="mt-1 rounded-lg border border-border max-h-48 overflow-y-auto">
                  {allBatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">No batches found — add distillation or bottling runs first</p>
                  ) : allBatches.map(b => {
                    const checked = (form.batch_numbers || '').split(',').map(s => s.trim()).includes(b.code);
                    return (
                      <label key={b.code} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border last:border-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(val) => {
                            const current = (form.batch_numbers || '').split(',').map(s => s.trim()).filter(Boolean);
                            const updated = val ? [...current, b.code] : current.filter(c => c !== b.code);
                            set('batch_numbers', updated.join(', '));
                            if (val && !form.product_name) set('product_name', b.product || '');
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium">{b.code}</p>
                          <p className="text-xs text-muted-foreground truncate">{b.product}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{b.source}</span>
                      </label>
                    );
                  })}
                </div>
                {form.batch_numbers && (
                  <p className="text-xs text-muted-foreground mt-1">Selected: {form.batch_numbers}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Reason type</Label>
                <Select value={form.reason_type} onValueChange={v => set('reason_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{REASON_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recall level</Label>
                <Select value={form.recall_level} onValueChange={v => set('recall_level', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consumer">Consumer-level</SelectItem>
                    <SelectItem value="trade">Trade-level</SelectItem>
                    <SelectItem value="none">No recall needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reason detail</Label>
              <Textarea value={form.reason_detail} onChange={e => set('reason_detail', e.target.value)} placeholder="Describe the food safety issue in detail" className="mt-1" rows={2} />
            </div>

            {/* Current status */}
            <div>
              <Label>Current step / status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="investigating">Step 1 — Investigating</SelectItem>
                  <SelectItem value="informed">Step 2 — MPI informed</SelectItem>
                  <SelectItem value="assessed">Step 3 — Risk assessed</SelectItem>
                  <SelectItem value="checked">Step 4 — MPI checked</SelectItem>
                  <SelectItem value="communicating">Step 5 — Communicating</SelectItem>
                  <SelectItem value="auditing">Step 6 — Auditing</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* MPI notification */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-amber-800">MPI notification (required within 24 hours)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">MPI notified at</Label>
                  <Input type="datetime-local" value={form.mpi_notified_at} onChange={e => set('mpi_notified_at', e.target.value)} className="mt-1 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">MPI case officer</Label>
                  <Input value={form.mpi_case_officer} onChange={e => set('mpi_case_officer', e.target.value)} placeholder="Name" className="mt-1" />
                </div>
              </div>
            </div>

            {/* Per-step notes */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Notes per step</p>
              {RECALL_STEPS.map(s => (
                <div key={s.num}>
                  <Label className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs ${s.color}`}>{s.num}</span>
                    {s.label} — {s.desc}
                    {s.urgent && <span className="text-xs text-destructive font-medium">24hr limit</span>}
                  </Label>
                  <Textarea value={form[s.key]} onChange={e => set(s.key, e.target.value)} className="mt-1" rows={2} placeholder={`Step ${s.num} notes…`} />
                </div>
              ))}
            </div>

            {/* Recovery stats */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bottles affected</Label>
                <Input type="number" value={form.bottles_affected} onChange={e => set('bottles_affected', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Bottles recovered</Label>
                <Input type="number" value={form.bottles_recovered} onChange={e => set('bottles_recovered', e.target.value)} className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Corrective actions</Label>
              <Textarea value={form.corrective_actions} onChange={e => set('corrective_actions', e.target.value)} placeholder="What was done to prevent recurrence?" className="mt-1" rows={2} />
            </div>

            <Button className="w-full bg-destructive hover:bg-destructive/90" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.product_name}>
              {saveMutation.isPending ? 'Saving...' : editingId ? 'Update Recall' : 'Initiate Recall'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>

        <TabsContent value="mock">
          {loadingMocks ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
          ) : mockRecalls.length === 0 ? (
            <Card className="p-10 text-center">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="font-medium">No mock recalls logged</p>
              <p className="text-sm text-muted-foreground mt-1">Use the Log Mock Recall button to record a drill</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {mockRecalls.map(m => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{m.recall_number}</span>
                        {m.product_name && <span className="text-sm text-muted-foreground">— {m.product_name}</span>}
                        {m.outcome && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.outcome === 'pass' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{m.outcome}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {m.date_conducted && <span>{format(new Date(m.date_conducted), 'MMM d, yyyy')}</span>}
                        {m.conducted_by && <span>By: {m.conducted_by}</span>}
                        {m.time_to_complete_mins && <span>{m.time_to_complete_mins} mins</span>}
                      </div>
                      {m.scenario && <p className="text-sm mt-1 text-muted-foreground">{m.scenario}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setEditingMockId(m.id); setMockForm({ ...BLANK_MOCK, ...m }); setMockOpen(true); }}>Edit</Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm('Delete this mock recall?')) deleteMockMutation.mutate(m.id); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Mock recall dialog */}
      <Dialog open={mockOpen} onOpenChange={v => { setMockOpen(v); if (!v) { setEditingMockId(null); setMockForm(BLANK_MOCK); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {editingMockId ? 'Edit Mock Recall' : 'Log Mock Recall'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recall number</Label>
                <Input value={mockForm.recall_number} onChange={e => setM('recall_number', e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                <Label>Date conducted</Label>
                <Input type="date" value={mockForm.date_conducted} onChange={e => setM('date_conducted', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Product name</Label>
                <Input value={mockForm.product_name} onChange={e => setM('product_name', e.target.value)} placeholder="e.g. London Dry Gin" className="mt-1" />
              </div>
              <div>
                <Label>Conducted by</Label>
                <Input value={mockForm.conducted_by} onChange={e => setM('conducted_by', e.target.value)} placeholder="Name" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Scenario</Label>
              <Textarea value={mockForm.scenario} onChange={e => setM('scenario', e.target.value)} placeholder="Describe the mock recall scenario" className="mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Outcome</Label>
                <Select value={mockForm.outcome} onValueChange={v => setM('outcome', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="partial">Partial pass</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Time to complete (mins)</Label>
                <Input type="number" value={mockForm.time_to_complete_mins} onChange={e => setM('time_to_complete_mins', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Next mock due</Label>
              <Input type="date" value={mockForm.next_mock_due} onChange={e => setM('next_mock_due', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Corrective actions</Label>
              <Textarea value={mockForm.corrective_actions} onChange={e => setM('corrective_actions', e.target.value)} placeholder="Any improvements identified?" className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={mockForm.notes} onChange={e => setM('notes', e.target.value)} className="mt-1" rows={2} />
            </div>
            <Button className="w-full" onClick={() => saveMockMutation.mutate(mockForm)} disabled={saveMockMutation.isPending}>
              {saveMockMutation.isPending ? 'Saving...' : editingMockId ? 'Update Mock Recall' : 'Log Mock Recall'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}