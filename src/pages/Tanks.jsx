import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import TankCard from '@/components/tanks/TankCard';
import TransferDialog from '@/components/tanks/TransferDialog';

// All known purposes — new tanks will auto-appear in the correct group via their purpose field
const GROUP_ORDER = ['maceration_dilution', 'diluted_ethanol', 'final_product_storage', 'ibc', 'sns', 'spare'];
const GROUP_LABELS = {
  maceration_dilution: 'Maceration & Dilution Tanks',
  final_product_storage: 'Final Product Holding Tanks',
  diluted_ethanol: 'Diluted Ethanol Tanks (Outdoor)',
  ibc: 'IBC — Heads & Tails',
  sns: 'SNS Distillation',
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

const BLANK_TANK = {
  name: '',
  capacity_litres: '',
  purpose: 'final_product_storage',
  location: 'indoor',
  notes: '',
};

const PURPOSE_OPTIONS = [
  { value: 'final_product_storage', label: 'Final Product Storage (A, B, C, D type)' },
  { value: 'maceration_dilution', label: 'Maceration & Dilution (E, F, H type)' },
  { value: 'diluted_ethanol', label: 'Diluted Ethanol Outdoor (X, Y type)' },
  { value: 'ibc', label: 'IBC — Heads & Tails' },
  { value: 'sns', label: 'SNS Distillation Destination' },
  { value: 'spare', label: 'Spare' },
];

export default function Tanks() {
  const [selectedTank, setSelectedTank] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTank, setNewTank] = useState(BLANK_TANK);
  const [editTank, setEditTank] = useState(null);
  const queryClient = useQueryClient();

  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 50),
  });

  const addMutation = useMutation({
    mutationFn: (data) => db.StorageTank.create({
      name: data.name.toUpperCase(),
      capacity_litres: parseFloat(data.capacity_litres),
      purpose: data.purpose,
      location: data.location,
      status: 'empty',
      notes: data.notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setAddOpen(false);
      setNewTank(BLANK_TANK);
      toast.success('Tank added — it will now appear in all relevant dropdowns');
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }) => db.StorageTank.update(id, {
      name: data.name.toUpperCase(),
      capacity_litres: parseFloat(data.capacity_litres),
      purpose: data.purpose,
      location: data.location,
      notes: data.notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setEditTank(null);
      toast.success('Tank updated');
    },
  });

  const { data: movements = [], isLoading: movLoading } = useQuery({
    queryKey: ['tankMovements'],
    queryFn: () => db.TankMovement.list('-date', 100),
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
      <PageHeader title="Tank Farm" subtitle="Live view of all storage tanks and their contents">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />Add Tank</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Add New Tank</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); addMutation.mutate(newTank); }} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tank Name / Letter</Label>
                  <Input
                    value={newTank.name}
                    onChange={e => setNewTank(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. G"
                    required
                  />
                </div>
                <div>
                  <Label>Capacity (litres)</Label>
                  <Input
                    type="number" step="1"
                    value={newTank.capacity_litres}
                    onChange={e => setNewTank(p => ({ ...p, capacity_litres: e.target.value }))}
                    placeholder="e.g. 500"
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Tank Type / Purpose</Label>
                <Select value={newTank.purpose} onValueChange={v => setNewTank(p => ({ ...p, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  This determines which dropdowns the tank appears in across the app.
                </p>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={newTank.location} onValueChange={v => setNewTank(p => ({ ...p, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={newTank.notes} onChange={e => setNewTank(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adding...' : 'Add Tank'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

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
                       <div key={tank.id} className="relative group">
                         <TankCard tank={tank} onTransfer={handleTransfer} />
                         <button
                           onClick={() => setEditTank({ ...tank, capacity_litres: tank.capacity_litres ?? '' })}
                           className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white rounded-md p-1.5 shadow-sm border border-border"
                           title="Edit tank"
                         >
                           <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                         </button>
                       </div>
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

      {/* Edit Tank Dialog */}
      <Dialog open={!!editTank} onOpenChange={open => { if (!open) setEditTank(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Tank {editTank?.name}</DialogTitle>
          </DialogHeader>
          {editTank && (
            <form
              onSubmit={e => { e.preventDefault(); editMutation.mutate({ id: editTank.id, data: editTank }); }}
              className="space-y-4 mt-2"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tank Name / Letter</Label>
                  <Input
                    value={editTank.name}
                    onChange={e => setEditTank(p => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Capacity (litres)</Label>
                  <Input
                    type="number" step="1"
                    value={editTank.capacity_litres}
                    onChange={e => setEditTank(p => ({ ...p, capacity_litres: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Tank Type / Purpose</Label>
                <Select value={editTank.purpose} onValueChange={v => setEditTank(p => ({ ...p, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Changing purpose will update which dropdowns this tank appears in across the app.
                </p>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={editTank.location} onValueChange={v => setEditTank(p => ({ ...p, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={editTank.notes || ''}
                  onChange={e => setEditTank(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
