import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Minus, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function BottlingRunTracker({ run, onComplete, onCancel, isCompleting }) {
  const [started, setStarted] = useState(false);
  const [caseCount, setCaseCount] = useState(0);
  const [showFinish, setShowFinish] = useState(false);
  const [extraBottles, setExtraBottles] = useState('0');
  const [tastingBottles, setTastingBottles] = useState('0');

  const bottlesPerCase = run?.bottles_per_case || 6;
  const bottlesMl = run?.bottle_size_ml || 700;
  const caseBottles = caseCount * bottlesPerCase;
  const extraCount = parseInt(extraBottles) || 0;
  const tastingCount = parseInt(tastingBottles) || 0;
  const totalBottles = caseBottles + extraCount;
  const spiritConsumed = (totalBottles * bottlesMl) / 1000;

  const handleFinish = () => {
    if (caseCount === 0 && extraCount === 0) {
      toast.error('No bottles recorded yet');
      return;
    }
    onComplete({
      cases: caseCount,
      extraBottles: extraCount,
      tastingBottles: tastingCount,
    });
  };

  // Pre-start screen
  if (!started) {
    return (
      <div className="max-w-lg mx-auto p-4 pb-20 space-y-4">
        <Card className="p-5 bg-primary/10 border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Ready to bottle</p>
          <h2 className="text-2xl font-bold font-display mb-4">{run?.product_name}</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Batch</p>
              <p className="font-semibold">{run?.batch_code}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tank</p>
              <p className="font-semibold">{run?.tank_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Bottle Size</p>
              <p className="font-semibold">{bottlesMl}ml</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ABV</p>
              <p className="font-semibold">{run?.abv || '—'}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Bottles / Case</p>
              <p className="font-semibold">{bottlesPerCase}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Available Volume</p>
              <p className="font-semibold">{(run?.available_volume || 0).toFixed(1)}L</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold mb-2">Production Team</h3>
          <div className="flex flex-wrap gap-2">
            {(run?.staff || []).map((name, i) => (
              <Badge key={i} variant="secondary" className="px-3 py-1">{name}</Badge>
            ))}
          </div>
        </Card>

        {run?.recipe && (
          <Card className="p-4">
            <h3 className="font-semibold mb-2">Packaging Recipe: {run.recipe.name}</h3>
            {run.recipe.packaging?.length > 0 && (
              <div className="space-y-1">
                {run.recipe.packaging.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm text-muted-foreground">
                    <span>{p.name}</span>
                    <span>{p.quantity} {p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>
            <ArrowLeft className="w-4 h-4 mr-2" />Cancel
          </Button>
          <Button
            className="flex-1 h-12 text-base font-semibold"
            onClick={() => setStarted(true)}
          >
            Start Bottling
          </Button>
        </div>
      </div>
    );
  }

  // Active bottling screen
  return (
    <div className="max-w-lg mx-auto p-4 pb-20 space-y-4">
      {/* Run header */}
      <Card className="p-4 bg-primary/10 border-primary/20">
        <p className="text-xs text-muted-foreground">{run?.batch_code} · {bottlesMl}ml · {bottlesPerCase} btls/case</p>
        <h2 className="text-xl font-bold font-display">{run?.product_name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(run?.staff || []).map((name, i) => (
            <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
          ))}
        </div>
      </Card>

      {/* Big case counter */}
      <Card className="p-6 text-center bg-gradient-to-b from-primary/5 to-primary/10 border-primary/20">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Cases Produced</p>
        <p className="text-8xl font-bold font-display text-primary leading-none mb-6">{caseCount}</p>
        <p className="text-sm text-muted-foreground mb-6">{caseBottles} bottles so far</p>

        <div className="flex gap-3 mb-0">
          <Button
            onClick={() => setCaseCount(Math.max(0, caseCount - 1))}
            disabled={caseCount === 0}
            variant="outline"
            className="flex-1 h-20 text-2xl"
          >
            <Minus className="w-8 h-8" />
          </Button>
          <Button
            onClick={() => setCaseCount(caseCount + 1)}
            className="flex-1 h-20 text-2xl font-bold bg-primary hover:bg-primary/90"
          >
            <Plus className="w-8 h-8" />
          </Button>
        </div>
      </Card>

      {/* Live summary */}
      {caseCount > 0 && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="grid grid-cols-3 gap-3 text-sm text-center">
            <div>
              <p className="text-green-700/60 text-xs">Cases</p>
              <p className="font-bold text-lg text-green-900">{caseCount}</p>
            </div>
            <div>
              <p className="text-green-700/60 text-xs">Bottles</p>
              <p className="font-bold text-lg text-green-900">{caseBottles}</p>
            </div>
            <div>
              <p className="text-green-700/60 text-xs">Spirit Used</p>
              <p className="font-bold text-lg text-green-900">{spiritConsumed.toFixed(1)}L</p>
            </div>
          </div>
        </Card>
      )}

      {/* Finish button */}
      <Button
        onClick={() => setShowFinish(true)}
        className="w-full h-14 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700"
      >
        <Check className="w-5 h-5 mr-2" />
        Finish Bottling
      </Button>

      {/* Finish dialog */}
      <Dialog open={showFinish} onOpenChange={setShowFinish}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Finish Bottling Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Summary */}
            <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cases completed</span>
                <span className="font-semibold">{caseCount} ({caseBottles} bottles)</span>
              </div>
            </div>

            <div>
              <Label>Extra bottles (didn't make a full case)</Label>
              <Input
                type="number"
                min="0"
                value={extraBottles}
                onChange={e => setExtraBottles(e.target.value)}
                className="mt-1 text-base h-12"
              />
              <p className="text-xs text-muted-foreground mt-1">These will be added to your finished goods stock.</p>
            </div>

            <div>
              <Label>Rejected → Tasting bottles</Label>
              <Input
                type="number"
                min="0"
                value={tastingBottles}
                onChange={e => setTastingBottles(e.target.value)}
                className="mt-1 text-base h-12"
              />
              <p className="text-xs text-muted-foreground mt-1">These will be added to a separate tasting stock record.</p>
            </div>

            {/* Final summary */}
            <div className="rounded-lg border border-border p-4 text-sm space-y-2">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Will be added to stock</p>
              <div className="flex justify-between">
                <span>Finished goods ({run?.product_name})</span>
                <span className="font-bold">{caseBottles + extraCount} bottles</span>
              </div>
              {tastingCount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tasting stock</span>
                  <span className="font-bold">{tastingCount} bottles</span>
                </div>
              )}
            </div>

            <Button
              onClick={handleFinish}
              disabled={isCompleting}
              className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
            >
              {isCompleting ? 'Saving…' : 'Confirm & Update Stock'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}