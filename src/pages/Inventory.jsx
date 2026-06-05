import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Warehouse, Wine, Package } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';

const typeColors = {
  ethanol: 'bg-amber-100 text-amber-800',
  botanical: 'bg-emerald-100 text-emerald-800',
  grain: 'bg-yellow-100 text-yellow-800',
  sugar: 'bg-pink-100 text-pink-800',
  water: 'bg-blue-100 text-blue-800',
  flavoring: 'bg-purple-100 text-purple-800',
  packaging: 'bg-sky-100 text-sky-800',
  other: 'bg-muted text-muted-foreground',
};

export default function Inventory() {
  const { data: rawMaterials = [], isLoading: loadingRaw } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 100),
  });

  const { data: finishedGoods = [], isLoading: loadingFinished } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('product_name', 100),
  });

  const packagingItems = rawMaterials.filter(m => m.type === 'packaging');
  const nonPackagingRaw = rawMaterials.filter(m => m.type !== 'packaging');
  const totalRawItems = nonPackagingRaw.length;
  const totalEthanolLALs = rawMaterials
    .filter(m => m.type === 'ethanol')
    .reduce((sum, m) => sum + (m.lals || 0), 0);
  const totalBottles = finishedGoods.reduce((sum, g) => sum + (g.quantity_bottles || 0), 0);
  const totalFinishedLALs = finishedGoods.reduce((sum, g) => sum + (g.total_lals || 0), 0);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Inventory" subtitle="Track all raw materials and finished goods" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Raw Materials" value={totalRawItems} subtitle="items" icon={Warehouse} />
        <StatCard title="Packaging Items" value={packagingItems.length} subtitle="item types" icon={Package} />
        <StatCard title="Ethanol LALs" value={totalEthanolLALs.toFixed(2)} subtitle="in stock" icon={Warehouse} />
        <StatCard title="Finished Bottles" value={totalBottles} subtitle="in stock" icon={Wine} />
        <StatCard title="Finished LALs" value={totalFinishedLALs.toFixed(2)} subtitle="bottled" icon={Wine} />
      </div>

      <Tabs defaultValue="raw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="packaging">Packaging</TabsTrigger>
          <TabsTrigger value="finished">Finished Goods</TabsTrigger>
        </TabsList>

        <TabsContent value="raw">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : nonPackagingRaw.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No raw materials in stock</TableCell></TableRow>
                  ) : nonPackagingRaw.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={typeColors[m.type] || typeColors.other}>
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.quantity} {m.unit}</TableCell>
                      <TableCell className="text-sm">{m.abv_percent ? `${m.abv_percent}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{m.lals ? m.lals.toFixed(3) : '—'}</TableCell>
                      <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
                      <TableCell className="text-sm">{m.batch_number || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="packaging">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRaw ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : packagingItems.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No packaging items in stock. Add them via Receiving with type "Packaging".</TableCell></TableRow>
                  ) : packagingItems.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm font-semibold">{m.quantity}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.supplier || '—'}</TableCell>
                      <TableCell className="text-sm">{m.batch_number || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="finished">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Bottle Size</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>Bottles</TableHead>
                    <TableHead>Total LALs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingFinished ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : finishedGoods.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No finished goods in stock</TableCell></TableRow>
                  ) : finishedGoods.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium text-sm">{g.product_name}</TableCell>
                      <TableCell className="text-sm">{g.batch_number}</TableCell>
                      <TableCell className="text-sm">{g.bottle_size_ml ? `${g.bottle_size_ml}ml` : '—'}</TableCell>
                      <TableCell className="text-sm">{g.abv_percent ? `${g.abv_percent}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{g.quantity_bottles}</TableCell>
                      <TableCell className="text-sm font-medium">{g.total_lals?.toFixed(3) || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}