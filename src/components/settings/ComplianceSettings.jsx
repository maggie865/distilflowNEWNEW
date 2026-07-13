import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

export default function ComplianceSettings() {
  const qc = useQueryClient();
  const [rate, setRate] = useState('57.96');
  const [saving, setSaving] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });

  const existingSetting = settings.find(s => s.key === 'excise_rate_per_lal');
  const currentRate = existingSetting ? parseFloat(existingSetting.value) : 57.96;

  useEffect(() => {
    setRate(existingSetting ? existingSetting.value : '57.96');
  }, [existingSetting?.id, existingSetting?.value]);

  const handleSave = async () => {
    const parsed = parseFloat(rate);
    if (isNaN(parsed) || parsed <= 0) {
      toast.error('Please enter a valid excise rate');
      return;
    }
    setSaving(true);
    try {
      if (existingSetting) {
        await base44.entities.AppSettings.update(existingSetting.id, { value: rate });
      } else {
        await base44.entities.AppSettings.create({ key: 'excise_rate_per_lal', value: rate });
      }
      qc.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Excise rate updated');
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Excise Rate</CardTitle>
        <CardDescription>NZ Customs excise duty rate per LAL (litre of absolute alcohol). Update when NZ Customs changes the rate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Excise Rate (NZ$ / LAL)</Label>
          <div className="flex items-center gap-3 mt-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className="pl-7 w-32"
              />
            </div>
            <span className="text-sm text-muted-foreground">per LAL</span>
            <Button onClick={handleSave} disabled={saving || !rate} className="gap-2">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Current rate: ${currentRate.toFixed(2)} / LAL. This rate is used in the Excise Return report to calculate duty payable.
        </p>
      </CardContent>
    </Card>
  );
}