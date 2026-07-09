import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { FileSpreadsheet, Loader2, TrendingDown, PackageCheck, ArrowDownToLine, ArrowUpFromLine, Building2, Truck, MapPin } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import InventoryReport from '@/components/reports/InventoryReport';
import CostOfGoodsReport from '@/components/reports/CostOfGoodsReport';
import { useRawMaterialsNetStock } from '@/hooks/useRawMaterialsNetStock';

function StatCard({ label, value, sub, color = 'text-primary', bg = 'bg-accent border-accent-foreground/10', icon: Icon }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Reports() {
  const now = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(now, 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);

  const { data: wastage = [] } = useQuery({ queryKey: ['wastage'], queryFn: () => db.WastageRecord.list('-date', 500) });
  const { data: receiving = [] } = useQuery({ queryKey: ['receiving'], queryFn: () => db.Receiving.list('-date_received', 500) });
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 2000),
  });
  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => db.RawMaterial.list('name', 200) });
  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => db.FinishedGood.list('product_name', 200) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => db.WarehouseStock.list('-date_transferred_in', 200) });
  const { data: distillationRuns = [] } = useQuery({ queryKey: ['distillationRuns'], queryFn: () => db.DistillationRun.list('-date', 500) });
  const { data: bottlingRuns = [] } = useQuery({ queryKey: ['bottlingRuns'], queryFn: () => db.BottlingRun.list('-date', 200) });
  const { data: dilutions = [] } = useQuery({ queryKey: ['dilutions'], queryFn: () => db.Dilution.list('-date', 500) });
  const { data: tankMovements = [] } = useQuery({ queryKey: ['tankMovements'], queryFn: () => db.TankMovement.list('-date', 500) });
  const { data: tanks = [] } = useQuery({ queryKey: ['storageTanks'], queryFn: () => db.StorageTank.list('name', 100) });
  const { data: recipes = [] } = useQuery({ queryKey: ['recipes'], queryFn: () => db.Recipe.list('name', 100) });

  // Net raw material stock from shared hook (includes receiving-only items with costs)
  const { rawMaterialsWithNetStock: rawMaterialsNetStock } = useRawMaterialsNetStock();

  // Date range
  const rangeStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
  const rangeEnd = endDate ? parseISO(endDate) : new Date();

  const rangeEndInclusive = new Date(rangeEnd);
  rangeEndInclusive.setHours(23, 59, 59, 999);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return d >= rangeStart && d <= rangeEndInclusive;
    } catch { return false; }
  };

  // Filtered data for selected month
  const monthWastage = wastage.filter(w => inRange(w.date));
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const warehouseDispatches = monthDispatches.filter(d => d.notes?.startsWith('[3PL]'));
  const distilleryDispatches = monthDispatches.filter(d => !d.notes?.startsWith('[3PL]'));
  const monthTankMovements = tankMovements.filter(tm => inRange(tm.date) && tm.counterpart_tank === 'Auckland 3PL');

  // rawMaterialsNetStock is now provided by the shared useRawMaterialsNetStock hook above

  // Net finished goods stock (deduct all dispatches from both sheets)
  const allDispatchedByBatch = dispatches.reduce((acc, d) => {
    const key = `${d.batch_number}||${d.product_name}`;
    acc[key] = (acc[key] || 0) + (d.quantity_bottles || 0);
    return acc;
  }, {});
  const finishedGoodsWithStock = finishedGoods.map(g => {
    const key = `${g.batch_number}||${g.product_name}`;
    const dispatched = allDispatchedByBatch[key] || 0;
    const bottled = g.quantity_bottles || 0;
    const remaining = Math.max(0, bottled - dispatched);
    const lalsPerBottle = bottled > 0 && g.total_lals ? g.total_lals / bottled : 0;
    return { ...g, quantity_bottles: remaining, total_lals: parseFloat((remaining * lalsPerBottle).toFixed(3)) };
  });

  // Inventory snapshot totals
  const totalDistilleryBottles = finishedGoodsWithStock.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalDistilleryLals = finishedGoodsWithStock.reduce((s, g) => s + (g.total_lals || 0), 0);
  const totalWarehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalWarehouseLals = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const totalEthanolLals = rawMaterialsNetStock.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);

  // COGS breakdown is now rendered by the CostOfGoodsReport component

  // Combined wastage: use WastageRecord entity only (distillation dumps are already stored there)
  const combinedWastage = monthWastage;

  // Wastage stats
  const totalWastedLals = combinedWastage.reduce((s, w) => s + (w.lals || 0), 0);
  const totalWastedVol = combinedWastage.reduce((s, w) => s + (w.volume || 0), 0);

  // Cost per LAL: look up cost from ethanol raw materials
  const ethanolCostPerLal = rawMaterials.filter(m => m.type === 'ethanol' && m.cost_per_unit)
    .reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0) || 3.5;

  const wastageWithCost = combinedWastage.map(w => {
    const costPerLal = ethanolCostPerLal;
    const totalLoss = parseFloat(((w.lals || 0) * costPerLal).toFixed(2));
    return { ...w, cost_per_lal: costPerLal, total_loss: totalLoss };
  });

  const totalWastageCost = wastageWithCost.reduce((s, w) => s + w.total_loss, 0);
  const avgCostPerLalWasted = totalWastedLals > 0 ? (totalWastageCost / totalWastedLals).toFixed(2) : '0.00';

  // Wastage by source for bar chart
  const wastageBySource = ['distillation', 'bottling', 'tank', 'other'].map(src => ({
    source: src.charAt(0).toUpperCase() + src.slice(1),
    lals: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.lals || 0), 0).toFixed(3)),
    volume: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.volume || 0), 0).toFixed(2)),
  })).filter(d => d.lals > 0 || d.volume > 0);

  // 6-month trend (always last 6 calendar months regardless of date range)
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const s = startOfMonth(d);
    const e = endOfMonth(d);
    const inM = (ds) => { try { return ds && isWithinInterval(parseISO(ds), { start: s, end: e }); } catch { return false; } };
    return {
      month: format(s, 'MMM yy'),
      received: receiving.filter(r => inM(r.date_received)).reduce((acc, r) => acc + (r.lals || 0), 0),
      dispatched: dispatches.filter(d => inM(d.dispatch_date)).reduce((acc, d) => acc + (d.quantity_bottles || 0), 0),
      wasted: parseFloat(wastage.filter(w => inM(w.date)).reduce((acc, w) => acc + (w.lals || 0), 0).toFixed(3)),
    };
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      // Google Sheets export removed — data now in Supabase
      toast.info('Export to Google Sheets is currently disabled.');
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Reports" subtitle="Operational audit, inventory snapshot, and wastage analysis">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 text-sm" />
          </div>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Export to Google Sheets'}
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
           <TabsTrigger value="overview">Inventory Snapshot</TabsTrigger>
           <TabsTrigger value="cogs">Cost of Goods</TabsTrigger>
           <TabsTrigger value="movements">Movements</TabsTrigger>
           <TabsTrigger value="carbon">Carbon Footprint</TabsTrigger>
           <TabsTrigger value="wastage">Wastage Analysis</TabsTrigger>
         </TabsList>

        {/* ── INVENTORY SNAPSHOT ── */}
        <TabsContent value="overview" className="space-y-6">
          <InventoryReport
            rawMaterialsNetStock={rawMaterialsNetStock}
            finishedGoodsWithStock={finishedGoodsWithStock}
            warehouseStock={warehouseStock}
            tanks={tanks}
          />
        </TabsContent>

          {/* ── COST OF GOODS ── */}
          <TabsContent value="cogs" className="space-y-6">
            <CostOfGoodsReport
              rawMaterialsNetStock={rawMaterialsNetStock}
              rawMaterials={rawMaterials}
              finishedGoodsWithStock={finishedGoodsWithStock}
              tanks={tanks}
              recipes={recipes}
            />
          </TabsContent>

          {/* ── MOVEMENTS ── */}
          <TabsContent value="movements" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Stock Movements</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Received (lines)" value={monthReceiving.length} sub="inbound receipts" icon={ArrowDownToLine} color="text-green-600" bg="bg-green-50 border-green-200" />
            <StatCard label="Inbound LALs" value={monthReceiving.filter(r => r.lals).reduce((s, r) => s + r.lals, 0).toFixed(2)} sub="ethanol received" icon={ArrowDownToLine} color="text-green-600" bg="bg-green-50 border-green-200" />
            <StatCard label="Distillery Dispatches" value={distilleryDispatches.length} sub={`${distilleryDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0)} bottles`} icon={ArrowUpFromLine} color="text-primary" bg="bg-accent border-accent-foreground/10" />
            <StatCard label="3PL Dispatches" value={warehouseDispatches.length} sub={`${warehouseDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0)} bottles`} icon={Building2} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-4">Inbound — Receiving ({monthLabel})</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>LALs</TableHead>
                    <TableHead>Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthReceiving.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No receipts this month</TableCell></TableRow>
                  ) : monthReceiving.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.date_received ? format(parseISO(r.date_received), 'dd MMM') : '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                      <TableCell className="text-sm">{r.quantity} {r.unit}</TableCell>
                      <TableCell className="text-sm">{r.lals ? r.lals.toFixed(3) : '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.supplier || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-4">Outbound — All Dispatches ({monthLabel})</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Bottles</TableHead>
                    <TableHead>Origin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDispatches.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No dispatches this month</TableCell></TableRow>
                  ) : monthDispatches.map((d, i) => (
                    <TableRow key={d.id || d._row_index || i}>
                      <TableCell className="text-sm">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'dd MMM') : '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{d.customer_name}</TableCell>
                      <TableCell className="text-sm">{d.product_name}</TableCell>
                      <TableCell className="text-sm font-semibold">{d.quantity_bottles}</TableCell>
                      <TableCell className="text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.notes?.startsWith('[3PL]') ? 'bg-blue-100 text-blue-700' : 'bg-accent text-accent-foreground'}`}>
                          {d.notes?.startsWith('[3PL]') ? '3PL' : 'Distillery'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        {/* ── CARBON FOOTPRINT ── */}
         <TabsContent value="carbon" className="space-y-6">
           {(() => {
             const inboundCo2e = monthReceiving.reduce((s, r) => s + (r.co2e_kg || 0), 0);
             const dispatchCo2e = monthDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
             const transferCo2e = monthTankMovements.reduce((s, tm) => s + (tm.co2e_kg || 0), 0);
             const totalCo2e = inboundCo2e + dispatchCo2e + transferCo2e;

             const transportMethods = ['road', 'courier', 'air', 'sea', 'pickup'];
             const combinedByMethod = transportMethods.map(method => ({
               method: method.charAt(0).toUpperCase() + method.slice(1),
               inbound: monthReceiving.filter(r => r.transport_method === method).reduce((s, r) => s + (r.co2e_kg || 0), 0),
               outbound: monthDispatches.filter(d => d.transport_method === method).reduce((s, d) => s + (d.co2e_kg || 0), 0),
             })).filter(d => d.inbound > 0 || d.outbound > 0);

             return (
               <>
                 <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Transport Emissions</h3>
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                   <StatCard label="Total CO2e" value={totalCo2e.toFixed(1)} sub="kg all transport" icon={TrendingDown} color="text-green-600" bg="bg-green-50 border-green-200" />
                   <StatCard label="Inbound CO2e" value={inboundCo2e.toFixed(1)} sub="kg from receiving" icon={ArrowDownToLine} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
                   <StatCard label="Outbound CO2e" value={dispatchCo2e.toFixed(1)} sub="kg to customers" icon={ArrowUpFromLine} color="text-primary" bg="bg-accent border-accent-foreground/10" />
                   <StatCard label="3PL CO2e" value={transferCo2e.toFixed(1)} sub="kg warehouse transfers" icon={Building2} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
                   <StatCard label="Total Distance" value={monthDispatches.reduce((s, d) => s + (d.transport_distance_km || 0), 0).toLocaleString()} sub="km outbound" icon={MapPin} color="text-muted-foreground" bg="bg-card border-border" />
                 </div>

                 <Card className="p-4">
                   <h4 className="text-sm font-semibold mb-4">Emissions by Transport Method — {monthLabel}</h4>
                   {combinedByMethod.length > 0 ? (
                     <ResponsiveContainer width="100%" height={240}>
                       <BarChart data={combinedByMethod}>
                         <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                         <XAxis dataKey="method" tick={{ fontSize: 12 }} />
                         <YAxis tick={{ fontSize: 12 }} />
                         <Tooltip formatter={(val) => `${val.toFixed(3)} kg`} />
                         <Legend />
                         <Bar dataKey="inbound" name="Inbound (kg)" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                         <Bar dataKey="outbound" name="Outbound (kg)" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                       </BarChart>
                     </ResponsiveContainer>
                   ) : (
                     <p className="text-sm text-muted-foreground text-center py-8">No transport emission data available</p>
                   )}
                 </Card>

                 <Card className="p-4">
                   <h4 className="text-sm font-semibold mb-4">Inbound Receiving Emissions — {monthLabel}</h4>
                   <div className="overflow-x-auto">
                     <Table>
                       <TableHeader>
                         <TableRow>
                           <TableHead>Date</TableHead>
                           <TableHead>Material</TableHead>
                           <TableHead>Supplier</TableHead>
                           <TableHead>Method</TableHead>
                           <TableHead>Distance</TableHead>
                           <TableHead>CO2e</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {monthReceiving.filter(r => r.co2e_kg > 0).length === 0 ? (
                           <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No inbound emissions recorded this month</TableCell></TableRow>
                         ) : monthReceiving.filter(r => r.co2e_kg > 0).map(r => (
                           <TableRow key={r.id}>
                             <TableCell className="text-sm">{r.date_received ? format(parseISO(r.date_received), 'dd MMM') : '—'}</TableCell>
                             <TableCell className="font-medium text-sm">{r.material_name}</TableCell>
                             <TableCell className="text-sm text-muted-foreground">{r.supplier_name || r.supplier || '—'}</TableCell>
                             <TableCell className="text-sm capitalize">{r.transport_method || '—'}</TableCell>
                             <TableCell className="text-sm">{r.transport_distance_km ? `${r.transport_distance_km} km` : '—'}</TableCell>
                             <TableCell className="text-sm font-semibold text-amber-600">{r.co2e_kg.toFixed(3)} kg</TableCell>
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                   </div>
                 </Card>

                 <div className="grid md:grid-cols-2 gap-6">
                   <Card className="p-4">
                     <h4 className="text-sm font-semibold mb-4">Customer Dispatch Emissions — {monthLabel}</h4>
                     <div className="overflow-x-auto">
                       <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Date</TableHead>
                             <TableHead>Customer</TableHead>
                             <TableHead>Method</TableHead>
                             <TableHead>CO2e</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {monthDispatches.filter(d => !d.notes?.startsWith('[3PL]')).length === 0 ? (
                             <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No dispatches</TableCell></TableRow>
                           ) : monthDispatches.filter(d => !d.notes?.startsWith('[3PL]')).map((d, i) => (
                             <TableRow key={d.id || d._row_index || i}>
                               <TableCell className="text-sm">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'dd MMM') : '—'}</TableCell>
                               <TableCell className="text-sm">{d.customer_name}</TableCell>
                               <TableCell className="text-sm capitalize">{d.transport_method || '—'}</TableCell>
                               <TableCell className="text-sm font-semibold text-green-600">{d.co2e_kg ? `${d.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                             </TableRow>
                           ))}
                         </TableBody>
                       </Table>
                     </div>
                   </Card>

                   <Card className="p-4">
                     <h4 className="text-sm font-semibold mb-4">3PL Transfer Emissions — {monthLabel}</h4>
                     <div className="overflow-x-auto">
                       <Table>
                         <TableHeader>
                           <TableRow>
                             <TableHead>Date</TableHead>
                             <TableHead>Product</TableHead>
                             <TableHead>Volume</TableHead>
                             <TableHead>CO2e</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {monthTankMovements.length === 0 ? (
                             <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No 3PL transfers</TableCell></TableRow>
                           ) : monthTankMovements.map(tm => (
                             <TableRow key={tm.id}>
                               <TableCell className="text-sm">{tm.date ? format(parseISO(tm.date), 'dd MMM') : '—'}</TableCell>
                               <TableCell className="text-sm font-medium">{tm.product}</TableCell>
                               <TableCell className="text-sm">{tm.volume_litres ? `${tm.volume_litres.toFixed(2)} L` : '—'}</TableCell>
                               <TableCell className="text-sm font-semibold text-blue-600">{tm.co2e_kg ? `${tm.co2e_kg.toFixed(3)} kg` : '—'}</TableCell>
                             </TableRow>
                           ))}
                         </TableBody>
                       </Table>
                     </div>
                   </Card>
                 </div>
                 </>
                 );
                 })()}
                 </TabsContent>

        {/* ── WASTAGE ── */}
        <TabsContent value="wastage" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Wastage Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Volume Wasted" value={totalWastedVol.toFixed(2)} sub="litres" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Total LALs Wasted" value={totalWastedLals.toFixed(3)} sub="litres abs. alcohol" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Avg Cost / LAL" value={`$${avgCostPerLalWasted}`} sub="of wasted spirit" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
            <StatCard label="Total Wastage Cost" value={`$${totalWastageCost.toFixed(2)}`} sub="estimated loss" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
          </div>

          {wastageBySource.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-4">Wastage by Source — {monthLabel}</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={wastageBySource}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="volume" name="Volume (L)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lals" name="LALs" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-4">Wastage Ledger — {monthLabel}</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Volume (L)</TableHead>
                    <TableHead>ABV %</TableHead>
                     <TableHead>LALs</TableHead>
                     <TableHead>Cost / LAL</TableHead>
                     <TableHead>Total Loss</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wastageWithCost.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No wastage records this month</TableCell></TableRow>
                  ) : wastageWithCost.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm">{w.date ? format(parseISO(w.date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{w.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{w.batch_number}</TableCell>
                      <TableCell className="text-sm capitalize">{w.source}</TableCell>
                      <TableCell className="text-sm font-semibold">{w.volume?.toFixed(2) || '—'}</TableCell>
                      <TableCell className="text-sm">{w.abv ? `${w.abv}%` : '—'}</TableCell>
                      <TableCell className="text-sm">{w.lals?.toFixed(3) || '—'}</TableCell>
                      <TableCell className="text-sm text-amber-700">${w.cost_per_lal?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm font-semibold text-destructive">${w.total_loss?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{w.reason || '—'}</TableCell>
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