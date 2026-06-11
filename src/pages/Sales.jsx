import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Truck, PackageCheck, MapPin, Trash2, Search, Users, Map, Pencil, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DeliveryMap from '@/components/sales/DeliveryMap';

const DISTILLERY_ORIGIN = '250 Ocean Beach Road, Bluff, New Zealand';

// Average weight per bottle based on bottle size
const calcWeightKg = (bottleSizeMl, numBottles) => {
  if (!numBottles) return 0;
  const kgPerBottle = bottleSizeMl <= 250 ? (6 / 12) : (10 / 6);
  return parseFloat((kgPerBottle * numBottles).toFixed(2));
};

// CO2e calculation by transport method (kg CO2e per km per 1000kg)
const EMISSION_FACTORS = {
  road: 0.12,
  courier: 0.12,
  air: 0.9,
  sea: 0.01,
  pickup: 0,
};

const calcCO2e = (distanceKm, weightKg, method) => {
  if (!distanceKm || !weightKg || !method) return 0;
  const factor = EMISSION_FACTORS[method] || 0;
  return parseFloat(((distanceKm * weightKg / 1000) * factor).toFixed(3));
};

const EMPTY_FORM = {
  dispatch_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  customer_address: '',
  product_name: '',
  batch_number: '',
  bottle_size_ml: '',
  quantity_bottles: '',
  transport_distance_km: '',
  transport_method: 'road',
  status: 'dispatched',
  notes: '',
};

