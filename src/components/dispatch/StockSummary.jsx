import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck } from 'lucide-react';

export default function StockSummary({ finishedGoods = [], warehouseStock = [] }) {
  const [selectedBatch, setSelectedBatch] = useState('all');

  // Combine stock from both locations
  const allStock = useMemo(() => {
    const bluff = finishedGoods.map(fg => ({
      product_name: fg.product_name, batch_number: fg.batch_number, bottle_size_ml: fg.bottle_size_ml,
      abv_percent: fg.abv_percent, quantity_bottles: fg.quantity_bottles || 0, total_lals: fg.total_lals || 0,
      location: 'Bluff',
    }));
    const warehouse = warehouseStock.map(ws => ({
      product_name: ws.product_name, batch_number: ws.batch_number, bottle_size_ml: ws.bottle_size_ml,
      abv_percent: ws.abv_percent, quantity_bottles: ws.quantity_bottles || 0, total_lals: ws.total_lals || 0,
      location: 'Auckland 3PL',
    }));
    return [...bluff, ...warehouse];
  }, [finishedGoods, warehouseStock]);

  // Unique batch numbers for dropdown
  const batchOptions = useMemo(() => {
    const batches = [...new Set(allStock.map(s => s.batch_number).filter(Boolean))];
    batches.sort();
    return batches;
  }, [allStock]);

  const totalBottles = allStock.reduce((s, x) => s + x.quantity_bottles, 0);
  const totalLals = allStock.reduce((s, x) => s + x.total_lals, 0);

  const filtered = selectedBatch === 'all'
    ? allStock
    : allStock.filter(s => s.batch_number === selectedBatch);

  const filteredBottles = filtered.reduce((s, x) => s + x.quantity_bottles, 0);
  const filteredLals = filtered.reduce((s, x) => s + x.total_lals, 0);

  return (
    <Card className="p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent p-2"><PackageCheck className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Stock on Hand</p>
            <p className="text-2xl font-bold font-display text-primary">{totalBottles.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">bottles</span></p>
            <p className="text-xs text-muted-foreground">{totalLals.toFixed(2)} LALs</p>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger><SelectValue placeholder="Filter by batch…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches ({totalBottles.toLocaleString()} btls)</SelectItem>
              {batchOptions.map(batch => {
                const batchBottles = allStock.filter(s => s.batch_number === batch).reduce((s, x) => s + x.quantity_bottles, 0);
                return <SelectItem key={batch} value={batch}>{batch} ({batchBottles.toLocaleString()} btls)</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedBatch !== 'all' && (
        <div className="flex items-center gap-4 mb-3 text-sm">
          <span className="font-semibold">{selectedBatch}</span>
          <span className="text-muted-foreground">{filteredBottles.toLocaleString()} bottles</span>
          <span className="text-muted-foreground">{filteredLals.toFixed(3)} LALs</span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Size</TableHead>
            <TableHead>Location</TableHead><TableHead>Bottles</TableHead><TableHead>LALs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stock found</TableCell></TableRow>
          ) : filtered.map((s, i) => (
            <TableRow key={i}>
              <TableCell className="font-semibold">{s.product_name}</TableCell>
              <TableCell className="font-mono text-xs">{s.batch_number}</TableCell>
              <TableCell>{s.bottle_size_ml ? `${s.bottle_size_ml}ml` : '—'}</TableCell>
              <TableCell className="text-muted-foreground">{s.location}</TableCell>
              <TableCell className="font-semibold">{s.quantity_bottles}</TableCell>
              <TableCell>{s.total_lals?.toFixed(3) || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}