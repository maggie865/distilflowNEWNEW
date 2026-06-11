import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronUp, Flame, Wine, Droplets, Package2, FlaskConical, Leaf } from 'lucide-react';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';

function StepRow({ icon: Icon, color, label, data, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 pb-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold">{label}</span>
          {data.status && <StatusBadge status={data.status} />}
          {data.date && (
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(data.date), 'MMM d, yyyy')}
            </span>
          )}
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {children}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold text-sm">{value ?? '—'}</p>
    </div>
  );
}

function LotTag({ icon: Icon, color, label, value }) {
  if (!value) return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${color}`}>
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="font-medium">{label}:</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function BatchCard({ batchNumber, distillations, bottlings, subBatches }) {
  const [expanded, setExpanded] = useState(false);

  // Summary stats
  const totalOutLALs = distillations.reduce((s, d) => s + (d.output_lals || 0), 0);
  const totalBottles = bottlings.reduce((s, b) => s + (b.bottles_produced || 0), 0);

  // Collect all unique lot codes across sub-batches for the summary header
  const allEthanolLots = [...new Set([
    ...distillations.map(d => d.ethanol_lot_code).filter(Boolean),
    ...subBatches.map(s => s.ethanol_lot).filter(Boolean),
  ])];
  const allBotanicalLots = [...new Set(
    subBatches.flatMap(s => s.botanical_lots ? s.botanical_lots.split(',').map(l => l.trim()).filter(Boolean) : [])
  )];
  const products = [...new Set([
    ...distillations.map(d => d.product_name),
    ...bottlings.map(b => b.product_name),
  ].filter(Boolean))].join(', ');

  const latestDate = [...distillations, ...bottlings]
    .map(r => r.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{batchNumber}</span>
            {products && <span className="text-sm text-muted-foreground truncate">— {products}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs gap-1">
              <Flame className="w-3 h-3" /> {distillations.length} distillation{distillations.length !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="text-xs gap-1">
              <Wine className="w-3 h-3" /> {bottlings.length} bottling{bottlings.length !== 1 ? 's' : ''}
            </Badge>
            {totalBottles > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Package2 className="w-3 h-3" /> {totalBottles} bottles
              </Badge>
            )}
            {totalOutLALs > 0 && (
              <span className="text-xs text-muted-foreground">{totalOutLALs.toFixed(3)} LALs</span>
            )}
          </div>
          {(allEthanolLots.length > 0 || allBotanicalLots.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {allEthanolLots.map(lot => (
                <span key={lot} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-mono">
                  <FlaskConical className="w-3 h-3" /> {lot}
                </span>
              ))}
              {allBotanicalLots.map(lot => (
                <span key={lot} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-50 border border-green-200 text-green-700 font-mono">
                  <Leaf className="w-3 h-3" /> {lot}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {latestDate && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {format(new Date(latestDate), 'MMM d, yyyy')}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pt-5 pb-2">
          {distillations.map((d, i) => {
            // Match sub-batch: prefer by sub_batch_code, then by index order
            const sub = subBatches.find(s => s.sub_batch_code === d.sub_batch_code)
              || (subBatches.length > i ? subBatches[i] : subBatches[0]);
            const ethanolLot = d.ethanol_lot_code || sub?.ethanol_lot;
            // Only use sub.botanical_lots (not maceration_notes which is free text)
            const botanicalLots = sub?.botanical_lots;

            return (
              <StepRow
                key={d.id}
                icon={Flame}
                color="bg-orange-500"
                label={d.sub_batch_code || `Distillation Run${distillations.length > 1 ? ` #${i + 1}` : ''}`}
                data={d}
              >
                <Stat label="Product" value={d.product_name} />
                <Stat label="Input" value={d.input_volume ? `${d.input_volume}L @ ${d.input_abv}%` : null} />
                <Stat label="Input LALs" value={d.input_lals?.toFixed(3)} />
                <Stat label="Output" value={d.output_volume ? `${d.output_volume}L @ ${d.output_abv}%` : null} />
                <Stat label="Output LALs" value={d.output_lals?.toFixed(3)} />
                <Stat label="Heads" value={d.heads_volume ? `${d.heads_volume}L` : null} />
                <Stat label="Tails" value={d.tails_volume ? `${d.tails_volume}L` : null} />
                <Stat
                  label="LAL Yield"
                  value={d.input_lals > 0 ? `${((d.output_lals / d.input_lals) * 100).toFixed(1)}%` : null}
                />
                {(ethanolLot || botanicalLots) && (
                  <div className="col-span-2 sm:col-span-4 pt-1 border-t border-border mt-1">
                    <p className="text-xs text-muted-foreground mb-1.5 font-medium">Lot Traceability</p>
                    <div className="flex flex-wrap gap-2">
                      <LotTag
                        icon={FlaskConical}
                        color="bg-blue-50 border-blue-200 text-blue-700"
                        label="Ethanol"
                        value={ethanolLot}
                      />
                      {botanicalLots && botanicalLots.split(',').map(lot => lot.trim()).filter(Boolean).map((lot, idx) => (
                        <LotTag
                          key={idx}
                          icon={Leaf}
                          color="bg-green-50 border-green-200 text-green-700"
                          label="Botanical"
                          value={lot}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </StepRow>
            );
          })}

          {bottlings.map((b, i) => (
            <StepRow
              key={b.id}
              icon={Wine}
              color="bg-primary"
              label={`Bottling Run${bottlings.length > 1 ? ` #${i + 1}` : ''}`}
              data={b}
            >
              <Stat label="Product" value={b.product_name} />
              <Stat label="Spirit" value={b.input_volume ? `${b.input_volume}L @ ${b.input_abv}%` : null} />
              <Stat label="LALs" value={b.input_lals?.toFixed(3)} />
              <Stat label="Bottle Size" value={b.bottle_size_ml ? `${b.bottle_size_ml}ml` : null} />
              <Stat label="Bottles Produced" value={b.bottles_produced} />
            </StepRow>
          ))}

          {distillations.length === 0 && (
            <p className="text-xs text-muted-foreground pb-4">No distillation run linked to this batch.</p>
          )}
          {bottlings.length === 0 && (
            <p className="text-xs text-muted-foreground pb-4">No bottling run linked to this batch.</p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function BatchTracker() {
  const [search, setSearch] = useState('');

  const { data: distillations = [], isLoading: loadingD } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => db.DistillationRun.list('-date', 200),
  });

  const { data: bottlings = [], isLoading: loadingB } = useQuery({
    queryKey: ['bottlingRuns'],
    queryFn: () => db.BottlingRun.list('-date', 200),
  });

  const { data: subBatches = [] } = useQuery({
    queryKey: ['subBatches'],
    queryFn: () => db.SubBatch.list('-date', 500),
  });

  const isLoading = loadingD || loadingB;

  // Group everything by batch_number
  const batchMap = {};
  distillations.forEach(d => {
    const key = d.batch_number || '(no batch)';
    if (!batchMap[key]) batchMap[key] = { distillations: [], bottlings: [] };
    batchMap[key].distillations.push(d);
  });
  bottlings.forEach(b => {
    const key = b.batch_number || '(no batch)';
    if (!batchMap[key]) batchMap[key] = { distillations: [], bottlings: [] };
    batchMap[key].bottlings.push(b);
  });

  const batches = Object.entries(batchMap).sort(([a], [b]) => b.localeCompare(a));

  const filtered = search
    ? batches.filter(([key, { distillations: ds, bottlings: bs }]) => {
        const q = search.toLowerCase();
        return key.toLowerCase().includes(q) ||
          ds.some(d => d.product_name?.toLowerCase().includes(q) || d.ethanol_lot_code?.toLowerCase().includes(q)) ||
          bs.some(b => b.product_name?.toLowerCase().includes(q)) ||
          subBatches.some(s => s.master_batch_code === key && (
            s.ethanol_lot?.toLowerCase().includes(q) ||
            s.botanical_lots?.toLowerCase().includes(q)
          ));
      })
    : batches;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader
        title="Batch Tracker"
        subtitle="Full history of each batch from distillation through to bottling"
      />

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by batch number or product name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading batches...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {batches.length === 0
            ? 'No batches yet. Record a distillation or bottling run to get started.'
            : 'No batches match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(([batchNumber, { distillations: ds, bottlings: bs }]) => (
            <BatchCard
              key={batchNumber}
              batchNumber={batchNumber}
              distillations={ds}
              bottlings={bs}
              subBatches={subBatches.filter(s => s.master_batch_code === batchNumber)}
            />
          ))}
        </div>
      )}
    </div>
  );
}