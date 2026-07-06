import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck, ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

export default function StockSummary({ finishedGoods = [], warehouseStock = [] }) {
  const [selectedProduct, setSelectedProduct] = useState('__none__');

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

  // Group by product name — each with summed totals and its batch list
  const productGroups = useMemo(() => {
    const map = {};
    for (const s of allStock) {
      const key = s.product_name || 'Unknown';
      if (!map[key]) map[key] = { product_name: key, bottle_size_ml: s.bottle_size_ml, batches: [], totalBottles: 0, totalLals: 0 };
      map[key].batches.push(s);
      map[key].totalBottles += s.quantity_bottles;
      map[key].totalLals += s.total_lals;
    }
    return Object.values(map).sort((a, b) => b.totalBottles - a.totalBottles);
  }, [allStock]);

  const totalBottles = productGroups.reduce((s, p) => s + p.totalBottles, 0);
  const totalLals = productGroups.reduce((s, p) => s + p.totalLals, 0);

  const selected = productGroups.find(p => p.product_name === selectedProduct);

  return (
    <Card className="p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent p-2"><PackageCheck className="w-5 h-5 text-primary" /></div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Stock on Hand</p>
            <p className="text-2xl font-bold font-display text-primary">{totalBottles.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">bottles</span></p>
            <p className="text-xs text-muted-foreground">{totalLals.toFixed(2)} LALs</p>
          </div>
        </div>
        <div className="w-full sm:w-72">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger><SelectValue placeholder="Select product to view batches…" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Products ({productGroups.length})</SelectLabel>
                {productGroups.map(p => (
                  <SelectItem key={p.product_name} value={p.product_name}>
                    {p.product_name} ({p.totalBottles.toLocaleString()} btls)
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product-level summary always visible */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead><TableHead>Size</TableHead>
            <TableHead>Bottles</TableHead><TableHead>LALs</TableHead><TableHead>Batches</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {productGroups.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No stock found</TableCell></TableRow>
          ) : productGroups.map(p => {
            const isSelected = p.product_name === selectedProduct;
            return (
              <Fragment key={p.product_name}>
                <TableRow key={p.product_name} className={isSelected ? 'bg-accent/40' : ''}>
                  <TableCell className="font-semibold flex items-center gap-1.5">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    {p.product_name}
                  </TableCell>
                  <TableCell>{p.bottle_size_ml ? `${p.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="font-semibold">{p.totalBottles.toLocaleString()}</TableCell>
                  <TableCell>{p.totalLals.toFixed(3)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.batches.length}</TableCell>
                </TableRow>
                {isSelected && selected && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={5} className="p-0">
                      <div className="px-6 py-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Batch breakdown — {selected.product_name}</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Batch</TableHead><TableHead>Size</TableHead><TableHead>Location</TableHead>
                              <TableHead>Bottles</TableHead><TableHead>LALs</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selected.batches.map((b, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                                <TableCell>{b.bottle_size_ml ? `${b.bottle_size_ml}ml` : '—'}</TableCell>
                                <TableCell className="text-muted-foreground">{b.location}</TableCell>
                                <TableCell className="font-semibold">{b.quantity_bottles}</TableCell>
                                <TableCell>{b.total_lals?.toFixed(3) || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}