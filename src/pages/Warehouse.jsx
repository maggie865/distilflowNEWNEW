import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRightLeft, Truck, PackageCheck, Trash2, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';

const WAREHOUSE_ADDRESS = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';

const EMPTY_TRANSFER = { quantity_bottles: '', date_transferred_in: new Date().toISOString().split('T')[0], notes: '' };
const EMPTY_DISPATCH = {
  dispatch_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  customer_address: '',
  quantity_bottles: '',
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
  const [selectedWSId, setSelectedWSId] = useState('');

  const [deletingWS, setDeletingWS] = useState(null);
  const [calcingDistance, setCalcingDistance] = useState(false);

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('-created_date', 200),
  });

  const { data: warehouseStock = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => base44.entities.WarehouseStock.list('-date_transferred_in', 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('business_name', 200),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 200),
  });

  // Only dispatches that originated from the warehouse (flagged via notes prefix)
  const warehouseDispatches = dispatches.filter(d => d.notes?.startsWith('[3PL]'));

  const sellableGoods = finishedGoods.filter(fg => !fg.product_name?.includes('Tasting'));
  const selectedFG = finishedGoods.find(fg => fg.id === selectedFGId);
  const selectedWS = warehouseStock.find(ws => ws.id === selectedWSId);

  const transferQty = parseInt(transferForm.quantity_bottles) || 0;
  const dispatchQty = parseInt(dispatchForm.quantity_bottles) || 0;
  const overTransfer = transferQty > (selectedFG?.quantity_bottles || 0);
  const overDispatch = dispatchQty > (selectedWS?.quantity_bottles || 0);

  // Transfer-in: move from FinishedGood → WarehouseStock
  const transferMutation = useMutation({
    mutationFn: async () => {
      const fg = selectedFG;
      const lals = ((transferQty * (fg.bottle_size_ml || 700)) / 1000) * (fg.abv_percent || 0) / 100;

      // Create or update WarehouseStock record for this product+batch
      const existing = await base44.entities.WarehouseStock.filter({
        product_name: fg.product_name,
        batch_number: fg.batch_number,
      });

      if (existing.length > 0) {
        const ws = existing[0];
        await base44.entities.WarehouseStock.update(ws.id, {
          quantity_bottles: ws.quantity_bottles + transferQty,
          total_lals: parseFloat(((ws.total_lals || 0) + lals).toFixed(4)),
        });
      } else {
        await base44.entities.WarehouseStock.create({
          product_name: fg.product_name,
          batch_number: fg.batch_number,
          bottle_size_ml: fg.bottle_size_ml,
          abv_percent: fg.abv_percent,
          quantity_bottles: transferQty,
          total_lals: parseFloat(lals.toFixed(4)),
          date_transferred_in: transferForm.date_transferred_in,
          notes: transferForm.notes,
        });
      }

      // Deduct from FinishedGood
      const newQty = fg.quantity_bottles - transferQty;
      if (newQty <= 0) {
        await base44.entities.FinishedGood.delete(fg.id);
      } else {
        const newLals = Math.max(0, (fg.total_lals || 0) - lals);
        await base44.entities.FinishedGood.update(fg.id, {
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

  // Dispatch from warehouse to customer
  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const ws = selectedWS;
      const lals = ((dispatchQty * (ws.bottle_size_ml || 700)) / 1000) * (ws.abv_percent || 0) / 100;

      await base44.entities.Dispatch.create({
        ...dispatchForm,
        product_name: ws.product_name,
        batch_number: ws.batch_number,
        bottle_size_ml: ws.bottle_size_ml,
        quantity_bottles: dispatchQty,
        total_lals: parseFloat(lals.toFixed(4)),
        transport_distance_km: parseFloat(dispatchForm.transport_distance_km) || null,
        notes: `[3PL] ${dispatchForm.notes}`.trim(),
      });

      // Deduct from WarehouseStock
      const newQty = ws.quantity_bottles - dispatchQty;
      if (newQty <= 0) {
        await base44.entities.WarehouseStock.delete(ws.id);
      } else {
        const newLals = Math.max(0, (ws.total_lals || 0) - lals);
        await base44.entities.WarehouseStock.update(ws.id, {
          quantity_bottles: newQty,
          total_lals: parseFloat(newLals.toFixed(4)),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setShowDispatch(false);
      setDispatchForm(EMPTY_DISPATCH);
      setSelectedWSId('');
      toast.success('Dispatch recorded and warehouse stock updated');
    },
  });

  const calculateDistance = async (customerAddress) => {
    if (!customerAddress) return;
    setCalcingDistance(true);
    const res = await base44.functions.invoke('getDistanceMatrix', {
      origin: WAREHOUSE_ADDRESS,
      destination: customerAddress,
    });
    if (res.data?.distance_km) {
      setDispatchForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
      toast.success(`Distance: ${res.data.distance_km} km (${res.data.duration_text})`);
    }
    setCalcingDistance(false);
  };

  const deleteWSMutation = useMutation({
    mutationFn: async (ws) => {
      // Restore back to FinishedGoods
      const existing = await base44.entities.FinishedGood.filter({
        product_name: ws.product_name,
        batch_number: ws.batch_number,
      });
      if (existing.length > 0) {
        const fg = existing[0];
        await base44.entities.FinishedGood.update(fg.id, {
          quantity_bottles: (fg.quantity_bottles || 0) + ws.quantity_bottles,
          total_lals: parseFloat(((fg.total_lals || 0) + (ws.total_lals || 0)).toFixed(4)),
        });
      } else {
        await base44.entities.FinishedGood.create({
          product_name: ws.product_name,
          batch_number: ws.batch_number,
          bottle_size_ml: ws.bottle_size_ml,
          abv_percent: ws.abv_percent,
          quantity_bottles: ws.quantity_bottles,
          total_lals: ws.total_lals,
        });
      }
      await base44.entities.WarehouseStock.delete(ws.id);
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
            <span className="text-xs font-medium text-muted-foreground">Dispatched from 3PL</span>
          </div>
          <p className="text-2xl font-bold font-display text-green-600">{warehouseDispatches.length}</p>
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
                <TableHead>Method</TableHead>
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
              ) : warehouseDispatches.map(d => (
                <TableRow key={d.id}>
                  <TableCell>{d.dispatch_date ? format(new Date(d.dispatch_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="font-semibold">{d.customer_name}</TableCell>
                  <TableCell>{d.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.batch_number}</TableCell>
                  <TableCell className="font-semibold">{d.quantity_bottles}</TableCell>
                  <TableCell>{d.total_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="capitalize">{d.transport_method || '—'}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                </TableRow>
              ))}
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
      <Dialog open={showDispatch} onOpenChange={v => { setShowDispatch(v); if (!v) { setDispatchForm(EMPTY_DISPATCH); setSelectedWSId(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Dispatch from Warehouse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Product (from warehouse stock)</Label>
              <Select value={selectedWSId} onValueChange={setSelectedWSId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select warehouse stock…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouseStock.map(ws => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.product_name} — Batch {ws.batch_number} ({ws.quantity_bottles} btls)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedWS && (
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">In Warehouse</p><p className="font-semibold">{selectedWS.quantity_bottles} btls</p></div>
                <div><p className="text-xs text-muted-foreground">Size</p><p className="font-semibold">{selectedWS.bottle_size_ml}ml</p></div>
                <div><p className="text-xs text-muted-foreground">Batch</p><p className="font-semibold font-mono text-xs">{selectedWS.batch_number}</p></div>
              </div>
            )}

            <div>
              <Label>Quantity (bottles)</Label>
              <Input
                type="number" min="1"
                value={dispatchForm.quantity_bottles}
                onChange={e => setDispatchForm(f => ({ ...f, quantity_bottles: e.target.value }))}
                className={`mt-1 ${overDispatch ? 'border-destructive' : ''}`}
                placeholder="0"
              />
              {overDispatch && <p className="text-xs text-destructive mt-1">Exceeds warehouse stock ({selectedWS?.quantity_bottles} bottles)</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Customer</Label>
                <Link to="/customers" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Users className="w-3 h-3" /> Manage customers
                </Link>
              </div>
              <Select
                value={dispatchForm.customer_name}
                onValueChange={v => {
                  const c = customers.find(c => c.business_name === v);
                  const addr = c?.delivery_address || '';
                  setDispatchForm(f => ({ ...f, customer_name: v, customer_address: addr }));
                  if (addr) calculateDistance(addr);
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer…" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.business_name}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={dispatchMutation.isPending || !selectedWSId || !dispatchForm.quantity_bottles || !dispatchForm.customer_name || overDispatch}
              className="w-full h-11 font-semibold"
            >
              {dispatchMutation.isPending ? 'Saving…' : 'Record Dispatch & Deduct Warehouse Stock'}
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