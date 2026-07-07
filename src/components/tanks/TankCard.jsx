import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowRightLeft, MapPin, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const purposeLabels = {
  maceration_dilution: 'Maceration / Dilution',
  final_product_storage: 'Final Product Storage',
  diluted_ethanol: 'Diluted Ethanol',
  spare: 'Spare',
};

const purposeColors = {
  maceration_dilution: 'bg-amber-500',
  final_product_storage: 'bg-primary',
  diluted_ethanol: 'bg-blue-500',
  spare: 'bg-muted-foreground',
};

const statusStyles = {
  empty: 'text-muted-foreground',
  in_use: 'text-emerald-600',
  cleaning: 'text-amber-600',
};

export default function TankCard({ tank, onTransfer }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const fillPct = tank.capacity_litres > 0
    ? Math.min(100, Math.round((tank.current_volume || 0) / tank.capacity_litres * 100))
    : 0;

  const barColor = purposeColors[tank.purpose] || 'bg-primary';

  const toggleReady = useMutation({
    mutationFn: async (newValue) => {
      await db.StorageTank.update(tank.id, { is_ready_for_bottling: newValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleToggle = (checked) => {
    toggleReady.mutate(checked);
  };

  const isFinishingTank = tank.purpose === 'final_product_storage';
  const canToggleReady = isAdmin && isFinishingTank;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-display font-bold text-foreground">Tank {tank.name}</span>
            <span className={cn('text-xs font-medium capitalize', statusStyles[tank.status])}>
              ● {tank.status?.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="capitalize">{tank.location}</span>
            <span className="mx-1">·</span>
            <span>{tank.capacity_litres}L capacity</span>
          </div>
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {purposeLabels[tank.purpose]}
        </Badge>
      </div>

      {/* Fill bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{tank.current_volume || 0}L filled</span>
          <span>{fillPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="text-right text-xs text-muted-foreground mt-0.5">{tank.capacity_litres}L max</div>
      </div>

      {/* Contents */}
      {tank.status === 'in_use' && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
          {tank.current_product && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{tank.current_product}</span>
            </div>
          )}
          {tank.current_batch && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batch</span>
              <span className="font-mono font-medium">{tank.current_batch}</span>
            </div>
          )}
          {tank.current_abv && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">ABV</span>
              <span className="font-medium">{tank.current_abv}%</span>
            </div>
          )}
        </div>
      )}

      {/* Ready for Bottling toggle — admin only, finishing tanks only */}
      {isFinishingTank && (
        <div className={cn(
          'flex items-center justify-between rounded-lg border px-3 py-2',
          tank.is_ready_for_bottling
            ? 'border-green-300 bg-green-50'
            : 'border-border bg-muted/30'
        )}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn('w-4 h-4', tank.is_ready_for_bottling ? 'text-green-600' : 'text-muted-foreground')} />
            <span className="text-xs font-medium">
              {tank.is_ready_for_bottling ? 'Ready for bottling' : 'Not ready for bottling'}
            </span>
          </div>
          {isAdmin ? (
            <Switch
              checked={!!tank.is_ready_for_bottling}
              onCheckedChange={handleToggle}
              disabled={!canToggleReady || toggleReady.isPending}
            />
          ) : (
            <span className={cn('text-xs font-semibold', tank.is_ready_for_bottling ? 'text-green-600' : 'text-muted-foreground')}>
              {tank.is_ready_for_bottling ? '✓' : '—'}
            </span>
          )}
        </div>
      )}

      {/* Transfer button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 mt-auto"
        onClick={() => onTransfer(tank)}
        disabled={tank.status === 'cleaning'}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        Transfer / Update
      </Button>
    </div>
  );
}