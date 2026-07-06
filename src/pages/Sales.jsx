import { useState, useMemo } from 'react';
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
import { Plus, Truck, PackageCheck, MapPin, Trash2, Search, Users, Map, Pencil, RotateCcw, Zap, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DeliveryMap from '@/components/sales/DeliveryMap';
import Pagination from '@/components/shared/Pagination';
import CustomerAutocomplete from '@/components/sales/CustomerAutocomplete.jsx';
import { base44 } from '@/api/base44Client';

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
  transport_distance_km: '',
  transport_method: 'road',
  status: 'dispatched',
  notes: '',
};

export default function Sales() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lineItems, setLineItems] = useState([]);
  const [newLineProductKey, setNewLineProductKey] = useState('');
  const [newLineQty, setNewLineQty] = useState('');
  const [deletingDispatch, setDeletingDispatch] = useState(null);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [returningDispatch, setReturningDispatch] = useState(null);
  const [search, setSearch] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editCalcingDistance, setEditCalcingDistance] = useState(false);

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('-created_at', 200),
  });

  const { data: allDispatches = [] } = useQuery({
    queryKey: ['dispatches-all'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 5000),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => db.Customer.list('business_name', 200),
  });

  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 100;

  const { data: dispatchPage = { data: [], count: 0 }, isLoading: loadingDispatches } = useQuery({
    queryKey: ['dispatches', currentPage],
    queryFn: () => db.Dispatch.listPage('-dispatch_date', PAGE_SIZE, currentPage * PAGE_SIZE),
  });
  const dispatches = dispatchPage.data ?? [];
  const totalDispatchCount = dispatchPage.count ?? 0;

  // Only sellable stock (not tasting bottles)
  const sellableGoods = useMemo(
    () => finishedGoods.filter(fg => !fg.product_name?.includes('Tasting')),
    [finishedGoods]
  );

  // Build unique product options (grouped by product_name + bottle_size_ml) with FIFO-sorted batches
  const productOptions = useMemo(() => {
    const map = {};
    for (const fg of sellableGoods) {
      const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
      if (!map[key]) {
        map[key] = { product_name: fg.product_name, bottle_size_ml: fg.bottle_size_ml || '', batches: [] };
      }
      map[key].batches.push(fg);
    }
    return Object.values(map).map(opt => {
      const batchesWithAvail = opt.batches.map(fg => {
        const dispatched = allDispatches
          .filter(d => d.product_name === fg.product_name && d.batch_number === fg.batch_number && Number(d.bottle_size_ml) === Number(fg.bottle_size_ml))
          .reduce((s, d) => s + (d.quantity_bottles || 0), 0);
        return { ...fg, available: Math.max(0, (fg.quantity_bottles || 0) - dispatched) };
      }).filter(b => b.available > 0);
      // FIFO: oldest batch first
      batchesWithAvail.sort((a, b) => new Date(a.created_at || a.created_date) - new Date(b.created_at || b.created_date));
      return { ...opt, batches: batchesWithAvail, totalAvailable: batchesWithAvail.reduce((s, b) => s + b.available, 0) };
    }).filter(opt => opt.totalAvailable > 0);
  }, [sellableGoods, allDispatches]);

  // For each product, compute how many bottles are already committed in other line items
  const committedByProduct = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      map[li.productKey] = (map[li.productKey] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems]);

  const getRemainingAvail = (productKey) => {
    const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === productKey);
    if (!product) return 0;
    return Math.max(0, product.totalAvailable - (committedByProduct[productKey] || 0));
  };

  const totalBottles = lineItems.reduce((s, li) => s + (parseInt(li.quantity) || 0), 0);
  const totalWeightKg = lineItems.reduce((s, li) => {
    const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
    return s + (product ? calcWeightKg(product.bottle_size_ml, parseInt(li.quantity) || 0) : 0);
  }, 0);
  const hasOverStock = lineItems.some(li => (parseInt(li.quantity) || 0) > getRemainingAvail(li.productKey));
  const canSubmit = lineItems.length > 0 && !hasOverStock && totalBottles > 0;

  const addLineItem = () => {
    if (!newLineProductKey || !newLineQty) return;
    const qty = parseInt(newLineQty) || 0;
    if (qty <= 0) return;
    setLineItems(prev => [...prev, { id: Date.now() + Math.random(), productKey: newLineProductKey, quantity: String(qty) }]);
    setNewLineProductKey('');
    setNewLineQty('');
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (id) => {
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setLineItems([]);
    setNewLineProductKey('');
    setNewLineQty('');
  };

  const calculateDistance = async (customerAddress) => {
    if (!customerAddress) return;
    setCalcingDistance(true);
    try {
      const { base44 } = await import('@/api/base44Client');
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
      const distanceKm = parseFloat(form.transport_distance_km) || 0;
      const transportMethod = form.transport_method;

      // Track remaining availability per batch across all line items
      const batchAvailMap = {};
      for (const opt of productOptions) {
        for (const b of opt.batches) {
          batchAvailMap[b.id] = b.available;
        }
      }

      const allAllocations = [];

      for (const li of lineItems) {
        const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
        if (!product) continue;
        let remaining = parseInt(li.quantity) || 0;

        for (const batch of product.batches) {
          if (remaining <= 0) break;
          const avail = batchAvailMap[batch.id] || 0;
          if (avail <= 0) continue;
          const take = Math.min(remaining, avail);
          const bottleSize = batch.bottle_size_ml || 700;
          const abv = batch.abv_percent || 0;
          const lals = ((take * bottleSize) / 1000) * abv / 100;
          const weightKg = calcWeightKg(bottleSize, take);
          const co2e = calcCO2e(distanceKm, weightKg, transportMethod);
          allAllocations.push({ batch, take, lals, weightKg, co2e });
          batchAvailMap[batch.id] = avail - take;
          remaining -= take;
        }

        if (remaining > 0) {
          throw new Error(`Insufficient stock for ${product.product_name} (${product.bottle_size_ml}ml)`);
        }
      }

      // Create one dispatch record per batch allocation and deduct stock (FIFO)
      for (const a of allAllocations) {
        const dispatchData = {
          ...form,
          product_name: a.batch.product_name,
          batch_number: a.batch.batch_number,
          bottle_size_ml: a.batch.bottle_size_ml || null,
          quantity_bottles: a.take,
          transport_distance_km: distanceKm,
          total_lals: parseFloat(a.lals.toFixed(4)),
          parcel_weight_kg: a.weightKg,
          co2e_kg: a.co2e,
          dispatched_from: 'Bluff Distillery',
          is_sample: 'FALSE',
        };
        await db.Dispatch.create(dispatchData);

        const newQty = (a.batch.quantity_bottles || 0) - a.take;
        const newLals = Math.max(0, (a.batch.total_lals || 0) - parseFloat(a.lals.toFixed(4)));
        if (newQty <= 0) {
          await db.FinishedGood.delete(a.batch.id);
        } else {
          await db.FinishedGood.update(a.batch.id, {
            quantity_bottles: newQty,
            total_lals: parseFloat(newLals.toFixed(4)),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setShowForm(false);
      resetForm();
      toast.success(`${lineItems.length} product(s) dispatched successfully (FIFO)`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to record dispatch');
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data) => {
      // Recalculate CO2e if distance/weight/method changed
      let co2e = data.co2e_kg || editingDispatch.co2e_kg || 0;
      const distance = data.transport_distance_km || editingDispatch.transport_distance_km || 0;
      const weight = data.parcel_weight_kg || editingDispatch.parcel_weight_kg || 0;
      const method = data.transport_method || editingDispatch.transport_method;

      if (distance && weight && method) {
        co2e = calcCO2e(distance, weight, method);
      }

      // Strip empty strings to avoid API errors
      const cleanData = Object.fromEntries(
        Object.entries({ ...data, co2e_kg: co2e }).filter(([, v]) => v !== '')
      );

      await db.Dispatch.update(editingDispatch.id, cleanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setEditingDispatch(null);
      toast.success('Dispatch updated');
    },
    onError: (err) => {
      console.error('Update failed:', err);
      toast.error('Failed to save changes');
    },
  });

  const calculateEditDistance = async (address) => {
    if (!address) return;
    setEditCalcingDistance(true);
    try {
      const res = await base44.functions.invoke('getDistanceMatrix', {
        origins: [DISTILLERY_ORIGIN],
        destinations: [address],
        mode: editForm.transport_method || 'road'
      });
      const km = Math.round(res.data?.rows?.[0]?.elements?.[0]?.distance?.value / 1000) || 0;
      setEditForm(f => ({ ...f, transport_distance_km: km }));
    } catch (err) {
      console.error('Distance calc failed:', err);
    } finally {
      setEditCalcingDistance(false);
    }
  };

  const returnMutation = useMutation({
    mutationFn: async (dispatch) => {
      // Restore stock - match by product_name + batch + bottle size
      const allFG = await db.FinishedGood.list('product_name', 1000);
      const fg = allFG.find(g =>
        g.product_name === dispatch.product_name &&
        g.batch_number === dispatch.batch_number &&
        Number(g.bottle_size_ml) === Number(dispatch.bottle_size_ml)
      );
      if (fg) {
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
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setReturningDispatch(null);
      toast.success('Stock returned');
    },
  });

  const handleSyncDispatches = async () => {
    setIsSyncing(true);
    try {
      const res = await base44.functions.invoke('syncDispatchesWithCustomerAddresses', {});
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setCurrentPage(0);
      toast.success(res.data.message);
      if (res.data.errors?.length > 0) {
        console.warn('Sync warnings:', res.data.errors);
      }
    } catch (err) {
      toast.error('Failed to sync dispatches');
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (dispatch) => {
      // Restore stock to the finished good - match by product_name + batch + bottle size
      const allFG = await db.FinishedGood.list('product_name', 1000);
      const fg = allFG.find(g =>
        g.product_name === dispatch.product_name &&
        g.batch_number === dispatch.batch_number &&
        Number(g.bottle_size_ml) === Number(dispatch.bottle_size_ml)
      );
      if (fg) {
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
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setDeletingDispatch(null);
      toast.success('Dispatch deleted and stock restored');
    },
  });

  const filtered = dispatches
    .filter(d => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        d.customer_name?.toLowerCase().includes(s) ||
        d.product_name?.toLowerCase().includes(s) ||
        d.batch_number?.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date));

  // Reset to first page when searching
  const handleSearch = (val) => {
    setSearch(val);
    setCurrentPage(0);
  };

  // Summary stats
  const totalBottlesDispatched = allDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
  const totalLalsDispatched = allDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);
  const totalKm = allDispatches.reduce((s, d) => s + (d.transport_distance_km || 0), 0);
  const totalCO2e = allDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const uniqueCustomers = new Set(allDispatches.map(d => d.customer_name)).size;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Sales & Dispatch" subtitle="Record stock movements and track customer deliveries">
        <Button variant="outline" onClick={() => setShowMap(v => !v)} className="gap-2">
          <Map className="w-4 h-4" />
          {showMap ? 'Hide Map' : 'Delivery Map'}
        </Button>
        <Button variant="outline" onClick={handleSyncDispatches} disabled={isSyncing} className="gap-2">
          <Zap className="w-4 h-4" />
          {isSyncing ? 'Syncing...' : 'Sync Distances'}
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
              onChange={e => handleSearch(e.target.value)}
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
                          onClick={() => { 
                            setEditingDispatch(d); 
                            setEditForm({ 
                              status: d.status, 
                              notes: d.notes || '', 
                              dispatch_date: d.dispatch_date,
                              product_name: d.product_name || '',
                              batch_number: d.batch_number || '',
                              quantity_bottles: d.quantity_bottles || '',
                              bottle_size_ml: d.bottle_size_ml || '',
                              total_lals: d.total_lals || '',
                              parcel_weight_kg: d.parcel_weight_kg || '',
                              transport_distance_km: d.transport_distance_km || '',
                              transport_method: d.transport_method || 'road',
                              customer_name: d.customer_name || '',
                              customer_address: d.customer_address || '',
                            });
                          }}
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
        <Pagination currentPage={currentPage} totalCount={totalDispatchCount} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </Card>

      {/* New Dispatch Dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Record Dispatch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Products</Label>
                {lineItems.length > 0 && (
                  <span className="text-xs text-muted-foreground">{totalBottles} bottles • {totalWeightKg} kg</span>
                )}
              </div>

              {/* Existing line items */}
              {lineItems.length > 0 && (
                <div className="space-y-2 mb-3">
                  {lineItems.map((li) => {
                    const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
                    const remaining = getRemainingAvail(li.productKey);
                    const liQty = parseInt(li.quantity) || 0;
                    const over = liQty > remaining;
                    return (
                      <div key={li.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product?.product_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{product?.bottle_size_ml}ml • {remaining} available</p>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          max={remaining}
                          value={li.quantity}
                          onChange={e => updateLineItem(li.id, 'quantity', e.target.value)}
                          className={`w-20 ${over ? 'border-destructive' : ''}`}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(li.id)}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add new line item */}
              {productOptions.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select value={newLineProductKey} onValueChange={setNewLineProductKey}>
                      <SelectTrigger><SelectValue placeholder="Add product…" /></SelectTrigger>
                      <SelectContent>
                        {productOptions.map(opt => (
                          <SelectItem key={`${opt.product_name}||${opt.bottle_size_ml}`} value={`${opt.product_name}||${opt.bottle_size_ml}`}>
                            {opt.product_name} ({opt.bottle_size_ml}ml) — {getRemainingAvail(`${opt.product_name}||${opt.bottle_size_ml}`)} btls
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={newLineQty}
                    onChange={e => setNewLineQty(e.target.value)}
                    className="w-20"
                    placeholder="Qty"
                  />
                  <Button variant="outline" size="icon" onClick={addLineItem} disabled={!newLineProductKey || !newLineQty}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {productOptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No stock available</p>
              )}
              {hasOverStock && (
                <p className="text-xs text-destructive mt-1">One or more items exceed available stock</p>
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
               <CustomerAutocomplete
                 customers={customers}
                 value={form.customer_name}
                 onSelect={v => {
                   setForm(f => ({ ...f, customer_name: v }));
                 }}
                 onAddressChange={addr => {
                   setForm(f => ({ ...f, customer_address: addr }));
                   if (addr) calculateDistance(addr);
                 }}
               />
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
              disabled={dispatchMutation.isPending || !canSubmit || !form.customer_name}
              className="w-full h-12 text-base font-semibold"
            >
              {dispatchMutation.isPending ? 'Saving…' : `Record Dispatch (${totalBottles} bottles, FIFO)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dispatch Dialog */}
      <Dialog open={!!editingDispatch} onOpenChange={v => !v && setEditingDispatch(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Dispatch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Product Details */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Product Name</Label>
                <Input
                  value={editForm.product_name || ''}
                  onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Batch Number</Label>
                <Input
                  value={editForm.batch_number || ''}
                  onChange={e => setEditForm(f => ({ ...f, batch_number: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Volumes & Quantities */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity (bottles)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editForm.quantity_bottles || ''}
                  onChange={e => {
                    const newQty = parseInt(e.target.value) || '';
                    const lalsPerBottle = editingDispatch.total_lals && editingDispatch.quantity_bottles 
                      ? editingDispatch.total_lals / editingDispatch.quantity_bottles 
                      : 0;
                    const newLals = newQty && lalsPerBottle ? parseFloat((newQty * lalsPerBottle).toFixed(3)) : '';
                    setEditForm(f => ({ ...f, quantity_bottles: newQty, total_lals: newLals }));
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Bottle Size (ml)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editForm.bottle_size_ml || ''}
                  onChange={e => setEditForm(f => ({ ...f, bottle_size_ml: parseInt(e.target.value) || '' }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total LALs</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editForm.total_lals || ''}
                  onChange={e => setEditForm(f => ({ ...f, total_lals: parseFloat(e.target.value) || '' }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Parcel Weight (kg)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editForm.parcel_weight_kg || ''}
                  onChange={e => setEditForm(f => ({ ...f, parcel_weight_kg: parseFloat(e.target.value) || '' }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Customer */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer Name</Label>
                <CustomerAutocomplete
                  customers={customers}
                  value={editForm.customer_name}
                  onSelect={v => {
                    setEditForm(f => ({ ...f, customer_name: v }));
                  }}
                  onAddressChange={addr => {
                    setEditForm(f => ({ ...f, customer_address: addr }));
                  }}
                />
              </div>
              <div>
                <Label>Delivery Address</Label>
                <Input
                  value={editForm.customer_address || ''}
                  onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Transport */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transport Method</Label>
                <Select value={editForm.transport_method || 'road'} onValueChange={v => setEditForm(f => ({ ...f, transport_method: v }))}>
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
                    value={editForm.transport_distance_km || ''}
                    onChange={e => setEditForm(f => ({ ...f, transport_distance_km: parseInt(e.target.value) || '' }))}
                    disabled={editCalcingDistance}
                  />
                  {editCalcingDistance && (
                    <div className="absolute right-2.5 top-2.5">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {editForm.customer_address && !editCalcingDistance && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline mt-1"
                    onClick={() => calculateEditDistance(editForm.customer_address)}
                  >
                    Auto-calculate from address
                  </button>
                )}
              </div>
            </div>

            {/* Date & Status */}
            <div className="grid grid-cols-2 gap-3">
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
                <Select value={editForm.status || 'dispatched'} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              onClick={() => editMutation.mutate(editForm)}
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