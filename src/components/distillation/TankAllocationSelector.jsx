import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';

/**
 * Per-tank ethanol allocation selector.
 * Lets the distiller pick how many litres to draw from each ethanol-holding tank.
 *
 * Props:
 *  - ethanolTanks: StorageTank[] filtered to ethanol-holding tanks in use
 *  - allocations: [{ tank_id, tank_name, volume, abv }]
 *  - onChange: (allocations) => void
 *  - disabled: boolean (editing existing run)
 */
export default function TankAllocationSelector({ ethanolTanks, allocations, onChange, disabled }) {
  const getAlloc = (tankId) => allocations.find(a => a.tank_id === tankId);

  const toggleTank = (tank, checked) => {
    if (checked) {
      onChange([
        ...allocations,
        { tank_id: tank.id, tank_name: tank.name, volume: '', abv: tank.current_abv || '' },
      ]);
    } else {
      onChange(allocations.filter(a => a.tank_id !== tank.id));
    }
  };

  const updateVolume = (tankId, volume) => {
    onChange(allocations.map(a => a.tank_id === tankId ? { ...a, volume } : a));
  };
  const updateAbv = (tankId, abv) => {
    onChange(allocations.map(a => a.tank_id === tankId ? { ...a, abv } : a));
  };

  const totalAllocated = allocations.reduce((s, a) => s + (parseFloat(a.volume) || 0), 0);
  const totalAvailable = ethanolTanks
    .filter(t => allocations.some(a => a.tank_id === t.id))
    .reduce((s, t) => s + (t.current_volume || 0), 0);

  // Weighted average ABV across allocated volumes
  const weightedAbv = (() => {
    let volSum = 0, lalSum = 0;
    for (const a of allocations) {
      const v = parseFloat(a.volume) || 0;
      const abv = parseFloat(a.abv) || 0;
      if (v > 0 && abv > 0) { volSum += v; lalSum += v * abv / 100; }
    }
    return volSum > 0 ? (lalSum / volSum) * 100 : 0;
  })();
  const totalLals = totalAllocated * weightedAbv / 100;

  return (
    <div className="space-y-2">
      {ethanolTanks.length === 0 ? (
        <div className="px-3 py-4 rounded-md border border-border text-xs text-muted-foreground text-center">
          No ethanol tanks in use
        </div>
      ) : (
        <div className="space-y-2 border border-input rounded-md p-3 bg-muted/30 max-h-72 overflow-y-auto">
          {ethanolTanks.map(t => {
            const alloc = getAlloc(t.id);
            const selected = !!alloc;
            const vol = parseFloat(alloc?.volume) || 0;
            const available = t.current_volume || 0;
            const over = vol > available;
            return (
              <div key={t.id} className="space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={(e) => toggleTank(t, e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm flex-1">
                    <span className="font-semibold">Tank {t.name}</span>
                    {' — '}{available.toFixed(1)}L @ {t.current_abv?.toFixed(1)}% ABV
                    {t.current_batch && <span className="text-muted-foreground ml-1 text-xs">· {t.current_batch}</span>}
                  </span>
                </label>
                {selected && !disabled && (
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 pl-6">
                    <div>
                      <Label className="text-xs">Volume (L)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={alloc?.volume || ''}
                        onChange={e => updateVolume(t.id, e.target.value)}
                        className={`h-8 text-sm ${over ? 'border-destructive ring-1 ring-destructive' : ''}`}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ABV %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={alloc?.abv || ''}
                        onChange={e => updateAbv(t.id, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-end text-xs text-muted-foreground pb-1.5">
                      {over
                        ? <span className="text-destructive font-medium">exceeds tank</span>
                        : vol > 0
                          ? <span>{((vol / available) * 100).toFixed(0)}% of tank</span>
                          : <span>&nbsp;</span>}
                    </div>
                  </div>
                )}
                {selected && disabled && (
                  <div className="pl-6 text-xs text-muted-foreground">
                    {vol}L @ {alloc?.abv || t.current_abv?.toFixed(1)}% ABV
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {allocations.length > 0 && (
        <div className="mt-2 text-xs space-y-1 rounded-md border border-primary/20 bg-primary/5 p-2">
          <p className="text-primary font-medium">
            Total allocated: {totalAllocated.toFixed(2)}L
            {totalAvailable > 0 && ` of ${totalAvailable.toFixed(1)}L available`}
          </p>
          {totalAllocated > 0 && (
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              {totalAllocated.toFixed(2)}L @ avg {weightedAbv.toFixed(1)}% = {totalLals.toFixed(3)} LALs
            </p>
          )}
        </div>
      )}
    </div>
  );
}