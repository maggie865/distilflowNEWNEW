import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Droplets, Flame, Wine, Warehouse, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('-created_at', 100),
  });
  const { data: dilutions = [] } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => base44.entities.Dilution.list('-date', 5),
  });
  const { data: distillations = [] } = useQuery({
    queryKey: ['distillations'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 5),
  });
  const { data: bottlings = [] } = useQuery({
    queryKey: ['bottlings'],
    queryFn: () => base44.entities.BottlingRun.list('-date', 5),
  });
  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('-created_at', 100),
  });
  const { data: thresholds = [] } = useQuery({
    queryKey: ['stockThresholds'],
    queryFn: () => base44.entities.StockThreshold.list('material_name', 200),
  });

  const totalEthanolLitres = rawMaterials
    .filter(m => m.type === 'ethanol')
    .reduce((sum, m) => sum + (m.quantity || 0), 0);
  const totalLALs = rawMaterials
    .filter(m => m.type === 'ethanol')
    .reduce((sum, m) => sum + (m.lals || 0), 0);
  const totalBottles = finishedGoods.reduce((sum, g) => sum + (g.quantity_bottles || 0), 0);
  const totalFinishedLALs = finishedGoods.reduce((sum, g) => sum + (g.total_lals || 0), 0);

  // Compute low stock alerts
  const lowStockAlerts = thresholds
    .map(t => {
      const material = rawMaterials.find(m => m.id === t.raw_material_id);
      if (!material) return null;
      const qty = material.quantity || 0;
      if (qty <= t.threshold) {
        return { name: material.name, qty, threshold: t.threshold, unit: t.unit, type: material.type };
      }
      return null;
    })
    .filter(Boolean);

  const recentActivity = [
    ...dilutions.map(d => ({ ...d, _type: 'Dilution', _date: d.date })),
    ...distillations.map(d => ({ ...d, _type: 'Distillation', _date: d.date })),
    ...bottlings.map(d => ({ ...d, _type: 'Bottling', _date: d.date })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date)).slice(0, 8);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Dashboard" subtitle="Overview of your distillery operations" />

      {/* Low stock alerts banner */}
      {lowStockAlerts.length > 0 && (
        <div
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => navigate('/inventory')}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              {lowStockAlerts.length} item{lowStockAlerts.length !== 1 ? 's' : ''} below minimum stock level
            </p>
            <span className="ml-auto text-xs text-amber-600 underline">View inventory →</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-amber-900">{a.name}</span>
                <span className="text-xs text-amber-600">{a.qty.toFixed(2)} / {a.threshold} {a.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Raw Materials"
          value={rawMaterials.length}
          subtitle="Items in stock"
          icon={Warehouse}
        />
        <StatCard
          title="Ethanol Stock"
          value={`${totalEthanolLitres.toFixed(1)}L`}
          subtitle={`${totalLALs.toFixed(2)} LALs`}
          icon={Droplets}
        />
        <StatCard
          title="Finished Goods"
          value={totalBottles}
          subtitle="Bottles in stock"
          icon={Wine}
        />
        <StatCard
          title="Finished LALs"
          value={totalFinishedLALs.toFixed(2)}
          subtitle="Total LALs bottled"
          icon={TrendingUp}
        />
      </div>

      {/* Recent Activity */}
      <Card className="p-0 overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Recent Activity</h2>
        </div>
        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No activity yet. Start by receiving some raw materials.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentActivity.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    {item._type === 'Dilution' && <Droplets className="w-4 h-4 text-primary" />}
                    {item._type === 'Distillation' && <Flame className="w-4 h-4 text-primary" />}
                    {item._type === 'Bottling' && <Wine className="w-4 h-4 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item._type} — {item.batch_number || item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item._date ? format(new Date(item._date), 'MMM d, yyyy') : '—'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}