export default function Sales() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFGId, setSelectedFGId] = useState('');
  const [deletingDispatch, setDeletingDispatch] = useState(null);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [returningDispatch, setReturningDispatch] = useState(null);
  const [search, setSearch] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [calcingDistance, setCalcingDistance] = useState(false);

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('-created_date', 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => db.Customer.list('business_name', 200),
  });

  const { data: sheetData = { dispatches: [] } } = useQuery({
    queryKey: ['sheetDispatches'],
    queryFn: async () => {
      // Sheet sync removed — dispatches now in Supabase
      return res.data;
    },
    staleTime: 60_000,
  });

  const dispatches = sheetData.dispatches || [];

  // Only sellable stock (not tasting bottles)
  const sellableGoods = finishedGoods.filter(fg => !fg.product_name?.includes('Tasting'));

  const selectedFG = finishedGoods.find(fg => fg.id === selectedFGId);

  const maxBottles = selectedFG?.quantity_bottles || 0;
  const qty = parseInt(form.quantity_bottles) || 0;
  const overStock = qty > maxBottles;
  const estimatedWeightKg = selectedFG ? calcWeightKg(selectedFG.bottle_size_ml, qty) : 0;

  const handleSelectFG = (id) => {
    setSelectedFGId(id);
    const fg = finishedGoods.find(f => f.id === id);
    if (fg) {
      setForm(f => ({
        ...f,
        product_name: fg.product_name,
        batch_number: fg.batch_number,
        bottle_size_ml: fg.bottle_size_ml || '',
      }));
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedFGId('');
  };

  const calculateDistance = async (customerAddress) => {
    if (!customerAddress) return;
    setCalcingDistance(true);
    try {
      const res = await base44.functions.invoke('getDistanceMatrix', {
        origin: DISTILLERY_ORIGIN,
        destination: customerAddress,
      });
      if (res.data?.distance_km) {
        setForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
        toast.success(`Distance: ${res.data.distance_km} km (${res.data.duration_text})`);
      }
    } catch (err) {
      toast.error('Could not calculate distance — enter manually');
    } finally {
      setCalcingDistance(false);
    }
  };

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const lals = selectedFG
        ? ((qty * (selectedFG.bottle_size_ml || 700)) / 1000) * (selectedFG.abv_percent || 0) / 100
        : 0;

      const weightKg = calcWeightKg(selectedFG?.bottle_size_ml, qty);
      const distanceKm = parseFloat(form.transport_distance_km) || 0;
      const co2e = calcCO2e(distanceKm, weightKg, form.transport_method);

      const dispatchData = {
        ...form,
        quantity_bottles: qty,
        bottle_size_ml: selectedFG?.bottle_size_ml || null,
        transport_distance_km: distanceKm,
        total_lals: parseFloat(lals.toFixed(4)),
        parcel_weight_kg: weightKg,
        co2e_kg: co2e,
        dispatched_from: 'Bluff Distillery',
        is_sample: 'FALSE',
      };

      // 1. Append to Google Sheet
      // Sheet append removed — dispatch already saved to Supabase above

      // 2. Deduct from finished goods stock
      if (selectedFG) {
        const newQty = (selectedFG.quantity_bottles || 0) - qty;
        const newLals = Math.max(0, (selectedFG.total_lals || 0) - parseFloat(lals.toFixed(4)));
        if (newQty <= 0) {
          await db.FinishedGood.delete(selectedFG.id);
        } else {
          await db.FinishedGood.update(selectedFG.id, {
            quantity_bottles: newQty,
            total_lals: parseFloat(newLals.toFixed(4)),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetDispatches'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setShowForm(false);
      resetForm();
      toast.success('Dispatch recorded and synced to Google Sheet');
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      await db.Dispatch.update(editingDispatch.id, {
        status: editForm.status,
        notes: editForm.notes,
        dispatch_date: editForm.dispatch_date,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetDispatches'] });
      setEditingDispatch(null);
      toast.success('Dispatch updated');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (dispatch) => {
      // Restore stock
      const existing = await db.FinishedGood.filter({
        product_name: dispatch.product_name,
        batch_number: dispatch.batch_number,
      });
      if (existing.length > 0) {
        const fg = existing[0];
        await db.FinishedGood.update(fg.id, {
          quantity_bottles: (fg.quantity_bottles || 0) + (dispatch.quantity_bottles || 0),
          total_lals: parseFloat(((fg.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)),
        });
      } else {
        await db.FinishedGood.create({
          product_name: dispatch.product_name,
          batch_number: dispatch.batch_number,
          bottle_size_ml: dispatch.bottle_size_ml,
          quantity_bottles: dispatch.quantity_bottles,
          total_lals: dispatch.total_lals,
        });
      }
      // Mark dispatch as returned (keep the record)
      await db.Dispatch.update(dispatch.id, { status: 'pending', notes: (dispatch.notes ? dispatch.notes + ' [RETURNED]' : '[RETURNED]') });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetDispatches'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setReturningDispatch(null);
      toast.success('Stock returned');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (dispatch) => {
      // Restore stock to the finished good
      const existing = await db.FinishedGood.filter({
        product_name: dispatch.product_name,
        batch_number: dispatch.batch_number,
      });
      if (existing.length > 0) {
        const fg = existing[0];
        await db.FinishedGood.update(fg.id, {
          quantity_bottles: (fg.quantity_bottles || 0) + (dispatch.quantity_bottles || 0),
          total_lals: parseFloat(((fg.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)),
        });
      } else {
        await db.FinishedGood.create({
          product_name: dispatch.product_name,
          batch_number: dispatch.batch_number,
          bottle_size_ml: dispatch.bottle_size_ml,
          quantity_bottles: dispatch.quantity_bottles,
          total_lals: dispatch.total_lals,
        });
      }
      await db.Dispatch.delete(dispatch.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetDispatches'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setDeletingDispatch(null);
      toast.success('Dispatch deleted and stock restored');
    },
  });

  const filtered = dispatches.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.customer_name?.toLowerCase().includes(s) ||
      d.product_name?.toLowerCase().includes(s) ||
      d.batch_number?.toLowerCase().includes(s)
    );
  });

  // Summary stats
   const totalBottlesDispatched = dispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
   const totalLalsDispatched = dispatches.reduce((s, d) => s + (d.total_lals || 0), 0);
   const totalKm = dispatches.reduce((s, d) => s + (d.transport_distance_km || 0), 0);
   const totalCO2e = dispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
   const uniqueCustomers = new Set(dispatches.map(d => d.customer_name)).size;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Sales & Dispatch" subtitle="Record stock movements and track customer deliveries">
        <Button variant="outline" onClick={() => setShowMap(v => !v)} className="gap-2">
          <Map className="w-4 h-4" />
          {showMap ? 'Hide Map' : 'Delivery Map'}
        </Button>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Dispatch
        </Button>
      </PageHeader>

      {showMap && (
        <div className="mb-6">
          <DeliveryMap dispatches={dispatches} customers={customers} distilleryOrigin={DISTILLERY_ORIGIN} />
        </div>
      )}

      {/* Stats */}
       <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
         {[
           { label: 'Total Dispatched', value: totalBottlesDispatched.toLocaleString(), sub: 'bottles', icon: PackageCheck, color: 'text-primary', bg: 'bg-accent border-accent-foreground/10' },
           { label: 'Total LALs Sold', value: totalLalsDispatched.toFixed(2), sub: 'litres abs. alcohol', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
           { label: 'Total CO2e', value: totalCO2e.toFixed(1), sub: 'kg emissions', icon: Truck, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
           { label: 'Customers', value: uniqueCustomers, sub: 'unique recipients', icon: PackageCheck, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
           { label: 'Total Distance', value: totalKm.toLocaleString(), sub: 'km traveled', icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
         ].map(({ label, value, sub, icon: Icon, color, bg }) => (
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

      {/* Dispatch History */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-lg font-semibold">Dispatch History</h2>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, product, batch…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Bottles</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>CO2e</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                    No dispatches recorded yet
                  </TableCell>
                </TableRow>
              ) : filtered.map((d, i) => (
                <TableRow key={d.id || d._row_index || i}>
                  <TableCell>{(() => { try { const dt = new Date(d.dispatch_date?.replace(/-/g, '/')); return isNaN(dt) ? d.dispatch_date || '—' : format(dt, 'dd MMM yyyy'); } catch { return d.dispatch_date || '—'; } })()}</TableCell>
                  <TableCell className="font-semibold">{d.customer_name}</TableCell>
                  <TableCell>{d.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.batch_number}</TableCell>
                  <TableCell className="font-semibold">{d.quantity_bottles}</TableCell>
                  <TableCell>{typeof d.total_lals === 'number' ? d.total_lals.toFixed(3) : d.total_lals || '—'}</TableCell>
                  <TableCell>{d.transport_distance_km ? `${d.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell>{d.parcel_weight_kg ? `${d.parcel_weight_kg} kg` : '—'}</TableCell>
                  <TableCell className="capitalize">{d.transport_method || '—'}</TableCell>
                  <TableCell className="font-semibold text-green-600">{d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(2)} kg` : '—'}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell>
                    {d.id && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Edit"
                          onClick={() => { setEditingDispatch(d); setEditForm({ status: d.status, notes: d.notes || '', dispatch_date: d.dispatch_date }); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700"
                          title="Return stock"
                          onClick={() => setReturningDispatch(d)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() => setDeletingDispatch(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* New Dispatch Dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Record Dispatch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Product from stock */}
            <div>
              <Label>Product (from stock)</Label>
              <Select value={selectedFGId} onValueChange={handleSelectFG}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select finished good" />
                </SelectTrigger>
                <SelectContent>
                  {sellableGoods.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No finished goods in stock</div>
                  )}
                  {sellableGoods.map(fg => (
                    <SelectItem key={fg.id} value={fg.id}>
                      {fg.product_name} — Batch {fg.batch_number} ({fg.quantity_bottles} btls)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stock info */}
            {selectedFG && (
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">In Stock</p>
                  <p className="font-semibold">{selectedFG.quantity_bottles} bottles</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Size</p>
                  <p className="font-semibold">{selectedFG.bottle_size_ml}ml</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Batch</p>
                  <p className="font-semibold font-mono text-xs">{selectedFG.batch_number}</p>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <Label>Quantity (bottles)</Label>
              <Input
                type="number"
                min="1"
                max={maxBottles}
                value={form.quantity_bottles}
                onChange={e => setForm(f => ({ ...f, quantity_bottles: e.target.value }))}
                className={`mt-1 ${overStock ? 'border-destructive' : ''}`}
                placeholder="0"
              />
              {overStock && (
                <p className="text-xs text-destructive mt-1">Exceeds available stock ({maxBottles} bottles)</p>
              )}
              {qty > 0 && selectedFG && (
                <p className="text-xs text-muted-foreground mt-1">
                  Estimated parcel weight: <span className="font-semibold text-foreground">{estimatedWeightKg} kg</span>
                  {' '}({selectedFG.bottle_size_ml <= 250 ? '200ml: 6 kg/12-pack' : '700ml: 10 kg/6-pack'})
                </p>
              )}
            </div>

            {/* Customer */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Customer</Label>
                <Link to="/customers" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Users className="w-3 h-3" /> Manage customers
                </Link>
              </div>
              <Select
                value={form.customer_name}
                onValueChange={v => {
                  const c = customers.find(c => c.business_name === v);
                  const addr = c?.delivery_address || '';
                  setForm(f => ({ ...f, customer_name: v, customer_address: addr }));
                  if (addr) calculateDistance(addr);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select customer…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No customers yet</div>
                  )}
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.business_name}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.customer_address && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {form.customer_address}
                </p>
              )}
            </div>

            {/* Date */}
            <div>
              <Label>Dispatch Date</Label>
              <Input
                type="date"
                value={form.dispatch_date}
                onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))}
                className="mt-1"
              />
            </div>

            {/* Transport */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transport Method</Label>
                <Select value={form.transport_method} onValueChange={v => setForm(f => ({ ...f, transport_method: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="road">Road</SelectItem>
                    <SelectItem value="courier">Courier</SelectItem>
                    <SelectItem value="air">Air</SelectItem>
                    <SelectItem value="sea">Sea</SelectItem>
                    <SelectItem value="pickup">Pickup</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Distance (km)</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    min="0"
                    value={form.transport_distance_km}
                    onChange={e => setForm(f => ({ ...f, transport_distance_km: e.target.value }))}
                    placeholder={calcingDistance ? 'Calculating…' : '0'}
                    disabled={calcingDistance}
                  />
                  {calcingDistance && (
                    <div className="absolute right-2.5 top-2.5">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {form.customer_address && !calcingDistance && !form.transport_distance_km && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline mt-1"
                    onClick={() => calculateDistance(form.customer_address)}
                  >
                    Auto-calculate from address
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes"
                className="mt-1"
              />
            </div>

            <Button
              onClick={() => dispatchMutation.mutate()}
              disabled={dispatchMutation.isPending || !selectedFGId || !form.customer_name || !qty || overStock}
              className="w-full h-12 text-base font-semibold"
            >
              {dispatchMutation.isPending ? 'Saving…' : 'Record Dispatch & Deduct Stock'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dispatch Dialog */}
      <Dialog open={!!editingDispatch} onOpenChange={v => !v && setEditingDispatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Dispatch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Dispatch Date</Label>
              <Input
                type="date"
                value={editForm.dispatch_date || ''}
                onChange={e => setEditForm(f => ({ ...f, dispatch_date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                value={editForm.notes || ''}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending}
              className="w-full"
            >
              {editMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Stock Confirm */}
      <AlertDialog open={!!returningDispatch} onOpenChange={v => !v && setReturningDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>{returningDispatch?.quantity_bottles} bottles</strong> of{' '}
              <strong>{returningDispatch?.product_name}</strong> back to finished goods stock.
              The dispatch record will be kept and marked as returned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => returnMutation.mutate(returningDispatch)}
              disabled={returnMutation.isPending}
            >
              {returnMutation.isPending ? 'Returning…' : 'Return Stock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingDispatch} onOpenChange={v => !v && setDeletingDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dispatch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the dispatch to <strong>{deletingDispatch?.customer_name}</strong> and restore{' '}
              <strong>{deletingDispatch?.quantity_bottles} bottles</strong> of{' '}
              <strong>{deletingDispatch?.product_name}</strong> back to stock.
              <p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deletingDispatch)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete & Restore Stock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
