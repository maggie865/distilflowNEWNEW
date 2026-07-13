import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function ExciseFlags({ form, setForm, dispatchedFrom }) {
  const isBluff = !(dispatchedFrom || '').includes('Auckland');

  const toggle = (field) => {
    if (field === 'duty_free') {
      setForm(f => ({ ...f, duty_free: !f.duty_free, is_export: false }));
    } else if (field === 'is_export') {
      setForm(f => ({ ...f, is_export: !f.is_export, duty_free: false }));
    } else {
      setForm(f => ({ ...f, [field]: !f[field] }));
    }
  };

  const helperNote = (() => {
    if (isBluff && (form.duty_free || form.is_export)) {
      return '⚠ Duty free and export exemptions only apply to 3PL dispatches. Bluff dispatches are always taxable.';
    }
    if (form.is_sample) return 'Sample dispatch — excise is still payable on samples';
    if (form.duty_free) return 'Duty free — excise exempt. Will be deducted from 3PL transfer LALs in excise return.';
    if (form.is_export) return 'Export dispatch — excise exempt. Will be deducted from 3PL transfer LALs in excise return.';
    return 'Standard dispatch — excise paid';
  })();

  return (
    <div>
      <Label>Excise Classification</Label>
      <div className="flex gap-2 mt-1">
        <Button
          type="button"
          variant={form.is_sample ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggle('is_sample')}
          className={form.is_sample ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' : ''}
        >
          Sample
        </Button>
        <Button
          type="button"
          variant={form.duty_free ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggle('duty_free')}
          className={form.duty_free ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600' : ''}
        >
          Duty Free
        </Button>
        <Button
          type="button"
          variant={form.is_export ? 'default' : 'outline'}
          size="sm"
          onClick={() => toggle('is_export')}
          className={form.is_export ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''}
        >
          Overseas / Export
        </Button>
      </div>
      <p className={`text-xs mt-2 ${helperNote.startsWith('⚠') ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>{helperNote}</p>
    </div>
  );
}