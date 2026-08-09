import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Link2, FileText, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { buildReceivingPayload, calcReceivingCo2e, resolveAlias, syncRawMaterialFromReceiving } from '@/lib/receivingInventory';

const MATERIAL_TYPES = ['Ethanol', 'Botanicals', 'Packaging', 'Grain', 'Sugar', 'Water', 'Flavoring', 'Other'];
const TRANSPORT_METHODS = ['road', 'courier', 'air', 'sea', 'pickup'];
const UNITS = ['litres', 'kg', 'units'];
const DISTILLERY_ADDRESS = '250 Ocean Beach Road, Bluff, New Zealand';

const today = () => new Date().toISOString().split('T')[0];
const BLANK_HEADER = () => ({ date_received: today(), supplier_id: '', supplier_name: '', packing_slip_number: '', transport_distance_km: '', transport_method: 'road', notes: '', packing_slip_url: '' });
const BLANK_LINE = () => ({ material_name: '', material_type: '', quantity: '', unit: 'litres', abv_percent: '', cost_per_unit: '', batch_number: '', weight_kg: '', notes: '', linked_stock_name: '' });

export default function ReceiveShipmentDialog({ open, onClose, suppliers = [], slipUrl = null, scanPrefill = null }) {
  const qc = useQueryClient();
  const [header, setHeader] = useState(BLANK_HEADER());
  const [lines, setLines] = useState([BLANK_LINE()]);

  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => base44.entities.RawMaterial.list('name', 5000) });
  const { data: aliases = [] } = useQuery({ queryKey: ['productAliases'], queryFn: () => base44.entities.ProductAlias.list('alias_name', 5000) });

  const stockNames = (() => {
    const s = new Set();
    rawMaterials.forEach(r => r.name && s.add(r.name));
    return [...s].sort();
  })();

  const calculateDistance = async (supplierAddress) => {
    if (!supplierAddress) return;
    try {
      const res = await base44.functions.invoke('getDistanceMatrix', { origin: supplierAddress, destination: DISTILLERY_ADDRESS });
      if (res.data?.distance_km) {
        setHeader(h => ({ ...h, transport_distance_km: String(res.data.distance_km) }));
        toast.success(`Distance: ${res.data.distance_km} km`);
      }
    } catch { /* ignore */ }
  };

  // (Re)initialise the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const h = BLANK_HEADER();
    h.packing_slip_url = slipUrl || '';
    let firstLines = [BLANK_LINE()];
    if (scanPrefill) {
      h.date_received = scanPrefill.date_received || h.date_received;
      h.supplier_id = scanPrefill.supplier_id || '';
      h.supplier_name = scanPrefill.supplier_name || '';
      firstLines = [{
        ...BLANK_LINE(),
        material_name: scanPrefill.material_name || '',
        material_type: scanPrefill.material_type || '',
        quantity: scanPrefill.quantity != null ? String(scanPrefill.quantity) : '',
        unit: scanPrefill.unit || 'litres',
        abv_percent: scanPrefill.abv_percent != null ? String(scanPrefill.abv_percent) : '',
        cost_per_unit: scanPrefill.cost_per_unit != null ? String(scanPrefill.cost_per_unit) : '',
        batch_number: scanPrefill.batch_number || '',
        notes: scanPrefill.notes || '',
      }];
    }
    setHeader(h);
    setLines(firstLines);
    if (scanPrefill?.supplier_address) calculateDistance(scanPrefill.supplier_address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setH = (f, v) => setHeader(p => ({ ...p, [f]: v }));
  const setLine = (i, f, v) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines(prev => [...prev, BLANK_LINE()]);
  const removeLine = (i) => setLines(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const onMaterialNameChange = (i, val) => {
    const auto = resolveAlias(val, aliases);
    setLine(i, 'material_name', val);
    setLine(i, 'linked_stock_name', auto || '');
  };

  const onSupplierChange = (id) => {
    const s = suppliers.find(x => x.id === id);
    setH('supplier_id', id);
    setH('supplier_name', s?.business_name || '');
    if (s?.address) calculateDistance(s.address);
  };

  const validLines = lines.filter(l => l.material_name.trim() && l.material_type && parseFloat(l.quantity) > 0);
  const totalQty = validLines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
  const totalCo2e = validLines.reduce((s, l) => s + calcReceivingCo2e({ weight_kg: l.weight_kg, transport_distance_km: header.transport_distance_km, transport_method: header.transport_method }), 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (validLines.length === 0) throw new Error('Add at least one valid line item (name, type, quantity)');
      const created = [];
      for (const line of validLines) {
        const resolvedName = (line.linked_stock_name || line.material_name).trim();
        const supplierProductName = line.material_name.trim().toLowerCase() !== resolvedName.toLowerCase() ? line.material_name.trim() : undefined;
        const data = { ...header, ...line, material_name: resolvedName, supplier_product_name: supplierProductName };
        const payload = buildReceivingPayload(data);
        if (line.notes) payload.notes = header.notes ? `${header.notes}\n${line.material_name}: ${line.notes}` : `${line.material_name}: ${line.notes}`;
        const rec = await base44.entities.Receiving.create(payload);
        await syncRawMaterialFromReceiving(payload, rec.id);
        created.push(rec.id);
      }
      return { count: created.length };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['receivings'] });
      qc.invalidateQueries({ queryKey: ['rawMaterials'] });
      toast.success(`${res.count} item${res.count !== 1 ? 's' : ''} received — inventory updated`);
      setHeader(BLANK_HEADER());
      setLines([BLANK_LINE()]);
      onClose();
    },
    onError: (err) => toast.error('Failed to save: ' + (err?.message || 'Unknown error')),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Receive Shipment</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Shared shipment header */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <div>
              <Label className="text-xs">Date Received</Label>
              <Input type="date" value={header.date_received} onChange={e => setH('date_received', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Packing Slip #</Label>
              <Input value={header.packing_slip_number} onChange={e => setH('packing_slip_number', e.target.value)} placeholder="Slip reference" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Supplier</Label>
              <Select value={header.supplier_id} onValueChange={onSupplierChange}>
                <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.business_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {header.supplier_name && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {suppliers.find(s => s.id === header.supplier_id)?.address || ''}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Distance (km)</Label>
              <Input type="number" step="0.1" value={header.transport_distance_km} onChange={e => setH('transport_distance_km', e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">Transport Method</Label>
              <Select value={header.transport_method} onValueChange={v => setH('transport_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSPORT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Shipment Notes (applies to all items)</Label>
              <Textarea value={header.notes} onChange={e => setH('notes', e.target.value)} rows={2} />
            </div>
            {header.packing_slip_url && (
              <div className="col-span-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                <FileText className="w-3.5 h-3.5" /> Packing slip attached
                <a href={header.packing_slip_url} target="_blank" rel="noreferrer" className="ml-auto underline">View</a>
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Items on this slip</p>
              <Button variant="ghost" size="sm" onClick={addLine} className="gap-1 text-xs"><Plus className="w-3 h-3" /> Add item</Button>
            </div>

            {lines.map((line, i) => {
              const auto = resolveAlias(line.material_name, aliases);
              const linked = line.linked_stock_name || auto || '';
              const isLinked = linked && line.material_name && linked.toLowerCase() !== line.material_name.toLowerCase();
              return (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Item {i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(i)} disabled={lines.length === 1}><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Material Name (as on slip)</Label>
                      <Input value={line.material_name} onChange={e => onMaterialNameChange(i, e.target.value)} placeholder="e.g. Lactonol 96% ENA" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Link to stock item {linked && <span className="text-green-600">→ {linked}</span>}</Label>
                      <select value={line.linked_stock_name} onChange={e => setLine(i, 'linked_stock_name', e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                        <option value="">{auto ? `Auto: ${auto}` : 'Use typed name (create new stock item)'}</option>
                        {stockNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      {isLinked && <p className="text-xs text-blue-600 mt-1">Supplier "{line.material_name}" saved & linked to stock item "{linked}".</p>}
                    </div>
                    <div>
                      <Label className="text-xs">Type</Label>
                      <select value={line.material_type} onChange={e => setLine(i, 'material_type', e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                        <option value="">Select…</option>
                        {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input type="number" step="0.01" value={line.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <select value={line.unit} onChange={e => setLine(i, 'unit', e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Cost / unit</Label>
                      <Input type="number" step="0.01" value={line.cost_per_unit} onChange={e => setLine(i, 'cost_per_unit', e.target.value)} />
                    </div>
                    {line.material_type === 'Ethanol' && (
                      <div>
                        <Label className="text-xs">ABV %</Label>
                        <Input type="number" step="0.1" value={line.abv_percent} onChange={e => setLine(i, 'abv_percent', e.target.value)} />
                      </div>
                    )}
                    {line.material_type === 'Ethanol' && line.quantity && line.abv_percent && (
                      <div>
                        <Label className="text-xs">LALs</Label>
                        <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">{(parseFloat(line.quantity) * parseFloat(line.abv_percent) / 100).toFixed(3)}</div>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Batch / Lot #</Label>
                      <Input value={line.batch_number} onChange={e => setLine(i, 'batch_number', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Weight (kg)</Label>
                      <Input type="number" step="0.1" value={line.weight_kg} onChange={e => setLine(i, 'weight_kg', e.target.value)} placeholder="For CO2e" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Line notes</Label>
                      <Input value={line.notes} onChange={e => setLine(i, 'notes', e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {validLines.length} item{validLines.length !== 1 ? 's' : ''} · {totalQty} {validLines[0]?.unit || ''}
            {totalCo2e > 0 && <> · <span className="text-green-600 font-semibold">{totalCo2e.toFixed(3)} kg CO2e</span></>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || validLines.length === 0}>
              {saveMutation.isPending ? 'Receiving…' : `Receive ${validLines.length} item${validLines.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}