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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';
import InventoryReport from '@/components/reports/InventoryReport';
import CostOfGoodsReport from '@/components/reports/CostOfGoodsReport';
import ExciseReturn from '@/components/reports/ExciseReturn';
import MovementsReport from '@/components/reports/MovementsReport';
import CarbonReport from '@/components/reports/CarbonReport';
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
  const [activeTab, setActiveTab] = useState('overview');
  const [recvPage, setRecvPage] = useState(1);
  const [recvPageSize, setRecvPageSize] = useState(50);
  const [dispPage, setDispPage] = useState(1);
  const [dispPageSize, setDispPageSize] = useState(50);
  const [wastePage, setWastePage] = useState(1);
  const [wastePageSize, setWastePageSize] = useState(50);

  const { data: wastage = [] } = useQuery({ queryKey: ['wastage'], queryFn: () => db.WastageRecord.list('-date', 5000) });
  const { data: receiving = [] } = useQuery({ queryKey: ['receiving'], queryFn: () => db.Receiving.list('-date_received', 5000) });
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 5000),
  });
  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => db.RawMaterial.list('name', 5000) });
  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => db.FinishedGood.list('product_name', 5000) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => db.WarehouseStock.list('-date_transferred_in', 5000) });
  const { data: distillationRuns = [] } = useQuery({ queryKey: ['distillationRuns'], queryFn: () => db.DistillationRun.list('-date', 5000) });
  const { data: bottlingRuns = [] } = useQuery({ queryKey: ['bottlingRuns'], queryFn: () => db.BottlingRun.list('-date', 5000) });
  const { data: masterBatches = [] } = useQuery({ queryKey: ['masterBatches'], queryFn: () => db.MasterBatch.list('-date_started', 5000) });
  const { data: dilutions = [] } = useQuery({ queryKey: ['dilutions'], queryFn: () => db.Dilution.list('-date', 5000) });
  const { data: tankMovements = [] } = useQuery({ queryKey: ['tankMovements'], queryFn: () => db.TankMovement.list('-date', 5000) });
  const { data: tanks = [] } = useQuery({ queryKey: ['storageTanks'], queryFn: () => db.StorageTank.list('name', 5000) });
  const { data: recipes = [] } = useQuery({ queryKey: ['recipes'], queryFn: () => db.Recipe.list('name', 5000) });

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
  const wastageBySource = ['distillation', 'bottling', 'tank', 'sns_distillation', 'other'].map(src => {
    const label = src === 'sns_distillation' ? 'SNS Distillation' : src.charAt(0).toUpperCase() + src.slice(1);
    return {
      source: label,
      lals: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.lals || 0), 0).toFixed(3)),
      volume: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.volume || 0), 0).toFixed(2)),
    };
  }).filter(d => d.lals > 0 || d.volume > 0);

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

  const [csvModal, setCsvModal] = useState(null); // { filename, content }

  const exportCSV = (filename, rows, headers) => {
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    // Try direct download first
    try {
      const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      const a = document.createElement('a');
      a.setAttribute('href', dataUri);
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Fall back to copy modal if download is blocked
    }
    // Always show the copy modal so user can copy if download was blocked
    setCsvModal({ filename, content: csv });
  };

  const handleExport = () => {
    setExporting(true);
    try {
      const label = `${startDate}_to_${endDate}`;
      switch (activeTab) {
        case 'overview': {
          const headers = ['product_name','batch_number','bottle_size_ml','abv_percent','quantity_bottles','total_lals'];
          const rows = finishedGoodsWithStock.map(g => ({
            product_name: g.product_name, batch_number: g.batch_number,
            bottle_size_ml: g.bottle_size_ml, abv_percent: g.abv_percent,
            quantity_bottles: g.quantity_bottles, total_lals: g.total_lals,
          }));
          exportCSV(`inventory_snapshot_${label}.csv`, rows, headers);
          break;
        }
        case 'movements': {
          const recvHeaders = ['date_received','packing_slip_number','material_name','supplier','quantity','unit','lals','cost_per_unit'];
          const recvRows = monthReceiving.map(r => ({
            date_received: r.date_received, packing_slip_number: r.packing_slip_number,
            material_name: r.material_name, supplier: r.supplier,
            quantity: r.quantity, unit: r.unit, lals: r.lals, cost_per_unit: r.cost_per_unit,
          }));
          exportCSV(`inbound_movements_${label}.csv`, recvRows, recvHeaders);
          const dispHeaders = ['dispatch_date','customer_name','product_name','batch_number','bottle_size_ml','quantity_bottles','total_lals','dispatched_from','sales_channel','order_reference','is_sample','duty_free','is_export'];
          const dispRows = monthDispatches.map(d => ({
            dispatch_date: d.dispatch_date, customer_name: d.customer_name,
            product_name: d.product_name, batch_number: d.batch_number,
            bottle_size_ml: d.bottle_size_ml, quantity_bottles: d.quantity_bottles,
            total_lals: d.total_lals, dispatched_from: d.dispatched_from,
            sales_channel: d.sales_channel, order_reference: d.order_reference,
            is_sample: d.is_sample, duty_free: d.duty_free, is_export: d.is_export,
          }));
          exportCSV(`outbound_dispatches_${label}.csv`, dispRows, dispHeaders);
          break;
        }
        case 'wastage': {
          const headers = ['date','batch_number','product_name','source','volume','abv','lals','reason'];
          const rows = wastageWithCost.map(w => ({
            date: w.date, batch_number: w.batch_number, product_name: w.product_name,
            source: w.source, volume: w.volume, abv: w.abv, lals: w.lals, reason: w.reason,
          }));
          exportCSV(`wastage_${label}.csv`, rows, headers);
          break;
        }
        case 'carbon': {
          const headers = ['dispatch_date','customer_name','product_name','quantity_bottles','transport_method','transport_distance_km','co2e_kg','dispatched_from'];
          const rows = monthDispatches.filter(d => d.co2e_kg > 0).map(d => ({
            dispatch_date: d.dispatch_date, customer_name: d.customer_name,
            product_name: d.product_name, quantity_bottles: d.quantity_bottles,
            transport_method: d.transport_method, transport_distance_km: d.transport_distance_km,
            co2e_kg: d.co2e_kg, dispatched_from: d.dispatched_from,
          }));
          exportCSV(`carbon_footprint_${label}.csv`, rows, headers);
          break;
        }
        case 'cogs': {
          const headers = ['product_name','batch_number','bottle_size_ml','bottles_produced','raw_material_cost_per_bottle','packaging_cost_per_bottle','total_cogs_per_bottle','selling_price','gross_margin_pct'];
          exportCSV(`cogs_${label}.csv`, [], headers);
          toast.info('COGS export uses data from the Cost of Goods tab — make sure it has loaded first.');
          break;
        }
        case 'excise': {
          // Export the excise summary as CSV
          // Pull the calculated values from the ExciseReturn component via the shared data
          const headers = ['description', 'lals', 'amount_nzd'];
          const exciseRate = new Date(startDate) >= new Date('2026-07-01') ? 71.034 : 68.915;
          const monthD = dispatches.filter(d => {
            const dd = d.dispatch_date || '';
            return dd >= startDate && dd <= endDate;
          });
          const bluffTaxable = monthD.filter(d => !(d.dispatched_from||'').includes('Auckland') && d.duty_free !== true && d.is_export !== true).reduce((s,d)=>s+(d.total_lals||0),0);
          const bluffExempt = monthD.filter(d => !(d.dispatched_from||'').includes('Auckland') && (d.duty_free===true||d.is_export===true)).reduce((s,d)=>s+(d.total_lals||0),0);
          const transferLals = warehouseStock ? warehouseStock.filter(ws => { const t = ws.transfer_date||ws.date_transferred_in||''; return t >= startDate && t <= endDate; }).reduce((s,ws)=>s+(ws.total_lals||0),0) : 0;
          const exempt3PL = monthD.filter(d => (d.dispatched_from||'').includes('Auckland') && (d.duty_free===true||d.is_export===true)).reduce((s,d)=>s+(d.total_lals||0),0);
          const net3PL = Math.max(0, transferLals - exempt3PL);
          const totalTaxable = bluffTaxable + net3PL;
          const exciseDue = totalTaxable * exciseRate;
          const gst = exciseDue * 0.15;
          const rows = [
            { description: `Excise Return ${startDate} to ${endDate}`, lals: '', amount_nzd: '' },
            { description: 'Distillery dispatches (taxable)', lals: bluffTaxable.toFixed(4), amount_nzd: '' },
            { description: 'Less: Duty free / export from Distillery', lals: `-${bluffExempt.toFixed(4)}`, amount_nzd: '' },
            { description: 'Transferred to 3PL', lals: transferLals.toFixed(4), amount_nzd: '' },
            { description: 'Less: Duty free / export from 3PL', lals: `-${exempt3PL.toFixed(4)}`, amount_nzd: '' },
            { description: 'Net 3PL taxable LALs', lals: net3PL.toFixed(4), amount_nzd: '' },
            { description: 'TOTAL TAXABLE LALs', lals: totalTaxable.toFixed(4), amount_nzd: '' },
            { description: `Excise rate (spirits >23% vol)`, lals: '', amount_nzd: `$${exciseRate}/LAL` },
            { description: 'Excise due (GST excl.)', lals: '', amount_nzd: `$${exciseDue.toFixed(2)}` },
            { description: 'GST (15%)', lals: '', amount_nzd: `$${gst.toFixed(2)}` },
            { description: 'Total excise due (GST incl.)', lals: '', amount_nzd: `$${(exciseDue+gst).toFixed(2)}` },
          ];
          exportCSV(`excise_return_${label}.csv`, rows, headers);
          break;
        }
        default:
          toast.info('Switch to a tab to export its data.');
      }
      toast.success('Export downloaded successfully');
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  const pagedReceiving = monthReceiving.slice((recvPage - 1) * recvPageSize, recvPage * recvPageSize);
  const pagedDispatches = monthDispatches.slice((dispPage - 1) * dispPageSize, dispPage * dispPageSize);
  const pagedWastage = wastageWithCost.slice((wastePage - 1) * wastePageSize, wastePage * wastePageSize);

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
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList>
           <TabsTrigger value="overview">Inventory Snapshot</TabsTrigger>
           <TabsTrigger value="cogs">Cost of Goods</TabsTrigger>
           <TabsTrigger value="movements">Movements</TabsTrigger>
           <TabsTrigger value="carbon">Carbon Footprint</TabsTrigger>
           <TabsTrigger value="wastage">Wastage Analysis</TabsTrigger>
           <TabsTrigger value="excise">Excise Return</TabsTrigger>
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
              distillationRuns={distillationRuns}
              bottlingRuns={bottlingRuns}
              masterBatches={masterBatches}
            />
          </TabsContent>

          {/* ── MOVEMENTS ── */}
          <TabsContent value="movements" className="space-y-6">
            <MovementsReport
              receiving={receiving}
              dispatches={dispatches}
              distillationRuns={distillationRuns}
              bottlingRuns={bottlingRuns}
              tankMovements={tankMovements}
              tanks={tanks}
              wastage={wastage}
              finishedGoods={finishedGoods}
              warehouseStock={warehouseStock}
              startDate={startDate}
              endDate={endDate}
            />
          </TabsContent>

        {/* ── CARBON FOOTPRINT ── */}
        <TabsContent value="carbon" className="space-y-6">
          <CarbonReport
            receiving={receiving}
            dispatches={dispatches}
            warehouseStock={warehouseStock}
            startDate={startDate}
            endDate={endDate}
          />
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
                  ) : pagedWastage.map(w => (
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
            <Pagination total={wastageWithCost.length} page={wastePage} pageSize={wastePageSize} onPageChange={setWastePage} onPageSizeChange={(s) => { setWastePageSize(s); setWastePage(1); }} />
          </Card>
        </TabsContent>
        {/* ── EXCISE RETURN ── */}
        <TabsContent value="excise" className="space-y-6">
          <ExciseReturn
            finishedGoods={finishedGoods}
            warehouseStock={warehouseStock}
            tanks={tanks}
            dispatches={dispatches}
            distillationRuns={distillationRuns}
            bottlingRuns={bottlingRuns}
            wastage={wastage}
            tankMovements={tankMovements}
          />
        </TabsContent>
      </Tabs>
      {/* CSV Copy Modal — fallback if download is blocked */}
      {csvModal && (
        <Dialog open={!!csvModal} onOpenChange={() => setCsvModal(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                {csvModal.filename}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">If the file didn't download automatically, copy the content below and paste it into Excel or Google Sheets.</p>
            <div className="flex-1 overflow-auto">
              <textarea
                readOnly
                value={csvModal.content}
                className="w-full h-64 text-xs font-mono border border-border rounded p-2 bg-muted resize-none"
                onClick={e => e.target.select()}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => {
                navigator.clipboard.writeText(csvModal.content).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Copy failed — select all text and copy manually'));
              }}>Copy to Clipboard</Button>
              <Button variant="outline" onClick={() => setCsvModal(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}