import { useState, useMemo } from 'react';
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
import { ArrowRightLeft, Truck, PackageCheck, Trash2, MapPin, Users, Search, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import CustomerAutocomplete from '@/components/sales/CustomerAutocomplete.jsx';

const WAREHOUSE_ADDRESS = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';
const DISTILLERY_ADDRESS = '250 Ocean Beach Road, Bluff, New Zealand';
const BLUFF_TO_AUCKLAND_KM = 159; // Approximate distance

// Weight calculation (consistent with Sales)
const calcWeightKg = (bottleSizeMl, numBottles) => {
  if (!numBottles) return 0;
  const kgPerBottle = bottleSizeMl <= 250 ? (6 / 12) : (10 / 6);
  return parseFloat((kgPerBottle * numBottles).toFixed(2));
};

// CO2e calculation for road transport to Auckland 3PL
const calcCO2eTransfer = (bottleSizeMl, numBottles) => {
  const weightKg = calcWeightKg(bottleSizeMl, numBottles);
  // Road transport: 0.12 kg CO2e per km per 1000kg
  const co2e = (BLUFF_TO_AUCKLAND_KM * weightKg / 1000) * 0.12;
  return parseFloat(co2e.toFixed(3));
};

const EMPTY_TRANSFER = { quantity_bottles: '', date_transferred_in: new Date().toISOString().split('T')[0], notes: '' };
const EMPTY_DISPATCH = {
  dispatch_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  customer_address: '',
  transport_method: 'road',
  transport_distance_km: '',
  status: 'dispatched',
  notes: '',
};

export default function Warehouse() {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [selectedFGId, setSelectedFGId] = useState('');

  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchForm, setDispatchForm] = useState(EMPTY_DISPATCH);
  const [lineItems, setLineItems] = useState([]);
  const [newLineWSId, setNewLineWSId] = useState('');
  const [newLineQty, setNewLineQty] = useState('');

  const [deletingWS, setDeletingWS] = useState(null);
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dispatchPage, setDispatchPage] = useState(1);
  const DISPATCH_PAGE_SIZE = 25;

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('-created_at', 200),
  });

  const { data: warehouseStock = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => db.WarehouseStock.list('-date_transferred_in', 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => db.Customer.list('business_name', 2000),
  });

  const { data: allDispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 2000),
  });

  // 3PL dispatches: records with [Auckland 3PL] in notes, or dispatched_from set to Auckland 3PL
  // Also includes Bluff dispatches (dispatched_from = 'Bluff' or notes contains [Bluff Dispatch])
  const warehouseDispatches = allDispatches.filter(d =>
    (d.notes || '').includes('[Auckland 3PL]') ||
    (d.dispatched_from || '').toLowerCase().includes('auckland') ||
    (d.dispatched_from || '') === 'Auckland 3PL' ||
    (d.notes || '').includes('[Bluff Dispatch]') ||
    (d.dispatched_from || '').toLowerCase().includes('bluff')
  );

  // Total bottles dispatched from ALL 3PL/Bluff records (unfiltered)
  const totalBottlesDispatched = warehouseDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);

  const sellableGoods = finishedGoods.filter(fg => !fg.product_name?.includes('Tasting'));
  const selectedFG = finishedGoods.find(fg => fg.id === selectedFGId);

  const transferQty = parseInt(transferForm.quantity_bottles) || 0;
  const overTransfer = transferQty > (selectedFG?.quantity_bottles || 0);

  // Multi-product dispatch helpers
  const committedByWS = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      map[li.wsId] = (map[li.wsId] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems]);

  const getRemainingAvail = (wsId) => {
    const ws = warehouseStock.find(w => w.id === wsId);
    if (!ws) return 0;
    return Math.max(0, (ws.quantity_bottles || 0) - (committedByWS[wsId] || 0));
  };

  const dispatchTotalBottles = lineItems.reduce((s, li) => s + (parseInt(li.quantity) || 0), 0);
  const hasOverStock = lineItems.some(li => (parseInt(li.quantity) || 0) > getRemainingAvail(li.wsId));

  const addLineItem = () => {
    if (!newLineWSId || !newLineQty) return;
    const qty = parseInt(newLineQty) || 0;
    if (qty <= 0) return;
    setLineItems(prev => [...prev, { id: Date.now() + Math.random(), wsId: newLineWSId, quantity: String(qty) }]);
    setNewLineWSId('');
    setNewLineQty('');
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (id) => {
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  // Transfer-in: move from FinishedGood → WarehouseStock
  const transferMutation = useMutation({
    mutationFn: async () => {
      const fg = selectedFG;
      const lals = ((transferQty * (fg.bottle_size_ml || 700)) / 1000) * (fg.abv_percent || 0) / 100;

      // Create or update WarehouseStock record for this product+batch
      const existing = await db.WarehouseStock.filter({
        product_name: fg.product_name,
        batch_number: fg.batch_number,
      });

      // Calculate CO2e for transport to 3PL
      const co2e = calcCO2eTransfer(fg.bottle_size_ml, transferQty);

      if (existing.length > 0) {
        const ws = existing[0];
        await db.WarehouseStock.update(ws.id, {
          quantity_bottles: ws.quantity_bottles + transferQty,
          total_lals: parseFloat(((ws.total_lals || 0) + lals).toFixed(4)),
        });
      } else {
        await db.WarehouseStock.create({
          product_name: fg.product_name,
          batch_number: fg.batch_number,
          bottle_size_ml: fg.bottle_size_ml,
          abv_percent: fg.abv_percent,
          quantity_bottles: transferQty,
          total_lals: parseFloat(lals.toFixed(4)),
          date_transferred_in: transferForm.date_transferred_in,
          notes: transferForm.notes,
          co2e_kg: co2e,
        });
      }

      // Also create a TankMovement record for tracking
      await db.TankMovement.create({
        date: transferForm.date_transferred_in,
        action: 'transfer_out',
        tank_name: 'Distillery Stock',
        counterpart_tank: 'Auckland 3PL',
        volume_litres: (transferQty * (fg.bottle_size_ml || 700)) / 1000,
        abv: fg.abv_percent,
        lals: parseFloat(lals.toFixed(4)),
        product: fg.product_name,
        batch_number: fg.batch_number,
        co2e_kg: co2e,
        notes: `[3PL TRANSFER] ${transferForm.notes}`.trim(),
      });

      // Deduct from FinishedGood
      const newQty = fg.quantity_bottles - transferQty;
      if (newQty <= 0) {
        await db.FinishedGood.delete(fg.id);
      } else {
        const newLals = Math.max(0, (fg.total_lals || 0) - lals);
        await db.FinishedGood.update(fg.id, {
          quantity_bottles: newQty,
          total_lals: parseFloat(newLals.toFixed(4)),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setShowTransfer(false);
      setTransferForm(EMPTY_TRANSFER);
      setSelectedFGId('');
      toast.success('Stock transferred to 3PL Warehouse');
    },
  });

  // Dispatch from warehouse to customer (multi-product)
  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const distance = parseFloat(dispatchForm.transport_distance_km) || 0;
      const method = dispatchForm.transport_method || 'courier';

      for (const li of lineItems) {
        const ws = warehouseStock.find(w => w.id === li.wsId);
        if (!ws) continue;
        const qty = parseInt(li.quantity) || 0;
        const lals = ((qty * (ws.bottle_size_ml || 700)) / 1000) * (ws.abv_percent || 0) / 100;
        const weight = calcWeightKg(ws.bottle_size_ml, qty);

        let co2e = 0;
        if (method === 'road' && distance > 0) {
          co2e = (distance * weight / 1000) * 0.12;
        } else if (method === 'courier' && distance > 0) {
          co2e = (distance * weight / 1000) * 0.15;
        } else if (method === 'air' && distance > 0) {
          co2e = (distance * weight / 1000) * 0.55;
        } else if (method === 'sea' && distance > 0) {
          co2e = (distance * weight / 1000) * 0.008;
        }

        await db.Dispatch.create({
          dispatch_date: dispatchForm.dispatch_date,
          customer_name: dispatchForm.customer_name,
          customer_address: dispatchForm.customer_address,
          product_name: ws.product_name,
          batch_number: ws.batch_number,
          bottle_size_ml: ws.bottle_size_ml,
          quantity_bottles: qty,
          total_lals: parseFloat(lals.toFixed(4)),
          parcel_weight_kg: weight,
          transport_distance_km: distance || undefined,
          transport_method: method,
          co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined,
          status: dispatchForm.status || 'dispatched',
          notes: dispatchForm.notes || undefined,
          dispatched_from: 'Auckland 3PL',
        });

        const newQty = ws.quantity_bottles - qty;
        if (newQty <= 0) {
          await db.WarehouseStock.delete(ws.id);
        } else {
          const newLals = Math.max(0, (ws.total_lals || 0) - lals);
          await db.WarehouseStock.update(ws.id, {
            quantity_bottles: newQty,
            total_lals: parseFloat(newLals.toFixed(4)),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['warehouseDispatches'] });
      setShowDispatch(false);
      setDispatchForm(EMPTY_DISPATCH);
      setLineItems([]);
      setNewLineWSId('');
      setNewLineQty('');
      toast.success(`${lineItems.length} product(s) dispatched successfully`);
    },
  });

  const calculateDistance = async (customerAddress) => {
    if (!customerAddress) return;
    setCalcingDistance(true);
    const { base44 } = await import('@/api/base44Client');
    const res = await base44.functions.invoke('getDistanceMatrix', {
      origin: WAREHOUSE_ADDRESS,
      destination: customerAddress,
    });
    // Only update if dialog is still open (showDispatch may have changed)
    setCalcingDistance(false);
    if (res.data?.distance_km) {
      setDispatchForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
      toast.success(`Distance: ${res.data.distance_km} km (${res.data.duration_text})`);
    }
  };

  const deleteWSMutation = useMutation({
    mutationFn: async (ws) => {
      // Restore back to FinishedGoods
      const existing = await db.FinishedGood.filter({
        product_name: ws.product_name,
        batch_number: ws.batch_number,
      });
      if (existing.length > 0) {
        const fg = existing[0];
        await db.FinishedGood.update(fg.id, {
          quantity_bottles: (fg.quantity_bottles || 0) + ws.quantity_bottles,
          total_lals: parseFloat(((fg.total_lals || 0) + (ws.total_lals || 0)).toFixed(4)),
        });
      } else {
        await db.FinishedGood.create({
          product_name: ws.product_name,
          batch_number: ws.batch_number,
          bottle_size_ml: ws.bottle_size_ml,
          abv_percent: ws.abv_percent,
          quantity_bottles: ws.quantity_bottles,
          total_lals: ws.total_lals,
        });
      }
      await db.WarehouseStock.delete(ws.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setDeletingWS(null);
      toast.success('Stock returned to distillery inventory');
    },
  });

  const totalBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalLals = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="3PL Warehouse — Māngere" subtitle="Track stock held at and dispatched from 27 Pavillion Drive, Māngere">
        <Button variant="outline" onClick={() => setShowTransfer(true)} className="gap-2">
          <ArrowRightLeft className="w-4 h-4" />
          Transfer Stock In
        </Button>
        <Button onClick={() => setShowDispatch(true)} disabled={warehouseStock.length === 0} className="gap-2">
          <Truck className="w-4 h-4" />
          Dispatch from Warehouse
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-accent border-accent-foreground/10">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Bottles in Warehouse</span>
          </div>
          <p className="text-2xl font-bold font-display text-primary">{totalBottles.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-muted-foreground">Total LALs Held</span>
          </div>
          <p className="text-2xl font-bold font-display text-blue-600">{totalLals.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-muted-foreground">Bottles Dispatched from 3PL</span>
          </div>
          <p className="text-2xl font-bold font-display text-green-600">{totalBottlesDispatched.toLocaleString()}</p>
        </div>
      </div>

      {/* Current Warehouse Stock */}
      <Card className="p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Current Warehouse Stock</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Bottles</TableHead>
              <TableHead>LALs</TableHead>
              <TableHead>Transferred In</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouseStock.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No stock at warehouse — transfer some in to get started
                </TableCell>
              </TableRow>
            ) : warehouseStock.map(ws => (
              <TableRow key={ws.id}>
                <TableCell className="font-semibold">{ws.product_name}</TableCell>
                <TableCell className="font-mono text-xs">{ws.batch_number}</TableCell>
                <TableCell>{ws.bottle_size_ml ? `${ws.bottle_size_ml}ml` : '—'}</TableCell>
                <TableCell className="font-semibold">{ws.quantity_bottles}</TableCell>
                <TableCell>{ws.total_lals?.toFixed(3) || '—'}</TableCell>
                <TableCell>{ws.date_transferred_in ? format(new Date(ws.date_transferred_in), 'dd MMM yyyy') : '—'}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeletingWS(ws)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Warehouse Dispatch History */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Dispatch History from Warehouse</h2>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search customer, product, batch…" value={search} onChange={e => { setSearch(e.target.value); setDispatchPage(1); }} className="pl-8 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setDispatchPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
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
                <TableHead>Method</TableHead>
                <TableHead>CO2e</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouseDispatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No warehouse dispatches recorded yet
                  </TableCell>
                </TableRow>
              ) : (() => {
                const filtered = warehouseDispatches
                  .filter(d => {
                    const s = search.toLowerCase();
                    const matchSearch = !s || d.customer_name?.toLowerCase().includes(s) || d.product_name?.toLowerCase().includes(s) || d.batch_number?.toLowerCase().includes(s);
                    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
                    return matchSearch && matchStatus;
                  })
                  .sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date));
                const totalPages = Math.ceil(filtered.length / DISPATCH_PAGE_SIZE);
                const paginated = filtered.slice((dispatchPage - 1) * DISPATCH_PAGE_SIZE, dispatchPage * DISPATCH_PAGE_SIZE);
                return (
                  <>
                    {paginated.map((d, i) => (
                      <TableRow key={d.id || i}>
                        <TableCell>{d.dispatch_date ? format(new Date(d.dispatch_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell className="font-semibold">{d.customer_name}</TableCell>
                        <TableCell>{d.product_name}</TableCell>
                        <TableCell className="font-mono text-xs">{d.batch_number}</TableCell>
                        <TableCell className="font-semibold">{d.quantity_bottles}</TableCell>
                        <TableCell className="capitalize">{d.transport_method || '—'}</TableCell>
                        <TableCell className="font-semibold text-green-600">{d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(3)} kg` : '—'}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                      </TableRow>
                    ))}
                    {totalPages > 1 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-3">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>{filtered.length} records — page {dispatchPage} of {totalPages}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDispatchPage(p => Math.max(1, p - 1))} disabled={dispatchPage === 1}>
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDispatchPage(p => Math.min(totalPages, p + 1))} disabled={dispatchPage === totalPages}>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Transfer Stock In Dialog */}
      <Dialog open={showTransfer} onOpenChange={v => { setShowTransfer(v); if (!v) { setTransferForm(EMPTY_TRANSFER); setSelectedFGId(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Transfer Stock to Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Product (from distillery stock)</Label>
              <Select value={selectedFGId} onValueChange={setSelectedFGId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select finished good…" />
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

            {selectedFG && (
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Available</p><p className="font-semibold">{selectedFG.quantity_bottles} btls</p></div>
                <div><p className="text-xs text-muted-foreground">Size</p><p className="font-semibold">{selectedFG.bottle_size_ml}ml</p></div>
                <div><p className="text-xs text-muted-foreground">ABV</p><p className="font-semibold">{selectedFG.abv_percent}%</p></div>
              </div>
            )}

            <div>
              <Label>Quantity to Transfer (bottles)</Label>
              <Input
                type="number" min="1"
                value={transferForm.quantity_bottles}
                onChange={e => setTransferForm(f => ({ ...f, quantity_bottles: e.target.value }))}
                className={`mt-1 ${overTransfer ? 'border-destructive' : ''}`}
                placeholder="0"
              />
              {overTransfer && <p className="text-xs text-destructive mt-1">Exceeds available stock ({selectedFG?.quantity_bottles} bottles)</p>}
            </div>

            <div>
              <Label>Transfer Date</Label>
              <Input
                type="date"
                value={transferForm.date_transferred_in}
                onChange={e => setTransferForm(f => ({ ...f, date_transferred_in: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Input
                value={transferForm.notes}
                onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="mt-1"
              />
            </div>

            <Button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || !selectedFGId || !transferQty || overTransfer}
              className="w-full h-11 font-semibold"
            >
              {transferMutation.isPending ? 'Transferring…' : 'Transfer to Warehouse'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch from Warehouse Dialog */}
      <Dialog open={showDispatch} onOpenChange={v => { setShowDispatch(v); if (!v) { setDispatchForm(EMPTY_DISPATCH); setLineItems([]); setNewLineWSId(''); setNewLineQty(''); setCalcingDistance(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Dispatch from Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Products</Label>
                {lineItems.length > 0 && (
                  <span className="text-xs text-muted-foreground">{dispatchTotalBottles} bottles</span>
                )}
              </div>

              {lineItems.length > 0 && (
                <div className="space-y-2 mb-3">
                  {lineItems.map((li) => {
                    const ws = warehouseStock.find(w => w.id === li.wsId);
                    const remaining = getRemainingAvail(li.wsId);
                    const liQty = parseInt(li.quantity) || 0;
                    const over = liQty > remaining;
                    return (
                      <div key={li.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ws?.product_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{ws?.bottle_size_ml}ml • Batch {ws?.batch_number} • {remaining} available</p>
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

              {warehouseStock.length > 0 && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select value={newLineWSId} onValueChange={setNewLineWSId}>
                      <SelectTrigger><SelectValue placeholder="Add product…" /></SelectTrigger>
                      <SelectContent>
                        {warehouseStock.map(ws => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.product_name} — Batch {ws.batch_number} ({getRemainingAvail(ws.id)} btls)
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
                  <Button variant="outline" size="icon" onClick={addLineItem} disabled={!newLineWSId || !newLineQty}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
              {warehouseStock.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No stock available at warehouse</p>
              )}
              {hasOverStock && (
                <p className="text-xs text-destructive mt-1">One or more items exceed available stock</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Customer</Label>
                <Link to="/customers" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Users className="w-3 h-3" /> Manage customers
                </Link>
              </div>
              <CustomerAutocomplete
                customers={customers}
                value={dispatchForm.customer_name}
                onSelect={v => {
                  const c = customers.find(c => c.business_name === v);
                  const addr = c?.delivery_address || '';
                  setDispatchForm(f => ({ ...f, customer_name: v, customer_address: addr }));
                  if (addr) calculateDistance(addr);
                }}
                onAddressChange={addr => {
                  setDispatchForm(f => ({ ...f, customer_address: addr }));
                  if (addr) calculateDistance(addr);
                }}
              />
              {dispatchForm.customer_address && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {dispatchForm.customer_address}
                </p>
              )}
            </div>

            <div>
              <Label>Dispatch Date</Label>
              <Input type="date" value={dispatchForm.dispatch_date} onChange={e => setDispatchForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transport Method</Label>
                <Select value={dispatchForm.transport_method} onValueChange={v => setDispatchForm(f => ({ ...f, transport_method: v }))}>
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
                    type="number" min="0"
                    value={dispatchForm.transport_distance_km}
                    onChange={e => setDispatchForm(f => ({ ...f, transport_distance_km: e.target.value }))}
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
            </div>

            <div>
              <Label>Status</Label>
              <Select value={dispatchForm.status} onValueChange={v => setDispatchForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={dispatchForm.notes} onChange={e => setDispatchForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1" />
            </div>

            <Button
              onClick={() => dispatchMutation.mutate()}
              disabled={dispatchMutation.isPending || lineItems.length === 0 || hasOverStock || !dispatchForm.customer_name}
              className="w-full h-11 font-semibold"
            >
              {dispatchMutation.isPending ? 'Saving…' : `Record Dispatch (${dispatchTotalBottles} bottles)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete / Return Stock Confirm */}
      <AlertDialog open={!!deletingWS} onOpenChange={v => !v && setDeletingWS(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Stock to Distillery?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deletingWS?.quantity_bottles} bottles</strong> of <strong>{deletingWS?.product_name}</strong> from the warehouse and return them to your distillery finished goods inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteWSMutation.mutate(deletingWS)} disabled={deleteWSMutation.isPending}>
              {deleteWSMutation.isPending ? 'Returning…' : 'Return to Distillery'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}