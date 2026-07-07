import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, PackageCheck, MapPin, Trash2, Search, Map, Pencil, RotateCcw, ArrowRightLeft, Plus, Store } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/shared/Pagination';
import DispatchForm from '@/components/dispatch/DispatchForm.jsx';
import DirectSalesForm from '@/components/dispatch/DirectSalesForm.jsx';
import StockSummary from '@/components/dispatch/StockSummary.jsx';
import TransferTo3PLDialog from '@/components/dispatch/TransferTo3PLDialog.jsx';
import DeliveryMap from '@/components/sales/DeliveryMap';

const DISTILLERY_ORIGIN = '250 Ocean Beach Road, Bluff, New Zealand';
const WAREHOUSE_ADDRESS = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';
const CHANNEL_LABELS = { wholesale: 'Wholesale', cellar_door: 'Cellar Door', shopify: 'Shopify', airpoints: 'Airpoints', website: 'Website', other: 'Other' };

const calcCO2e = (distanceKm, weightKg, method) => {
  if (!distanceKm || !weightKg || !method) return 0;
  const factors = { road: 0.12, courier: 0.12, air: 0.9, sea: 0.01, pickup: 0 };
  return parseFloat(((distanceKm * weightKg / 1000) * (factors[method] || 0)).toFixed(3));
};

