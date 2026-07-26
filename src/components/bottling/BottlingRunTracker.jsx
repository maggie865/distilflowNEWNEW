import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Minus, Check, ArrowLeft, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const DRAFT_KEY = (run) => `bottling_draft_${run?.batch_code}_${run?.tank_id}`;

export default function BottlingRunTracker({ run, onComplete, onCancel, isCompleting }) {
  const [started, setStarted] = useState(false);
  const [caseCount, setCaseCount] = useState(0);
  const [tastingCount, setTastingCount] = useState(0);
  const [showFinish, setShowFinish] = useState(false);
  const [extraBottles, setExtraBottles] = useState('0');

  // Load saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY(run));
      if (saved) {
        const draft = JSON.parse(saved);
        if (typeof draft.caseCount === 'number') setCaseCount(draft.caseCount);
        if (typeof draft.tastingCount === 'number') setTastingCount(draft.tastingCount);
        if (typeof draft.extraBottles === 'string') setExtraBottles(draft.extraBottles);
        if (draft.started) {
          setStarted(true);
          toast.info('Resumed your previous bottling run');
        }
      }
    } catch (e) { /* ignore */ }
  }, [run]);

  // Auto-save progress
  useEffect(() => {
    if (!run) return;
    localStorage.setItem(DRAFT_KEY(run), JSON.stringify({ started, caseCount, tastingCount, extraBottles }));
  }, [run, started, caseCount, tastingCount, extraBottles]);

  const bottlesPerCase = run?.bottles_per_case || 6;
  const bottlesMl = run?.bottle_size_ml || 700;
  const caseBottles = caseCount * bottlesPerCase;
  const extraCount = parseInt(extraBottles) || 0;
  const totalFinished = caseBottles + extraCount;
  const spiritConsumed = ((totalFinished + tastingCount) * bottlesMl) / 1000;

  const handleFinish = () => {
    if (caseCount === 0 && extraCount === 0) {
      toast.error('No finished bottles recorded yet');
      return;
    }
    localStorage.removeItem(DRAFT_KEY(run));
    onComplete({
      cases: caseCount,
      extraBottles: extraCount,
      tastingBottles: tastingCount,
    });
  };

  // ── PRE-START SCREEN ──────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="max-w-lg mx-auto p-4 pb-20 space-y-4">
        <Card className="p-5 bg-primary/10 border-primary/20">
          <p className="text-sm text-muted-foreground mb-1">Ready to bottle</p>
          <h2 className="text-2xl font-bold font-display mb-4">{run?.product_name}</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Batch</p><p className="font-semibold">{run?.batch_code}</p></div>
            <div><p className="text-muted-foreground text-xs">Tank</p><p className="font-semibold">{run?.tank_name}</p></div>
            <div><p className="text-muted-foreground text-xs">Bottle Size</p><p className="font-semibold">{bottlesMl}ml</p></div>
            <div><p className="text-muted-foreground text-xs">ABV</p><p className="font-semibold">{run?.abv || '—'}%</p></div>
            <div><p className="text-muted-foreground text-xs">Bottles / Case</p><p className="font-semibold">{bottlesPerCase}</p></div>
            <div><p className="text-muted-foreground text-xs">Available Volume</p><p className="font-semibold">{(run?.available_volume || 0).toFixed(1)}L</p></div>
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
                    <span>{p.name}</span><span>{p.quantity} {p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-12" onClick={() => { localStorage.removeItem(DRAFT_KEY(run)); onCancel(); }}>
            <ArrowLeft className="w-4 h-4 mr-2" />Cancel
          </Button>
          <Button className="flex-1 h-12 text-base font-semibold" onClick={() => setStarted(true)}>
            Start Bottling
          </Button>
        </div>
      </div>
    );
  }

  // ── ACTIVE BOTTLING SCREEN ────────────────────────────────────────────────
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

      {/* Cases counter */}
      <Card className="p-5 text-center bg-gradient-to-b from-primary/5 to-primary/10 border-primary/20">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Cases Produced</p>
        <p className="text-8xl font-bold font-display text-primary leading-none mb-2">{caseCount}</p>
        <p className="text-sm text-muted-foreground mb-4">{caseBottles} bottles</p>
        <div className="flex gap-3">
          <Button onClick={() => setCaseCount(Math.max(0, caseCount - 1))} disabled={caseCount === 0}
            variant="outline" className="flex-1 h-20 text-2xl">
            <Minus className="w-8 h-8" />
          </Button>
          <Button onClick={() => setCaseCount(caseCount + 1)}
            className="flex-1 h-20 text-2xl font-bold bg-primary hover:bg-primary/90">
            <Plus className="w-8 h-8" />
          </Button>
        </div>
      </Card>

      {/* Tasting bottles counter — live running count */}
      <Card className="p-5 text-center bg-amber-50 border-amber-200">
        <div className="flex items-center justify-center gap-2 mb-1">
          <FlaskConical className="w-4 h-4 text-amber-600" />
          <p className="text-xs uppercase tracking-widest text-amber-700 font-semibold">Tasting / Rejected Bottles</p>
        </div>
        <p className="text-6xl font-bold font-display text-amber-600 leading-none mb-2">{tastingCount}</p>
        <p className="text-xs text-amber-600/70 mb-4">Tap each time a bottle is set aside</p>
        <div className="flex gap-3">
          <Button onClick={() => setTastingCount(Math.max(0, tastingCount - 1))} disabled={tastingCount === 0}
            variant="outline" className="flex-1 h-16 text-xl border-amber-300 text-amber-700 hover:bg-amber-100">
            <Minus className="w-6 h-6" />
          </Button>
          <Button onClick={() => setTastingCount(tastingCount + 1)}
            className="flex-1 h-16 text-xl font-bold bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      </Card>

      {/* Live summary */}
      {(caseCount > 0 || tastingCount > 0) && (
        <Card className="p-4 bg-green-50 border-green-200">
          <div className="grid grid-cols-4 gap-3 text-sm text-center">
            <div>
              <p className="text-green-700/60 text-xs">Cases</p>
              <p className="font-bold text-lg text-green-900">{caseCount}</p>
            </div>
            <div>
              <p className="text-green-700/60 text-xs">Finished</p>
              <p className="font-bold text-lg text-green-900">{caseBottles}</p>
            </div>
            <div>
              <p className="text-amber-700/70 text-xs">Tasting</p>
              <p className="font-bold text-lg text-amber-700">{tastingCount}</p>
            </div>
            <div>
              <p className="text-green-700/60 text-xs">Spirit Used</p>
              <p className="font-bold text-lg text-green-900">{spiritConsumed.toFixed(1)}L</p>
            </div>
          </div>
        </Card>
      )}

      {/* Finish button */}
      <Button onClick={() => setShowFinish(true)}
        className="w-full h-14 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700">
        <Check className="w-5 h-5 mr-2" />Finish Bottling
      </Button>

      {/* Finish dialog */}
      <Dialog open={showFinish} onOpenChange={setShowFinish}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Finish Bottling Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Summary */}
            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cases completed</span>
                <span className="font-semibold">{caseCount} ({caseBottles} bottles)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5 text-amber-500" /> Tasting bottles (running count)
                </span>
                <span className="font-semibold text-amber-700">{tastingCount}</span>
              </div>
            </div>

            {/* Extra bottles */}
            <div>
              <Label>Extra bottles (didn't make a full case)</Label>
              <Input type="number" min="0" value={extraBottles}
                onChange={e => setExtraBottles(e.target.value)}
                className="mt-1 text-base h-12" />
              <p className="text-xs text-muted-foreground mt-1">These will be added to your finished goods stock.</p>
            </div>

            {/* Tasting count — editable to correct any mistakes */}
            <div>
              <Label className="flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5 text-amber-500" /> Tasting / rejected bottles
              </Label>
              <Input type="number" min="0"
                value={tastingCount}
                onChange={e => setTastingCount(parseInt(e.target.value) || 0)}
                className="mt-1 text-base h-12 border-amber-300 focus:border-amber-500" />
              <p className="text-xs text-muted-foreground mt-1">Pre-filled from your running count — adjust if needed.</p>
            </div>

            {/* Final summary */}
            <div className="rounded-lg border border-border p-4 text-sm space-y-2">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Will be added to stock</p>
              <div className="flex justify-between">
                <span>Finished goods ({run?.product_name})</span>
                <span className="font-bold">{totalFinished} bottles</span>
              </div>
              {tastingCount > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Tasting stock</span>
                  <span className="font-bold">{tastingCount} bottles</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground text-xs pt-1 border-t border-border">
                <span>Total spirit used</span>
                <span>{spiritConsumed.toFixed(2)}L</span>
              </div>
            </div>

            <Button onClick={handleFinish} disabled={isCompleting}
              className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700">
              {isCompleting ? 'Saving…' : 'Confirm & Update Stock'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}