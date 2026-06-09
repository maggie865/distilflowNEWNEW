import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { FileSpreadsheet, Loader2, TrendingDown, PackageCheck, ArrowDownToLine, ArrowUpFromLine, Building2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

// Generate list of last 12 months
function getMonthOptions() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
  }
  return months;
}

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
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [exporting, setExporting] = useState(false);

  const { data: wastage = [] } = useQuery({ queryKey: ['wastage'], queryFn: () => base44.entities.WastageRecord.list('-date', 500) });
  const { data: receiving = [] } = useQuery({ queryKey: ['receiving'], queryFn: () => base44.entities.Receiving.list('-date_received', 500) });
  const { data: dispatches = [] } = useQuery({ queryKey: ['dispatches'], queryFn: () => base44.entities.Dispatch.list('-dispatch_date', 500) });
  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => base44.entities.RawMaterial.list('name', 200) });
  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => base44.entities.FinishedGood.list('product_name', 200) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => base44.entities.WarehouseStock.list('-date_transferred_in', 200) });
  const { data: distillationRuns = [] } = useQuery({ queryKey: ['distillationRuns'], queryFn: () => base44.entities.DistillationRun.list('-date', 500) });

  // Date range for selected month
  const [year, month] = selectedMonth.split('-').map(Number);
  const rangeStart = startOfMonth(new Date(year, month - 1));
  const rangeEnd = endOfMonth(new Date(year, month - 1));

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try { return isWithinInterval(parseISO(dateStr), { start: rangeStart, end: rangeEnd }); } catch { return false; }
  };

  // Filtered data for selected month
  const monthWastage = wastage.filter(w => inRange(w.date));
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const warehouseDispatches = monthDispatches.filter(d => d.notes?.startsWith('[3PL]'));
  const distilleryDispatches = monthDispatches.filter(d => !d.notes?.startsWith('[3PL]'));

  // Inventory snapshot totals
  const totalDistilleryBottles = finishedGoods.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalDistilleryLals = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);
  const totalWarehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalWarehouseLals = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const totalEthanolLals = rawMaterials.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);

  // Cost of Goods Breakdown
  const ethanolCostTotal = rawMaterials.filter(m => m.type === 'ethanol').reduce((s, m) => s + ((m.quantity || 0) * (m.cost_per_unit || 0)), 0);
  const botanicalsCostTotal = rawMaterials.filter(m => m.type === 'botanical').reduce((s, m) => s + ((m.quantity || 0) * (m.cost_per_unit || 0)), 0);
  const packagingCostTotal = rawMaterials.filter(m => m.type === 'packaging').reduce((s, m) => s + ((m.quantity || 0) * (m.cost_per_unit || 0)), 0);
  const othersCostTotal = rawMaterials.filter(m => !['ethanol', 'botanical', 'packaging'].includes(m.type)).reduce((s, m) => s + ((m.quantity || 0) * (m.cost_per_unit || 0)), 0);

  const cogBreakdown = [
    { name: 'Ethanol', value: parseFloat(ethanolCostTotal.toFixed(2)), items: rawMaterials.filter(m => m.type === 'ethanol').length },
    { name: 'Botanicals', value: parseFloat(botanicalsCostTotal.toFixed(2)), items: rawMaterials.filter(m => m.type === 'botanical').length },
    { name: 'Packaging', value: parseFloat(packagingCostTotal.toFixed(2)), items: rawMaterials.filter(m => m.type === 'packaging').length },
    { name: 'Other', value: parseFloat(othersCostTotal.toFixed(2)), items: rawMaterials.filter(m => !['ethanol', 'botanical', 'packaging'].includes(m.type)).length },
  ].filter(c => c.value > 0);

  const totalCogsValue = cogBreakdown.reduce((s, c) => s + c.value, 0);
  const COGS_COLORS = ['#F97316', '#3B82F6', '#10B981', '#8B5CF6'];

  // Distillation dumped data converted to wastage records
  const completedDistillationRuns = distillationRuns.filter(r => r.status === 'completed' && r.dumped_volume && inRange(r.date));
  const distillationDumpedWastage = completedDistillationRuns.map(r => ({
    id: `distill-${r.id}`,
    date: r.date,
    product_name: r.product_name,
    batch_number: r.batch_number,
    volume: r.dumped_volume,
    abv: r.dumped_abv,
    lals: r.dumped_lals,
    reason: r.dumped_notes || 'Distillation dump',
    source: 'distillation',
    run_id: r.id,
  }));

  // Combined wastage: manual records + distillation dumps
  const combinedWastage = [...monthWastage, ...distillationDumpedWastage];

  // Wastage stats
  const totalWastedLals = combinedWastage.reduce((s, w) => s + (w.lals || 0), 0);
  const totalWastedVol = combinedWastage.reduce((s, w) => s + (w.volume || 0), 0);

  // Cost per litre: look up cost from raw materials by matching ethanol cost_per_unit as a proxy
  const ethanolCostPerLitre = rawMaterials.filter(m => m.type === 'ethanol' && m.cost_per_unit)
    .reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0) || 3.5;

  const wastageWithCost = combinedWastage.map(w => {
    const costPerL = w.source === 'distillation' || w.source === 'tank' ? ethanolCostPerLitre : ethanolCostPerLitre * 0.5;
    const totalLoss = parseFloat(((w.volume || 0) * costPerL).toFixed(2));
    return { ...w, cost_per_litre: costPerL, total_loss: totalLoss };
  });

  const totalWastageCost = wastageWithCost.reduce((s, w) => s + w.total_loss, 0);
  const avgCostPerLitreWasted = totalWastedVol > 0 ? (totalWastageCost / totalWastedVol).toFixed(2) : '0.00';

  // Wastage by source for bar chart
  const wastageBySource = ['distillation', 'bottling', 'tank', 'other'].map(src => ({
    source: src.charAt(0).toUpperCase() + src.slice(1),
    lals: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.lals || 0), 0).toFixed(3)),
    volume: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.volume || 0), 0).toFixed(2)),
  })).filter(d => d.lals > 0 || d.volume > 0);

  // Monthly trend (last 6 months)
  const trendMonths = getMonthOptions().slice(0, 6).reverse();
  const trendData = trendMonths.map(m => {
    const [y, mo] = m.value.split('-').map(Number);
    const s = startOfMonth(new Date(y, mo - 1));
    const e = endOfMonth(new Date(y, mo - 1));
    const inM = (ds) => { try { return ds && isWithinInterval(parseISO(ds), { start: s, end: e }); } catch { return false; } };
    const monthWastageData = wastage.filter(w => inM(w.date));
    const monthDistillDumped = distillationRuns.filter(r => r.status === 'completed' && r.dumped_lals && inM(r.date)).reduce((acc, r) => acc + (r.dumped_lals || 0), 0);
    return {
      month: format(s, 'MMM yy'),
      received: receiving.filter(r => inM(r.date_received)).reduce((acc, r) => acc + (r.lals || r.quantity || 0), 0),
      dispatched: dispatches.filter(d => inM(d.dispatch_date)).reduce((acc, d) => acc + (d.quantity_bottles || 0), 0),
      wasted: parseFloat((monthWastageData.reduce((acc, w) => acc + (w.lals || 0), 0) + monthDistillDumped).toFixed(3)),
    };
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('generateMonthlyReport', {
        month: selectedMonth,
        wastage: wastageWithCost,
        receiving: monthReceiving,
        dispatches: monthDispatches,
        rawMaterials,
        finishedGoods,
        warehouseStock,
      });
      if (res.data?.spreadsheet_url) {
        window.open(res.data.spreadsheet_url, '_blank');
        toast.success('Monthly report exported to Google Sheets!');
      }
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Monthly Reports" subtitle="Operational audit, inventory snapshot, and wastage analysis">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {exporting ? 'Exporting…' : 'Export to Google Sheets'}
        </Button>
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Inventory Snapshot</TabsTrigger>
          <TabsTrigger value="cogs">Cost of Goods</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="wastage">Wastage Analysis</TabsTrigger>
        </TabsList>

        {/* ── INVENTORY SNAPSHOT ── */}
        <TabsContent value="overview" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Current Stock (Live)</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Distillery Bottles" value={totalDistilleryBottles.toLocaleString()} sub="on-site" icon={PackageCheck} color="text-primary" bg="bg-accent border-accent-foreground/10" />
            <StatCard label="Distillery LALs" value={totalDistilleryLals.toFixed(2)} sub="finished goods" icon={PackageCheck} color="text-primary" bg="bg-accent border-accent-foreground/10" />
            <StatCard label="3PL Bottles" value={totalWarehouseBottles.toLocaleString()} sub="at Auckland 3PL" icon={Building2} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
            <StatCard label="3PL LALs" value={totalWarehouseLals.toFixed(2)} sub="at Auckland 3PL" icon={Building2} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
            <StatCard label="Ethanol LALs" value={totalEthanolLals.toFixed(2)} sub="raw stock" icon={PackageCheck} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
          </div>

          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mt-4">6-Month Trend</h3>
          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-4">Inbound LALs vs Dispatched Bottles vs Wastage LALs</h4>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="received" name="Received (LALs)" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="dispatched" name="Dispatched (Bottles)" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="wasted" name="Wasted (LALs)" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Raw Materials Table */}
          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-4">Raw Materials (Current Stock)</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>LALs</TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawMaterials.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No raw materials</TableCell></TableRow>
                ) : rawMaterials.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-sm">{m.name}</TableCell>
                    <TableCell className="text-sm capitalize">{m.type}</TableCell>
                    <TableCell className="text-sm font-semibold">{m.quantity}</TableCell>
                    <TableCell className="text-sm">{m.unit}</TableCell>
                    <TableCell className="text-sm">{m.lals ? m.lals.toFixed(3) : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.supplier || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          </TabsContent>

          {/* ── COST OF GOODS ── */}
          <TabsContent value="cogs" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cost of Goods — Current Inventory</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h4 className="text-sm font-semibold mb-4">COGS Breakdown by Category</h4>
              {cogBreakdown.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={cogBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: $${value.toFixed(0)}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {cogBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COGS_COLORS[index % COGS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-4 space-y-2">
                    {cogBreakdown.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COGS_COLORS[i] }}></div>
                          <span className="text-muted-foreground">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${item.value.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">{item.items} item{item.items !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No cost data available</p>
              )}
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-semibold mb-4">Summary</h4>
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total COGS Value</p>
                  <p className="text-3xl font-bold font-display">${totalCogsValue.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-2">All on-hand inventory</p>
                </div>
                <div className="space-y-2">
                  {cogBreakdown.map((item) => (
                    <div key={item.name} className="flex justify-between text-sm border-b pb-2">
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-semibold">{((item.value / totalCogsValue) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-4">Raw Materials Cost Detail</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Cost / Unit</TableHead>
                    <TableHead>Total Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawMaterials.filter(m => m.cost_per_unit && m.quantity).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No cost data recorded</TableCell></TableRow>
                  ) : rawMaterials.filter(m => m.cost_per_unit && m.quantity).map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">{m.type}</TableCell>
                      <TableCell className="text-sm">{m.quantity}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">${m.cost_per_unit?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm font-semibold">${(m.quantity * m.cost_per_unit).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
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
                  ) : monthDispatches.map(d => (
                    <TableRow key={d.id}>
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

        {/* ── WASTAGE ── */}
        <TabsContent value="wastage" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Wastage Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Volume Wasted" value={totalWastedVol.toFixed(2)} sub="litres" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Total LALs Wasted" value={totalWastedLals.toFixed(3)} sub="litres abs. alcohol" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Avg Cost / Litre" value={`$${avgCostPerLitreWasted}`} sub="of wasted spirit" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
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
                    <TableHead>Cost / L</TableHead>
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
                      <TableCell className="text-sm text-amber-700">${w.cost_per_litre?.toFixed(2)}</TableCell>
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