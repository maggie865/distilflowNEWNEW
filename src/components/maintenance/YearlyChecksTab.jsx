import { useState, useMemo } from 'react';
import { format, parseISO, addYears, differenceInDays } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const YEARLY_ITEMS = [
  'Pressure vessel certification',
  'Electrical safety inspection (WOF)',
  'Fire suppression system service',
  'Emergency exits and signage check',
  'Forklift / pallet jack certification',
  'Gas line inspection',
  'Boiler / heat exchanger certification',
  'Health & Safety audit',
];

const RESULT_DISPLAY = {
  pass: { label: '✅ Pass', cls: 'text-emerald-600' },
  fail: { label: '❌ Fail', cls: 'text-red-600' },
  needs_attention: { label: '⚠ Conditional Pass', cls: 'text-amber-600' },
};

const BORDER = { green: 'border-emerald-300', amber: 'border-amber-300', red: 'border-red-300' };
const STATUS_CLS = { green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600' };

function getYearlyStatus(records, itemName) {
  const matching = records
    .filter(r => r.maintenance_type === 'yearly_check' && r.check_item_name === itemName)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latest = matching[0] || null;
  if (!latest) return { status: 'red', latest: null, label: 'Never inspected' };
  if (!latest.next_due_date) return { status: 'red', latest, label: 'No due date set' };
  const days = differenceInDays(parseISO(latest.next_due_date), new Date());
  if (days < 0) return { status: 'red', latest, label: `Overdue by ${Math.abs(days)} days` };
  if (days <= 60) return { status: 'amber', latest, label: `Due in ${days} days` };
  return { status: 'green', latest, label: `Next due in ${days} days` };
}

export default function YearlyChecksTab({ records, onCreate, saving }) {
  const now = new Date();
  const [expandedItem, setExpandedItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const yearlyRecords = useMemo(() =>
    records.filter(r => r.maintenance_type === 'yearly_check').sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [records]);

  const paginatedHistory = yearlyRecords.slice((page - 1) * pageSize, page * pageSize);
  const overdueCount = YEARLY_ITEMS.filter(item => getYearlyStatus(records, item).status === 'red').length;

  const handleExpand = (itemName) => {
    if (expandedItem === itemName) { setExpandedItem(null); return; }
    setExpandedItem(itemName);
    setFormData({
      date: format(now, 'yyyy-MM-dd'), inspector_name: '', certifier_company: '',
      certificate_number: '', next_due_date: format(addYears(now, 1), 'yyyy-MM-dd'), result: null, notes: '',
    });
  };

  const handleSave = async (itemName) => {
    const f = formData;
    if (!f.inspector_name.trim() || !f.result) { toast.error('Please enter inspector name and select a result'); return; }
    try {
      await onCreate([{
        maintenance_type: 'yearly_check', check_item_name: itemName, equipment_name: itemName,
        date: f.date, inspector_name: f.inspector_name.trim(), certifier_company: f.certifier_company || undefined,
        certificate_number: f.certificate_number || undefined, next_due_date: f.next_due_date, result: f.result,
        notes: f.notes || undefined, performed_by: f.inspector_name.trim(), status: 'completed',
      }]);
      toast.success(`${itemName} — inspection saved`);
      setExpandedItem(null);
    } catch (e) { toast.error('Failed to save: ' + e.message); }
  };

  return (
    <div className="space-y-4">
      {overdueCount > 0 && (
        <Card className="p-4 border-2 border-red-300 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <p className="font-semibold text-sm text-red-800">🔴 {overdueCount} safety {overdueCount === 1 ? 'check is' : 'checks are'} overdue — action required.</p>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {YEARLY_ITEMS.map(item => {
          const { status, latest, label } = getYearlyStatus(records, item);
          return (
            <Card key={item} className={`p-4 border-2 ${BORDER[status]} space-y-2`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{item}</p>
                  {latest ? (
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      <p>Last done: {latest.date ? format(parseISO(latest.date), 'd MMM yyyy') : '—'}</p>
                      <p>Next due: {latest.next_due_date ? format(parseISO(latest.next_due_date), 'd MMM yyyy') : '—'}</p>
                      {latest.certificate_number && <p>Certificate: {latest.certificate_number}</p>}
                      {latest.inspector_name && <p>Inspector: {latest.inspector_name}</p>}
                    </div>
                  ) : <p className="text-xs text-muted-foreground mt-1">No inspection recorded</p>}
                  <p className={`text-sm font-medium mt-1 ${STATUS_CLS[status]}`}>{label}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleExpand(item)}>Log Inspection</Button>
              </div>
              {expandedItem === item && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Date completed</Label><Input type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Next due date</Label><Input type="date" value={formData.next_due_date} onChange={e => setFormData(f => ({ ...f, next_due_date: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Inspector name</Label><Input value={formData.inspector_name} onChange={e => setFormData(f => ({ ...f, inspector_name: e.target.value }))} className="mt-1" /></div>
                    <div><Label className="text-xs">Certifier company</Label><Input value={formData.certifier_company} onChange={e => setFormData(f => ({ ...f, certifier_company: e.target.value }))} className="mt-1" /></div>
                  </div>
                  <div><Label className="text-xs">Certificate number</Label><Input value={formData.certificate_number} onChange={e => setFormData(f => ({ ...f, certificate_number: e.target.value }))} className="mt-1" /></div>
                  <div>
                    <Label className="text-xs">Result</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {['pass', 'fail', 'needs_attention'].map(r => (
                        <button key={r} type="button" onClick={() => setFormData(f => ({ ...f, result: r }))}
                          className={`h-11 rounded-lg text-xs font-medium border-2 ${formData.result === r ? 'border-primary bg-primary/10' : 'border-border'}`}>{RESULT_DISPLAY[r].label}</button>
                      ))}
                    </div>
                  </div>
                  <div><Label className="text-xs">Notes</Label><Textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
                  <Button onClick={() => handleSave(item)} disabled={saving} className="w-full">Save Inspection</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
            <span className="font-semibold text-sm">Yearly Safety Check History</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Check Item</TableHead><TableHead>Inspector</TableHead><TableHead>Cert #</TableHead><TableHead>Next Due</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paginatedHistory.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No yearly checks recorded</TableCell></TableRow>
                  ) : paginatedHistory.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm">{r.check_item_name || '—'}</TableCell>
                      <TableCell className="text-sm">{r.inspector_name || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{r.certificate_number || '—'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.next_due_date ? format(parseISO(r.next_due_date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className={`text-sm ${RESULT_DISPLAY[r.result]?.cls || ''}`}>{RESULT_DISPLAY[r.result]?.label || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="p-4"><Pagination total={yearlyRecords.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}