export default function DispatchHub() {
  const [showForm, setShowForm] = useState(false);
  const [showDirectSalesForm, setShowDirectSalesForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [showMap, setShowMap] = useState(false);
  const [showTransfer3PL, setShowTransfer3PL] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

  const [editingDispatch, setEditingDispatch] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editCalcingDistance, setEditCalcingDistance] = useState(false);
  const [returningDispatch, setReturningDispatch] = useState(null);
  const [deletingDispatch, setDeletingDispatch] = useState(null);

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => db.FinishedGood.list('-created_at', 200) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => db.WarehouseStock.list('-date_transferred_in', 200) });
  const { data: allDispatches = [] } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 2000) });
  const { data: dispatchPage = { data: [], count: 0 } } = useQuery({ queryKey: ['dispatches', currentPage], queryFn: () => db.Dispatch.listPage('-dispatch_date', PAGE_SIZE, currentPage * PAGE_SIZE) });
  const dispatches = dispatchPage.data ?? [];
  const totalDispatchCount = dispatchPage.count ?? 0;

  const totalBottlesDispatched = allDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
  const totalLalsDispatched = allDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);
  const totalCO2e = allDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const bluffBottles = finishedGoods.reduce((s, fg) => s + (fg.quantity_bottles || 0), 0);
  const warehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);

  const filtered = dispatches
    .filter(d => { if (!search) return true; const s = search.toLowerCase(); return d.customer_name?.toLowerCase().includes(s) || d.product_name?.toLowerCase().includes(s) || d.batch_number?.toLowerCase().includes(s); })
    .filter(d => filterSource === 'all' || (d.dispatched_from || 'Bluff') === filterSource)
    .filter(d => filterStatus === 'all' || d.status === filterStatus)
    .filter(d => {
      if (filterChannel === 'all') return true;
      if (filterChannel === 'wholesale') return !d.sales_channel || d.sales_channel === 'wholesale';
      return d.sales_channel === filterChannel;
    })
    .sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date));

  const handleSearch = (val) => { setSearch(val); setCurrentPage(0); };

  const editMutation = useMutation({
    mutationFn: async (data) => {
      let co2e = data.co2e_kg || editingDispatch.co2e_kg || 0;
      const distance = data.transport_distance_km || editingDispatch.transport_distance_km || 0;
      const weight = data.parcel_weight_kg || editingDispatch.parcel_weight_kg || 0;
      const method = data.transport_method || editingDispatch.transport_method;
      if (distance && weight && method) co2e = calcCO2e(distance, weight, method);
      const cleanData = Object.fromEntries(Object.entries({ ...data, co2e_kg: co2e }).filter(([, v]) => v !== ''));
      await db.Dispatch.update(editingDispatch.id, cleanData);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dispatches'] }); queryClient.invalidateQueries({ queryKey: ['dispatches-all'] }); setEditingDispatch(null); toast.success('Dispatch updated'); },
    onError: () => toast.error('Failed to save changes'),
  });

  const calculateEditDistance = async (address) => {
    if (!address) return;
    setEditCalcingDistance(true);
    try {
      const origin = editForm.dispatched_from === 'Auckland 3PL' ? WAREHOUSE_ADDRESS : DISTILLERY_ORIGIN;
      const res = await base44.functions.invoke('getDistanceMatrix', { origin, destination: address });
      if (res.data?.distance_km) setEditForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
    } catch { toast.error('Could not calculate distance'); } finally { setEditCalcingDistance(false); }
  };

  const restoreStock = async (dispatch) => {
    const is3PL = (dispatch.dispatched_from || '').includes('Auckland');
    if (is3PL) {
      const existing = await db.WarehouseStock.filter({ product_name: dispatch.product_name, batch_number: dispatch.batch_number });
      if (existing.length > 0) {
        const ws = existing[0];
        await db.WarehouseStock.update(ws.id, { quantity_bottles: (ws.quantity_bottles || 0) + (dispatch.quantity_bottles || 0), total_lals: parseFloat(((ws.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)) });
      } else {
        await db.WarehouseStock.create({ product_name: dispatch.product_name, batch_number: dispatch.batch_number, bottle_size_ml: dispatch.bottle_size_ml, quantity_bottles: dispatch.quantity_bottles, total_lals: dispatch.total_lals });
      }
    } else {
      const allFG = await db.FinishedGood.list('product_name', 1000);
      const fg = allFG.find(g => g.product_name === dispatch.product_name && g.batch_number === dispatch.batch_number && Number(g.bottle_size_ml) === Number(dispatch.bottle_size_ml));
      if (fg) {
        await db.FinishedGood.update(fg.id, { quantity_bottles: (fg.quantity_bottles || 0) + (dispatch.quantity_bottles || 0), total_lals: parseFloat(((fg.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)) });
      } else {
        await db.FinishedGood.create({ product_name: dispatch.product_name, batch_number: dispatch.batch_number, bottle_size_ml: dispatch.bottle_size_ml, quantity_bottles: dispatch.quantity_bottles, total_lals: dispatch.total_lals });
      }
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
    queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
    queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
  };

  const returnMutation = useMutation({
    mutationFn: async (dispatch) => {
      await restoreStock(dispatch);
      await db.Dispatch.update(dispatch.id, { status: 'pending', notes: (dispatch.notes ? dispatch.notes + ' [RETURNED]' : '[RETURNED]') });
    },
    onSuccess: () => { invalidateAll(); setReturningDispatch(null); toast.success('Stock returned'); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (dispatch) => { await restoreStock(dispatch); await db.Dispatch.delete(dispatch.id); },
    onSuccess: () => { invalidateAll(); setDeletingDispatch(null); toast.success('Dispatch deleted and stock restored'); },
  });

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Sales & Dispatch" subtitle="Record dispatches, track stock by location, and manage deliveries">
        <Button variant="outline" onClick={() => setShowMap(v => !v)} className="gap-2 hidden md:inline-flex"><Map className="w-4 h-4" />{showMap ? 'Hide Map' : 'Delivery Map'}</Button>
        <Button onClick={() => setShowTransfer3PL(true)} className="gap-2"><ArrowRightLeft className="w-4 h-4" />Transfer to 3PL</Button>
        <Button variant="outline" onClick={() => setShowForm(true)} className="gap-2"><Truck className="w-4 h-4" />Wholesale</Button>
        <Button onClick={() => setShowDirectSalesForm(true)} className="gap-2"><Store className="w-4 h-4" />Direct Sale</Button>
      </PageHeader>

      {showMap && <div className="mb-6"><DeliveryMap dispatches={dispatches} customers={customers} distilleryOrigin={DISTILLERY_ORIGIN} /></div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total Dispatched', value: totalBottlesDispatched.toLocaleString(), sub: 'bottles', icon: PackageCheck, color: 'text-primary', bg: 'bg-accent border-accent-foreground/10' },
          { label: 'Total LALs Sold', value: totalLalsDispatched.toFixed(2), sub: 'litres abs. alcohol', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Total CO2e', value: totalCO2e.toFixed(1), sub: 'kg emissions', icon: Truck, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { label: 'Bluff Stock', value: bluffBottles.toLocaleString(), sub: 'bottles at distillery', icon: PackageCheck, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
          { label: '3PL Stock', value: warehouseBottles.toLocaleString(), sub: 'bottles at Auckland', icon: PackageCheck, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
            <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs font-medium text-muted-foreground">{label}</span></div>
            <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6"><StockSummary finishedGoods={finishedGoods} warehouseStock={warehouseStock} /></div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-lg font-semibold">Dispatch History</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search customer, product, batch…" value={search} onChange={e => handleSearch(e.target.value)} className="pl-8 text-sm" />
            </div>
            <Select value={filterSource} onValueChange={v => { setFilterSource(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Sources</SelectItem><SelectItem value="Bluff">Bluff Distillery</SelectItem><SelectItem value="Auckland 3PL">Auckland 3PL</SelectItem></SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={v => { setFilterChannel(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="wholesale">Wholesale</SelectItem><SelectItem value="cellar_door">Cellar Door</SelectItem><SelectItem value="shopify">Shopify</SelectItem><SelectItem value="airpoints">Airpoints</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(0); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="dispatched">Dispatched</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Customer</TableHead><TableHead>Product</TableHead>
                <TableHead>Batch</TableHead><TableHead>Bottles</TableHead><TableHead>LALs</TableHead><TableHead>Distance</TableHead>
                <TableHead>Method</TableHead><TableHead>CO2e</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">No dispatches found</TableCell></TableRow>
              ) : filtered.map((d, i) => (
                <TableRow key={d.id || i}>
                  <TableCell>{(() => { try { const dt = new Date(d.dispatch_date?.replace(/-/g, '/')); return isNaN(dt) ? d.dispatch_date || '—' : format(dt, 'dd MMM yyyy'); } catch { return d.dispatch_date || '—'; } })()}</TableCell>
                  <TableCell><Badge variant={d.dispatched_from === 'Auckland 3PL' ? 'secondary' : 'outline'} className="text-xs">{d.dispatched_from || 'Bluff'}</Badge></TableCell>
                  <TableCell className="font-semibold">
                    {d.sales_channel && d.sales_channel !== 'wholesale' ? (
                      <Badge variant="secondary" className="text-xs">{CHANNEL_LABELS[d.sales_channel] || d.sales_channel}</Badge>
                    ) : d.customer_name}
                  </TableCell>
                  <TableCell>{d.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.batch_number}</TableCell>
                  <TableCell className="font-semibold">{d.quantity_bottles}</TableCell>
                  <TableCell>{typeof d.total_lals === 'number' ? d.total_lals.toFixed(3) : d.total_lals || '—'}</TableCell>
                  <TableCell>{d.transport_distance_km ? `${d.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell className="capitalize">{d.transport_method || '—'}</TableCell>
                  <TableCell className="font-semibold text-green-600">{d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(2)} kg` : '—'}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell>
                    {d.id && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => {
                          setEditingDispatch(d);
                          setEditForm({
                            status: d.status, notes: d.notes || '', dispatch_date: d.dispatch_date, product_name: d.product_name || '',
                            batch_number: d.batch_number || '', quantity_bottles: d.quantity_bottles || '', bottle_size_ml: d.bottle_size_ml || '',
                            total_lals: d.total_lals || '', parcel_weight_kg: d.parcel_weight_kg || '', transport_distance_km: d.transport_distance_km || '',
                            transport_method: d.transport_method || 'road', customer_name: d.customer_name || '', customer_address: d.customer_address || '',
                            dispatched_from: d.dispatched_from || 'Bluff',
                          });
                        }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" title="Return stock" onClick={() => setReturningDispatch(d)}><RotateCcw className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeletingDispatch(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {filtered.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">No dispatches found</p>
          ) : filtered.map((d, i) => (
            <MobileCard
              key={d.id || i}
              title={d.sales_channel && d.sales_channel !== 'wholesale' ? (CHANNEL_LABELS[d.sales_channel] || d.sales_channel) : (d.customer_name || '—')}
              subtitle={`${d.product_name} • ${(() => { try { const dt = new Date(d.dispatch_date?.replace(/-/g, '/')); return isNaN(dt) ? d.dispatch_date || '—' : format(dt, 'dd MMM yyyy'); } catch { return d.dispatch_date || '—'; } })()}`}
              badge={
                <>
                  <Badge variant={d.dispatched_from === 'Auckland 3PL' ? 'secondary' : 'outline'} className="text-xs">{d.dispatched_from || 'Bluff'}</Badge>
                  <StatusBadge status={d.status} />
                </>
              }
              accent={<span className="text-lg font-bold text-primary">{d.quantity_bottles}</span>}
              actions={
                <>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => {
                    setEditingDispatch(d);
                    setEditForm({
                      status: d.status, notes: d.notes || '', dispatch_date: d.dispatch_date, product_name: d.product_name || '',
                      batch_number: d.batch_number || '', quantity_bottles: d.quantity_bottles || '', bottle_size_ml: d.bottle_size_ml || '',
                      total_lals: d.total_lals || '', parcel_weight_kg: d.parcel_weight_kg || '', transport_distance_km: d.transport_distance_km || '',
                      transport_method: d.transport_method || 'road', customer_name: d.customer_name || '', customer_address: d.customer_address || '',
                      dispatched_from: d.dispatched_from || 'Bluff',
                    });
                  }}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-amber-600" onClick={() => setReturningDispatch(d)}><RotateCcw className="w-3.5 h-3.5" /> Return</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeletingDispatch(d)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Product" value={d.product_name} />
              <MobileDetailRow label="Batch" value={d.batch_number} />
              <MobileDetailRow label="Bottles" value={d.quantity_bottles} highlight />
              <MobileDetailRow label="LALs" value={typeof d.total_lals === 'number' ? d.total_lals.toFixed(3) : d.total_lals} />
              <MobileDetailRow label="Distance" value={d.transport_distance_km ? `${d.transport_distance_km} km` : '—'} />
              <MobileDetailRow label="Method" value={d.transport_method || '—'} />
              <MobileDetailRow label="CO2e" value={d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(2)} kg` : '—'} highlight />
            </MobileCard>
          ))}
        </MobileCardGrid>
        <Pagination currentPage={currentPage} totalCount={totalDispatchCount} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </Card>

      <DispatchForm open={showForm} onClose={() => setShowForm(false)} finishedGoods={finishedGoods} warehouseStock={warehouseStock} customers={customers} allDispatches={allDispatches} />
      <DirectSalesForm open={showDirectSalesForm} onClose={() => setShowDirectSalesForm(false)} finishedGoods={finishedGoods} allDispatches={allDispatches} />
      <TransferTo3PLDialog open={showTransfer3PL} onClose={() => setShowTransfer3PL(false)} finishedGoods={finishedGoods} allDispatches={allDispatches} />

      <Dialog open={!!editingDispatch} onOpenChange={v => !v && setEditingDispatch(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Edit Dispatch</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Product Name</Label><Input value={editForm.product_name || ''} onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Batch Number</Label><Input value={editForm.batch_number || ''} onChange={e => setEditForm(f => ({ ...f, batch_number: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity (bottles)</Label><Input type="number" min="0" value={editForm.quantity_bottles || ''} onChange={e => {
                const newQty = parseInt(e.target.value) || '';
                const lalsPerBottle = editingDispatch?.total_lals && editingDispatch?.quantity_bottles ? editingDispatch.total_lals / editingDispatch.quantity_bottles : 0;
                const newLals = newQty && lalsPerBottle ? parseFloat((newQty * lalsPerBottle).toFixed(3)) : '';
                setEditForm(f => ({ ...f, quantity_bottles: newQty, total_lals: newLals }));
              }} className="mt-1" /></div>
              <div><Label>Bottle Size (ml)</Label><Input type="number" min="0" value={editForm.bottle_size_ml || ''} onChange={e => setEditForm(f => ({ ...f, bottle_size_ml: parseInt(e.target.value) || '' }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total LALs</Label><Input type="number" min="0" step="0.001" value={editForm.total_lals || ''} onChange={e => setEditForm(f => ({ ...f, total_lals: parseFloat(e.target.value) || '' }))} className="mt-1" /></div>
              <div><Label>Parcel Weight (kg)</Label><Input type="number" min="0" step="0.1" value={editForm.parcel_weight_kg || ''} onChange={e => setEditForm(f => ({ ...f, parcel_weight_kg: parseFloat(e.target.value) || '' }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Customer Name</Label><Input value={editForm.customer_name || ''} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Delivery Address</Label><Input value={editForm.customer_address || ''} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Transport Method</Label><Select value={editForm.transport_method || 'road'} onValueChange={v => setEditForm(f => ({ ...f, transport_method: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="road">Road</SelectItem><SelectItem value="courier">Courier</SelectItem><SelectItem value="air">Air</SelectItem><SelectItem value="sea">Sea</SelectItem><SelectItem value="pickup">Pickup</SelectItem></SelectContent>
              </Select></div>
              <div><Label>Distance (km)</Label>
                <div className="relative mt-1">
                  <Input type="number" min="0" value={editForm.transport_distance_km || ''} onChange={e => setEditForm(f => ({ ...f, transport_distance_km: parseInt(e.target.value) || '' }))} disabled={editCalcingDistance} />
                  {editCalcingDistance && <div className="absolute right-2.5 top-2.5"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {editForm.customer_address && !editCalcingDistance && <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => calculateEditDistance(editForm.customer_address)}>Auto-calculate from address</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dispatch Date</Label><Input type="date" value={editForm.dispatch_date || ''} onChange={e => setEditForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" /></div>
              <div><Label>Status</Label><Select value={editForm.status || 'dispatched'} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="dispatched">Dispatched</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent>
              </Select></div>
            </div>
            <div><Label>Notes</Label><Input value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
            <Button onClick={() => editMutation.mutate(editForm)} disabled={editMutation.isPending} className="w-full">{editMutation.isPending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!returningDispatch} onOpenChange={v => !v && setReturningDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>{returningDispatch?.quantity_bottles} bottles</strong> of <strong>{returningDispatch?.product_name}</strong> back to {(returningDispatch?.dispatched_from || '').includes('Auckland') ? '3PL warehouse' : 'distillery'} stock. The dispatch record will be kept and marked as returned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={() => returnMutation.mutate(returningDispatch)} disabled={returnMutation.isPending}>{returnMutation.isPending ? 'Returning…' : 'Return Stock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingDispatch} onOpenChange={v => !v && setDeletingDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dispatch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the dispatch to <strong>{deletingDispatch?.customer_name}</strong> and restore <strong>{deletingDispatch?.quantity_bottles} bottles</strong> of <strong>{deletingDispatch?.product_name}</strong> back to stock.
              <p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deletingDispatch)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting…' : 'Delete & Restore Stock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}