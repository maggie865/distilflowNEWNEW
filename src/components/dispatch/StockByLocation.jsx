import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const BLUFF_TO_AUCKLAND_KM = 159;

const calcWeightKg = (bottleSizeMl, numBottles) => {
  if (!numBottles) return 0;
  const kgPerBottle = bottleSizeMl <= 250 ? (6 / 12) : (10 / 6);
  return parseFloat((kgPerBottle * numBottles).toFixed(2));
};

const calcCO2eTransfer = (bottleSizeMl, numBottles) => {
  const weightKg = calcWeightKg(bottleSizeMl, numBottles);
  return parseFloat(((BLUFF_TO_AUCKLAND_KM * weightKg / 1000) * 0.12).toFixed(3));
};

const EMPTY_TRANSFER = { quantity_bottles: '', date_transferred_in: new Date().toISOString().split('T')[0], notes: '' };

export default function StockByLocation({ finishedGoods = [], warehouseStock = [] }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER);
  const [selectedFGId, setSelectedFGId] = useState('');
  const [deletingWS, setDeletingWS] = useState(null);

  const queryClient = useQueryClient();
  const sellableGoods = finishedGoods.filter(fg => !fg.product_name?.includes('Tasting'));
  const selectedFG = finishedGoods.find(fg => fg.id === selectedFGId);
  const transferQty = parseInt(transferForm.quantity_bottles) || 0;
  const overTransfer = transferQty > (selectedFG?.quantity_bottles || 0);

  const bluffTotalBottles = finishedGoods.reduce((s, fg) => s + (fg.quantity_bottles || 0), 0);
  const bluffTotalLals = finishedGoods.reduce((s, fg) => s + (fg.total_lals || 0), 0);
  const warehouseTotalBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const warehouseTotalLals = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const fg = selectedFG;
      const lals = ((transferQty * (fg.bottle_size_ml || 700)) / 1000) * (fg.abv_percent || 0) / 100;
      const co2e = calcCO2eTransfer(fg.bottle_size_ml, transferQty);
      const existing = await db.WarehouseStock.filter({ product_name: fg.product_name, batch_number: fg.batch_number });
      if (existing.length > 0) {
        const ws = existing[0];
        await db.WarehouseStock.update(ws.id, { quantity_bottles: ws.quantity_bottles + transferQty, total_lals: parseFloat(((ws.total_lals || 0) + lals).toFixed(4)) });
      } else {
        await db.WarehouseStock.create({
          product_name: fg.product_name, batch_number: fg.batch_number, bottle_size_ml: fg.bottle_size_ml,
          abv_percent: fg.abv_percent, quantity_bottles: transferQty, total_lals: parseFloat(lals.toFixed(4)),
          date_transferred_in: transferForm.date_transferred_in, notes: transferForm.notes,
        });
      }
      await db.TankMovement.create({
        date: transferForm.date_transferred_in, action: 'transfer_out', tank_name: 'Distillery Stock', counterpart_tank: 'Auckland 3PL',
        volume_litres: (transferQty * (fg.bottle_size_ml || 700)) / 1000, abv: fg.abv_percent, lals: parseFloat(lals.toFixed(4)),
        product: fg.product_name, batch_number: fg.batch_number, co2e_kg: co2e, notes: `[3PL TRANSFER] ${transferForm.notes}`.trim(),
      });
      const newQty = fg.quantity_bottles - transferQty;
      if (newQty <= 0) await db.FinishedGood.delete(fg.id);
      else { const newLals = Math.max(0, (fg.total_lals || 0) - lals); await db.FinishedGood.update(fg.id, { quantity_bottles: newQty, total_lals: parseFloat(newLals.toFixed(4)) }); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      setShowTransfer(false); setTransferForm(EMPTY_TRANSFER); setSelectedFGId('');
      toast.success('Stock transferred to 3PL Warehouse');
    },
  });

  const deleteWSMutation = useMutation({
    mutationFn: async (ws) => {
      const existing = await db.FinishedGood.filter({ product_name: ws.product_name, batch_number: ws.batch_number });
      if (existing.length > 0) {
        const fg = existing[0];
        await db.FinishedGood.update(fg.id, { quantity_bottles: (fg.quantity_bottles || 0) + ws.quantity_bottles, total_lals: parseFloat(((fg.total_lals || 0) + (ws.total_lals || 0)).toFixed(4)) });
      } else {
        await db.FinishedGood.create({ product_name: ws.product_name, batch_number: ws.batch_number, bottle_size_ml: ws.bottle_size_ml, abv_percent: ws.abv_percent, quantity_bottles: ws.quantity_bottles, total_lals: ws.total_lals });
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

  return (
    <>
      <Tabs defaultValue="bluff">
        <div className="flex items-center justify-between mb-4">
          <TabsList><TabsTrigger value="bluff">Bluff Distillery</TabsTrigger><TabsTrigger value="3pl">Auckland 3PL</TabsTrigger></TabsList>
          <Button variant="outline" onClick={() => setShowTransfer(true)} className="gap-2" size="sm"><ArrowRightLeft className="w-4 h-4" />Transfer to 3PL</Button>
        </div>

        <TabsContent value="bluff">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Bluff Distillery Stock</h2>
              <div className="flex gap-4 text-sm"><span className="text-muted-foreground">{bluffTotalBottles.toLocaleString()} bottles</span><span className="text-muted-foreground">{bluffTotalLals.toFixed(2)} LALs</span></div>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Size</TableHead><TableHead>ABV</TableHead><TableHead>Bottles</TableHead><TableHead>LALs</TableHead></TableRow></TableHeader>
              <TableBody>
                {finishedGoods.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock at distillery</TableCell></TableRow>
                ) : finishedGoods.map(fg => (
                  <TableRow key={fg.id}>
                    <TableCell className="font-semibold">{fg.product_name}</TableCell>
                    <TableCell className="font-mono text-xs">{fg.batch_number}</TableCell>
                    <TableCell>{fg.bottle_size_ml ? `${fg.bottle_size_ml}ml` : '—'}</TableCell>
                    <TableCell>{fg.abv_percent ? `${fg.abv_percent}%` : '—'}</TableCell>
                    <TableCell className="font-semibold">{fg.quantity_bottles}</TableCell>
                    <TableCell>{fg.total_lals?.toFixed(3) || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="3pl">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Auckland 3PL Stock</h2>
              <div className="flex gap-4 text-sm"><span className="text-muted-foreground">{warehouseTotalBottles.toLocaleString()} bottles</span><span className="text-muted-foreground">{warehouseTotalLals.toFixed(2)} LALs</span></div>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Size</TableHead><TableHead>Bottles</TableHead><TableHead>LALs</TableHead><TableHead>Transferred In</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {warehouseStock.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No stock at warehouse</TableCell></TableRow>
                ) : warehouseStock.map(ws => (
                  <TableRow key={ws.id}>
                    <TableCell className="font-semibold">{ws.product_name}</TableCell>
                    <TableCell className="font-mono text-xs">{ws.batch_number}</TableCell>
                    <TableCell>{ws.bottle_size_ml ? `${ws.bottle_size_ml}ml` : '—'}</TableCell>
                    <TableCell className="font-semibold">{ws.quantity_bottles}</TableCell>
                    <TableCell>{ws.total_lals?.toFixed(3) || '—'}</TableCell>
                    <TableCell>{ws.date_transferred_in ? format(new Date(ws.date_transferred_in), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeletingWS(ws)}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTransfer} onOpenChange={v => { setShowTransfer(v); if (!v) { setTransferForm(EMPTY_TRANSFER); setSelectedFGId(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Transfer Stock to 3PL Warehouse</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Product (from distillery stock)</Label>
              <Select value={selectedFGId} onValueChange={setSelectedFGId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select finished good…" /></SelectTrigger>
                <SelectContent>
                  {sellableGoods.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground text-center">No finished goods in stock</div>}
                  {sellableGoods.map(fg => (<SelectItem key={fg.id} value={fg.id}>{fg.product_name} — Batch {fg.batch_number} ({fg.quantity_bottles} btls)</SelectItem>))}
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
              <Input type="number" min="1" value={transferForm.quantity_bottles} onChange={e => setTransferForm(f => ({ ...f, quantity_bottles: e.target.value }))} className={`mt-1 ${overTransfer ? 'border-destructive' : ''}`} placeholder="0" />
              {overTransfer && <p className="text-xs text-destructive mt-1">Exceeds available stock ({selectedFG?.quantity_bottles} bottles)</p>}
            </div>
            <div><Label>Transfer Date</Label><Input type="date" value={transferForm.date_transferred_in} onChange={e => setTransferForm(f => ({ ...f, date_transferred_in: e.target.value }))} className="mt-1" /></div>
            <div><Label>Notes</Label><Input value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1" /></div>
            <Button onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending || !selectedFGId || !transferQty || overTransfer} className="w-full h-11 font-semibold">
              {transferMutation.isPending ? 'Transferring…' : 'Transfer to Warehouse'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingWS} onOpenChange={v => !v && setDeletingWS(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Stock to Distillery?</AlertDialogTitle>
            <AlertDialogDescription>This will remove <strong>{deletingWS?.quantity_bottles} bottles</strong> of <strong>{deletingWS?.product_name}</strong> from the warehouse and return them to your distillery finished goods inventory.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteWSMutation.mutate(deletingWS)} disabled={deleteWSMutation.isPending}>{deleteWSMutation.isPending ? 'Returning…' : 'Return to Distillery'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}