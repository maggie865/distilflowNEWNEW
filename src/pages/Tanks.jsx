import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';
import TankCard from '@/components/tanks/TankCard';
import TransferDialog from '@/components/tanks/TransferDialog';

const GROUP_ORDER = ['maceration_dilution', 'diluted_ethanol', 'final_product_storage', 'ibc', 'spare'];
const GROUP_LABELS = {
  maceration_dilution: 'Maceration & Dilution Tanks',
  final_product_storage: 'Final Product Holding Tanks',
  diluted_ethanol: 'Diluted Ethanol Tanks (Outdoor)',
  ibc: 'IBC — Heads & Tails',
  spare: 'Spare',
};

const ACTION_LABELS = {
  fill: 'Fill',
  empty: 'Empty',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  bottling_draw: 'Bottling Draw',
  cleaning: 'Cleaning',
};

const ACTION_COLORS = {
  fill: 'bg-emerald-100 text-emerald-800',
  empty: 'bg-red-100 text-red-700',
  transfer_in: 'bg-blue-100 text-blue-800',
  transfer_out: 'bg-amber-100 text-amber-800',
  bottling_draw: 'bg-purple-100 text-purple-800',
  cleaning: 'bg-muted text-muted-foreground',
};

export default function Tanks() {
  const [selectedTank, setSelectedTank] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 50),
  });

  const { data: movements = [], isLoading: movLoading } = useQuery({
    queryKey: ['tankMovements'],
    queryFn: () => base44.entities.TankMovement.list('-date', 100),
  });

  const handleTransfer = (tank) => {
    setSelectedTank(tank);
    setTransferOpen(true);
  };

  // Group tanks by purpose
  const grouped = GROUP_ORDER.reduce((acc, key) => {
    const group = tanks.filter(t => t.purpose === key);
    if (group.length > 0) acc[key] = group;
    return acc;
  }, {});

  // Summary stats
  const totalLitres = tanks.reduce((s, t) => s + (t.current_volume || 0), 0);
  const inUseTanks = tanks.filter(t => t.status === 'in_use').length;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Tank Farm" subtitle="Live view of all storage tanks and their contents" />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total tanks: </span>
          <span className="font-semibold">{tanks.length}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">In use: </span>
          <span className="font-semibold text-emerald-600">{inUseTanks}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total volume: </span>
          <span className="font-semibold">{totalLitres.toFixed(0)}L</span>
        </div>
      </div>

      <Tabs defaultValue="tanks">
        <TabsList className="mb-6">
          <TabsTrigger value="tanks">Tank Farm</TabsTrigger>
          <TabsTrigger value="history">Movement History</TabsTrigger>
        </TabsList>

        <TabsContent value="tanks">
          {tanksLoading ? (
            <p className="text-center py-16 text-muted-foreground text-sm">Loading tanks...</p>
          ) : (
            <div className="space-y-8">
              {Object.entries(grouped).map(([group, groupTanks]) => (
                <div key={group}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {GROUP_LABELS[group]}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groupTanks.map(tank => (
                      <TankCard key={tank.id} tank={tank} onTransfer={handleTransfer} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Tank</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Volume (L)</TableHead>
                    <TableHead>ABV</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Ethanol Lot</TableHead>
                    <TableHead>Botanical Lot</TableHead>
                    <TableHead>Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movLoading ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : movements.length === 0 ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No movements recorded yet</TableCell></TableRow>
                  ) : movements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">{m.date ? format(new Date(m.date), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell className="font-semibold text-sm">Tank {m.tank_name}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${ACTION_COLORS[m.action] || ''}`} variant="secondary">
                          {ACTION_LABELS[m.action] || m.action}
                          {m.counterpart_tank && ` ↔ ${m.counterpart_tank}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.volume_litres}</TableCell>
                      <TableCell className="text-sm">{m.abv ? `${m.abv}%` : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{m.lals?.toFixed(3) || '—'}</TableCell>
                      <TableCell className="text-sm">{m.product || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.batch_number || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.ethanol_lot || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{m.botanical_lot || '—'}</TableCell>
                      <TableCell className="text-sm">{m.operator || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedTank && (
        <TransferDialog
          tank={selectedTank}
          allTanks={tanks}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}
    </div>
  );
}