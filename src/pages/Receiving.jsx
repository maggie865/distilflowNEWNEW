import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Upload, Loader2, FileText, Pencil, ExternalLink, Trash2, MapPin, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/shared/Pagination';

const PAGE_SIZE = 50;

const MATERIAL_TYPES = ['Ethanol', 'Botanicals', 'Packaging', 'Grain', 'Sugar', 'Water', 'Flavoring', 'Other'];
const TRANSPORT_METHODS = ['road', 'courier', 'air', 'sea'];
const UNITS = ['litres', 'kg', 'units'];
const DISTILLERY_ADDRESS = '250 Ocean Beach Road, Bluff, New Zealand';

const BLANK_FORM = {
  material_name: '', material_type: '', quantity: '', unit: 'litres',
  abv_percent: '', supplier_id: '', supplier_name: '', transport_distance_km: '', transport_method: 'road',
  weight_kg: '', cost_per_unit: '', batch_number: '',
  date_received: new Date().toISOString().split('T')[0], notes: '', packing_slip_url: ''
};

// ── Packing Slip Viewer Dialog ───────────────────────────────────────────────
function PackingSlipViewer({ url, onClose }) {
  const isPdf = url?.toLowerCase().includes('.pdf');
  return (
    <Dialog open={!!url} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-4 h-4" /> Packing Slip
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border border-border mt-2">
          {isPdf ? (
            <iframe src={url} className="w-full h-[70vh]" title="Packing Slip" />
          ) : (
            <img src={url} alt="Packing Slip" className="w-full h-auto max-h-[70vh] object-contain" />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
            </Button>
          </a>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Receiving() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [uploadingSlip, setUploadingSlip] = useState(false);
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [viewingSlip, setViewingSlip] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const queryClient = useQueryClient();

  const receivingsQuery = useQuery({
    queryKey: ['receivings', currentPage],
    queryFn: () => db.Receiving.listPage('-date_received', PAGE_SIZE, currentPage * PAGE_SIZE),
  });

  const { refetch } = receivingsQuery;
  const isRefreshing = usePullToRefresh(() => refetch());

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => db.Supplier.list('business_name', 100),
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      material_name: r.material_name || '',
      material_type: r.material_type || '',
      quantity: r.quantity != null ? String(r.quantity) : '',
      unit: r.unit || 'litres',
      abv_percent: r.abv_percent != null ? String(r.abv_percent) : '',
      supplier_id: r.supplier_id || '',
      supplier_name: r.supplier_name || '',
      transport_distance_km: r.transport_distance_km != null ? String(r.transport_distance_km) : '',
      transport_method: r.transport_method || 'road',
      weight_kg: r.weight_kg != null ? String(r.weight_kg) : '',
      cost_per_unit: r.cost_per_unit != null ? String(r.cost_per_unit) : '',
      batch_number: r.batch_number || '',
      date_received: r.date_received || new Date().toISOString().split('T')[0],
      notes: r.notes || '',
      packing_slip_url: r.packing_slip_url || '',
    });
    setOpen(true);
  };

  const calculateDistance = async (supplierAddress) => {
    if (!supplierAddress) return;
    setCalcingDistance(true);
    try {
      const res = await base44.functions.invoke('getDistanceMatrix', {
        origin: supplierAddress,
        destination: DISTILLERY_ADDRESS,
      });
      if (res.data?.distance_km) {
        setForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
        toast.success(`Distance: ${res.data.distance_km} km`);
      }
    } finally {
      setCalcingDistance(false);
    }
  };

  // ── Upload packing slip via Base44 file upload ────────────────────────────
  const uploadPackingSlip = async (file) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  };

  // ── Handle packing slip file selection ────────────────────────────────────
  const handlePackingSlip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSlip(true);
    if (!open) setOpen(true);

    try {
      // 1. Upload to Supabase Storage first
      const publicUrl = await uploadPackingSlip(file);
      setForm(prev => ({ ...prev, packing_slip_url: publicUrl }));
      toast.success('Packing slip uploaded');

      // 2. Try to extract data using Base44 OCR
      setExtracting(true);
      try {
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url: publicUrl,
          json_schema: {
            type: 'object',
            properties: {
              material_name: { type: 'string', description: 'Name of the material or product received' },
              material_type: { type: 'string', description: 'Type: ethanol, botanical, grain, sugar, water, flavoring, or other' },
              quantity: { type: 'number', description: 'Quantity received' },
              unit: { type: 'string', description: 'Unit of measurement: litres, kg, or units' },
              abv_percent: { type: 'number', description: 'ABV percentage if applicable' },
              supplier: { type: 'string', description: 'Supplier or vendor name' },
              cost_per_unit: { type: 'number', description: 'Cost per unit if listed' },
              batch_number: { type: 'string', description: 'Lot number, batch number, or invoice number' },
              date_received: { type: 'string', description: 'Date received in YYYY-MM-DD format' },
              notes: { type: 'string', description: 'Any other relevant notes from the document' },
            }
          }
        });

        if (result.status === 'success' && result.output) {
          const d = Array.isArray(result.output) ? result.output[0] : result.output;
          const VALID_UNITS = ['litres', 'kg', 'units'];

          let matchedSupplier = null;
          if (d.supplier && suppliersQuery.data) {
            matchedSupplier = suppliersQuery.data.find(s =>
              s.business_name.toLowerCase().includes(d.supplier.toLowerCase()) ||
              d.supplier.toLowerCase().includes(s.business_name.toLowerCase())
            );
          }

          setForm(prev => ({
            ...prev,
            material_name: d.material_name || prev.material_name,
            material_type: MATERIAL_TYPES.find(t => t.toLowerCase().includes(d.material_type?.toLowerCase())) || prev.material_type,
            quantity: d.quantity != null ? String(d.quantity) : prev.quantity,
            unit: VALID_UNITS.includes(d.unit) ? d.unit : prev.unit,
            abv_percent: d.abv_percent != null ? String(d.abv_percent) : prev.abv_percent,
            supplier_id: matchedSupplier?.id || prev.supplier_id,
            supplier_name: matchedSupplier?.business_name || d.supplier || prev.supplier_name,
            cost_per_unit: d.cost_per_unit != null ? String(d.cost_per_unit) : prev.cost_per_unit,
            batch_number: d.batch_number || prev.batch_number,
            date_received: d.date_received || prev.date_received,
            notes: d.notes || prev.notes,
          }));

          if (matchedSupplier?.address) {
            setTimeout(() => calculateDistance(matchedSupplier.address), 500);
          }

          toast.success('Packing slip scanned — please review before saving');
        }
      } catch {
        // OCR failed silently — slip is still uploaded and saved
        toast.info('Slip uploaded — could not auto-extract fields, please fill in manually');
      } finally {
        setExtracting(false);
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploadingSlip(false);
      e.target.value = '';
    }
  };

  const buildPayload = (data) => {
    const lals = data.material_type === 'Ethanol' && data.abv_percent
      ? (parseFloat(data.quantity) * parseFloat(data.abv_percent) / 100)
      : undefined;

    let co2e = 0;
    const weight = data.weight_kg ? parseFloat(data.weight_kg) : 0;
    const distance = data.transport_distance_km ? parseFloat(data.transport_distance_km) : 0;
    const method = data.transport_method || 'road';

    if (weight > 0 && distance > 0) {
      if (method === 'road') co2e = (distance * weight / 1000) * 0.12;
      else if (method === 'courier') co2e = (distance * weight / 1000) * 0.15;
      else if (method === 'air') co2e = (distance * weight / 1000) * 0.55;
      else if (method === 'sea') co2e = (distance * weight / 1000) * 0.008;
    }

    return {
      material_name: data.material_name,
      material_type: data.material_type,
      quantity: parseFloat(data.quantity),
      unit: data.unit,
      abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
      lals,
      supplier_id: data.supplier_id || undefined,
      supplier_name: data.supplier_name || undefined,
      transport_distance_km: distance || undefined,
      transport_method: distance > 0 ? method : undefined,
      weight_kg: weight || undefined,
      co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined,
      cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
      batch_number: data.batch_number,
      date_received: data.date_received,
      notes: data.notes,
      packing_slip_url: data.packing_slip_url,
    };
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildPayload(data);
      await db.Receiving.create(payload);

      const existing = await db.RawMaterial.filterIlike({ name: data.material_name });
      if (existing.length > 0) {
        const mat = existing[0];
        const newQty = (mat.quantity || 0) + parseFloat(data.quantity);
        const newLals = data.material_type === 'Ethanol'
          ? (mat.lals || 0) + (payload.lals || 0) : mat.lals;
        await db.RawMaterial.update(mat.id, {
          quantity: newQty,
          lals: newLals,
          abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : mat.abv_percent,
        });
      } else {
        await db.RawMaterial.create({
          name: data.material_name,
          type: data.material_type?.toLowerCase(),
          quantity: parseFloat(data.quantity),
          unit: data.unit,
          abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
          lals: payload.lals,
          supplier: data.supplier_name,
          cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
          batch_number: data.batch_number,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setOpen(false);
      setForm(BLANK_FORM);
      toast.success('Material received successfully');
    },
    onError: (err) => {
      toast.error('Failed to save: ' + (err?.message || 'Unknown error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildPayload(data);
      await db.Receiving.update(editingId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      setOpen(false);
      setEditingId(null);
      setForm(BLANK_FORM);
      toast.success('Receiving record updated');
    },
    onError: (err) => {
      toast.error('Failed to update: ' + (err?.message || 'Unknown error'));
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (record) => {
      const existing = await db.RawMaterial.filterIlike({ name: record.material_name });
      if (existing.length > 0) {
        const mat = existing[0];
        const newQty = Math.max(0, (mat.quantity || 0) - (record.quantity || 0));
        const newLals = record.material_type === 'Ethanol'
          ? Math.max(0, (mat.lals || 0) - (record.lals || 0))
          : mat.lals;
        await db.RawMaterial.update(mat.id, { quantity: newQty, lals: newLals });
      }
      await db.Receiving.delete(record.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      toast.success('Record deleted and inventory updated');
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const data = receivingsQuery.data?.data ?? [];
  const totalCount = receivingsQuery.data?.count ?? 0;
  const isLoading = receivingsQuery.isLoading;

  return (
    <div className="pb-20 md:pb-0 relative">
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-primary/20 z-50">
          <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
        </div>
      )}

      <PageHeader title="Receiving" subtitle="Log incoming raw materials and ethanol">
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handlePackingSlip} disabled={uploadingSlip || extracting} />
          <div className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors ${(uploadingSlip || extracting) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {uploadingSlip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploadingSlip ? 'Uploading…' : extracting ? 'Scanning…' : 'Scan Packing Slip'}
          </div>
        </label>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Receive Material</Button>
      </PageHeader>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(BLANK_FORM); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? 'Edit Receiving Record' : 'Receive Material'}</DialogTitle>
          </DialogHeader>

          {(uploadingSlip || extracting) && (
            <div className="flex items-center gap-3 rounded-lg bg-primary/8 border border-primary/20 px-4 py-3 mb-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-primary">
                  {uploadingSlip ? 'Uploading packing slip…' : 'Scanning document…'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {uploadingSlip ? 'Your file is being saved securely' : 'Extracting fields from your document'}
                </p>
              </div>
            </div>
          )}

          {!uploadingSlip && !extracting && form.packing_slip_url && (
            <div
              className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mb-2 cursor-pointer hover:bg-green-100 transition-colors"
              onClick={() => setViewingSlip(form.packing_slip_url)}
            >
              <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-700 font-medium">Packing slip attached — click to preview</p>
              <Eye className="w-4 h-4 text-green-600 ml-auto" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Material Name</Label>
                <Input value={form.material_name} onChange={e => set('material_name', e.target.value)} required />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.material_type} onValueChange={v => set('material_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {MATERIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date Received</Label>
                <Input type="date" value={form.date_received} onChange={e => set('date_received', e.target.value)} required />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" step="0.01" value={form.quantity} onChange={e => set('quantity', e.target.value)} required />
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={v => set('unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.material_type === 'Ethanol' && (
                <div>
                  <Label>ABV %</Label>
                  <Input type="number" step="0.1" value={form.abv_percent} onChange={e => set('abv_percent', e.target.value)} />
                </div>
              )}
              {form.material_type === 'Ethanol' && form.quantity && form.abv_percent && (
                <div>
                  <Label>Calculated LALs</Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                    {(parseFloat(form.quantity) * parseFloat(form.abv_percent) / 100).toFixed(3)}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={v => {
                  const supplier = suppliersQuery.data?.find(s => s.id === v);
                  set('supplier_id', v);
                  set('supplier_name', supplier?.business_name || '');
                  if (supplier?.address) calculateDistance(supplier.address);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliersQuery.data?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.supplier_name && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {suppliersQuery.data?.find(s => s.id === form.supplier_id)?.address || ''}
                  </p>
                </div>
              )}
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" step="0.1" value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} placeholder="For CO2e calculation" />
              </div>
              <div>
                <Label>Distance (km)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    value={form.transport_distance_km}
                    onChange={e => set('transport_distance_km', e.target.value)}
                    placeholder={calcingDistance ? 'Calculating…' : '0'}
                    disabled={calcingDistance}
                  />
                  {calcingDistance && (
                    <div className="absolute right-2.5 top-2.5">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Transport Method</Label>
                <Select value={form.transport_method} onValueChange={v => set('transport_method', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost per Unit</Label>
                <Input type="number" step="0.01" value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} />
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={isPending || uploadingSlip}>
              {isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Receive Material'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>CO2e</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Slip</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No receivings yet</TableCell></TableRow>
              ) : data.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date_received ? format(new Date(r.date_received), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                  <TableCell className="text-sm">{r.material_type}</TableCell>
                  <TableCell className="text-sm">{r.quantity} {r.unit}</TableCell>
                  <TableCell className="text-sm">{r.supplier_name || '—'}</TableCell>
                  <TableCell className="text-sm">{r.transport_distance_km ? `${r.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell className="text-sm font-semibold text-green-600">{r.co2e_kg ? `${r.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.lals ? r.lals.toFixed(3) : '—'}</TableCell>
                  <TableCell>
                    {r.packing_slip_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setViewingSlip(r.packing_slip_url)}
                      >
                        <Eye className="w-3 h-3" /> View
                      </Button>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Delete this receiving record?')) deleteMutation.mutate(r); }}
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

      <Pagination currentPage={currentPage} totalCount={totalCount} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />

      {/* Packing Slip Viewer */}
      <PackingSlipViewer url={viewingSlip} onClose={() => setViewingSlip(null)} />
    </div>
  );
}