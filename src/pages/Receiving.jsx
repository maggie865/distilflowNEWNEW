import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Upload, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const TYPES = ['ethanol', 'botanical', 'grain', 'sugar', 'water', 'flavoring', 'other'];
const UNITS = ['litres', 'kg', 'units'];

export default function Receiving() {
  const [open, setOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [form, setForm] = useState({
    material_name: '', material_type: '', quantity: '', unit: 'litres',
    abv_percent: '', supplier: '', cost_per_unit: '', batch_number: '',
    date_received: new Date().toISOString().split('T')[0], notes: ''
  });
  const queryClient = useQueryClient();

  const handlePackingSlip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setOpen(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
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
        const VALID_TYPES = ['ethanol', 'botanical', 'grain', 'sugar', 'water', 'flavoring', 'other'];
        const VALID_UNITS = ['litres', 'kg', 'units'];
        setForm(prev => ({
          ...prev,
          material_name: d.material_name || prev.material_name,
          material_type: VALID_TYPES.includes(d.material_type) ? d.material_type : prev.material_type,
          quantity: d.quantity != null ? String(d.quantity) : prev.quantity,
          unit: VALID_UNITS.includes(d.unit) ? d.unit : prev.unit,
          abv_percent: d.abv_percent != null ? String(d.abv_percent) : prev.abv_percent,
          supplier: d.supplier || prev.supplier,
          cost_per_unit: d.cost_per_unit != null ? String(d.cost_per_unit) : prev.cost_per_unit,
          batch_number: d.batch_number || prev.batch_number,
          date_received: d.date_received || prev.date_received,
          notes: d.notes || prev.notes,
        }));
        toast.success('Packing slip scanned — please review and confirm');
      } else {
        toast.error('Could not extract data from the file. Please fill in manually.');
      }
    } catch (err) {
      toast.error('Upload failed. Please try again.');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  const { data: receivings = [], isLoading } = useQuery({
    queryKey: ['receivings'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 50),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lals = data.material_type === 'ethanol' && data.abv_percent
        ? (parseFloat(data.quantity) * parseFloat(data.abv_percent) / 100)
        : undefined;

      await base44.entities.Receiving.create({
        ...data,
        quantity: parseFloat(data.quantity),
        abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
        cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
        lals,
      });

      // Also update/create raw material inventory
      const existing = await base44.entities.RawMaterial.filter({ name: data.material_name });
      if (existing.length > 0) {
        const mat = existing[0];
        const newQty = (mat.quantity || 0) + parseFloat(data.quantity);
        const newLals = data.material_type === 'ethanol'
          ? (mat.lals || 0) + (lals || 0) : mat.lals;
        await base44.entities.RawMaterial.update(mat.id, {
          quantity: newQty,
          lals: newLals,
          abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : mat.abv_percent,
        });
      } else {
        await base44.entities.RawMaterial.create({
          name: data.material_name,
          type: data.material_type,
          quantity: parseFloat(data.quantity),
          unit: data.unit,
          abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
          lals,
          supplier: data.supplier,
          cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
          batch_number: data.batch_number,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivings'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setOpen(false);
      setForm({
        material_name: '', material_type: '', quantity: '', unit: 'litres',
        abv_percent: '', supplier: '', cost_per_unit: '', batch_number: '',
        date_received: new Date().toISOString().split('T')[0], notes: ''
      });
      toast.success('Material received successfully');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Receiving" subtitle="Log incoming raw materials and ethanol">
        <label className="cursor-pointer">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handlePackingSlip} />
          <div className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
            <Upload className="w-4 h-4" />Scan Packing Slip
          </div>
        </label>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Receive Material</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Receive Material</DialogTitle>
            </DialogHeader>
            {extracting && (
              <div className="flex items-center gap-3 rounded-lg bg-primary/8 border border-primary/20 px-4 py-3 mb-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">Scanning packing slip…</p>
                  <p className="text-xs text-muted-foreground">Extracting fields from your document</p>
                </div>
              </div>
            )}
            {!extracting && form.material_name && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mb-2">
                <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-700">Fields pre-filled from packing slip — please review before saving</p>
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
                      {TYPES.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
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
                {form.material_type === 'ethanol' && (
                  <div>
                    <Label>ABV %</Label>
                    <Input type="number" step="0.1" value={form.abv_percent} onChange={e => set('abv_percent', e.target.value)} />
                  </div>
                )}
                {form.material_type === 'ethanol' && form.quantity && form.abv_percent && (
                  <div>
                    <Label>Calculated LALs</Label>
                    <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                      {(parseFloat(form.quantity) * parseFloat(form.abv_percent) / 100).toFixed(3)}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Supplier</Label>
                  <Input value={form.supplier} onChange={e => set('supplier', e.target.value)} />
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
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Receive Material'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>ABV</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Batch #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : receivings.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No receivings yet</TableCell></TableRow>
              ) : receivings.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date_received ? format(new Date(r.date_received), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                  <TableCell className="text-sm capitalize">{r.material_type}</TableCell>
                  <TableCell className="text-sm">{r.quantity} {r.unit}</TableCell>
                  <TableCell className="text-sm">{r.abv_percent ? `${r.abv_percent}%` : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.lals ? r.lals.toFixed(3) : '—'}</TableCell>
                  <TableCell className="text-sm">{r.supplier || '—'}</TableCell>
                  <TableCell className="text-sm">{r.batch_number || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}