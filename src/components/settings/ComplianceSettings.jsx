import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import { getCurrentExciseRate, EXCISE_RATE_SCHEDULE } from '@/lib/exciseRates';

export default function ComplianceSettings() {
  const rateInfo = getCurrentExciseRate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Excise Rate</CardTitle>
        <CardDescription>NZ Customs excise duty for spirits containing more than 23% vol. — determined automatically by date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-muted-foreground">Current excise rate (spirits &gt;23% vol.):</p>
          <p className="text-2xl font-bold font-mono mt-1">
            ${rateInfo.rate.toFixed(3)} <span className="text-sm font-normal text-muted-foreground">per LAL (GST excl.)</span>
          </p>
          <p className="text-sm text-muted-foreground mt-1">applicable {rateInfo.label}</p>
        </div>
        <p className="text-xs text-muted-foreground">Next scheduled review: July 2027</p>
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Rate history</p>
          <div className="space-y-1">
            {EXCISE_RATE_SCHEDULE.map(r => (
              <div key={r.from} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-mono font-medium">${r.rate.toFixed(3)} / LAL</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The rate is automatically applied to each month's Excise Return based on the selected month. No manual override is available to prevent compliance errors.
        </p>
      </CardContent>
    </Card>
  );
}