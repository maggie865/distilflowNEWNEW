import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { ChevronDown, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';

const MONTHLY_ITEMS = [
  'Still condition inspection',
  'Condenser check',
  'Pump seals and fittings',
  'Safety valve test',
  'Tank level sensor calibration',
  'Fire extinguisher check',
  'First aid kit check',
  'Chemical storage inspection',
];

const RESULT_DISPLAY = {
  pass: { label: '✅ Pass', cls: 'text-emerald-600' },
  fail: { label: '❌ Fail', cls: 'text-red-600' },
  needs_attention: { label: '⚠ Needs Attention', cls: 'text-amber-600' },
};

const BORDER = { green: 'border-emerald-300', amber: 'border-amber-300', red: 'border-red-300' };

export default function MonthlyChecksTab({ records, onCreate, saving }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(format(now, 'yyyy-MM'));
  const [expandedItem, setExpandedItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const monthlyRecords = useMemo(() =>
    records.filter(r => r.maintenance_type === 'monthly_check').sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [records]);

  const paginatedHistory = monthlyRecords.slice((page - 1) * pageSize, page * pageSize);

  const completedCount = MONTHLY_ITEMS.filter(item =>
    records.some(r => r.maintenance_type === 'monthly_check' && r.check_item_name === item && r.date?.startsWith(selectedMonth))
  ).length;

  const getMonthlyStatus = (itemName) => {
    const record = records.find(r => r.maintenance_type === 'monthly_check' && r.check_item_name === itemName && r.date?.startsWith(selectedMonth));
    if (record) return { status: 'green', record };
    if (selectedMonth < format(now, 'yyyy-MM')) return { status: 'red', record: null };
    return { status: 'amber', record: null };
  };

  const handleExpand = (itemName) => {
    if (expandedItem === itemName) { setExpandedItem(null); return; }
    setExpandedItem(itemName);
    setFormData({ date: format(now, 'yyyy-MM-dd'), result: null, notes: '', performed_by: '' });
  };

  const handleSave = async (itemName) => {
    const f = formData;
    if (!f.result || !f.performed_by.trim()) { toast.error('Please select a result and enter your name'); return; }
    try {
      await onCreate([{
        maintenance_type: 'monthly_check', check_item_name: itemName, equipment_name: itemName,
        date: f.date, result: f.result, notes: f.notes || undefined, performed_by: f.performed_by.trim(), status: 'completed',
      }]);
      toast.success(`${itemName} — check saved`);
      setExpandedItem(null);
    } catch (e) { toast.error('Failed to save: ' + e.message); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <CalendarCheck className="w-5 h-5 text-primary" />
          <div><Label className="text-xs">Month</Label><Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-40" /></div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{completedCount} of {MONTHLY_ITEMS.length} checks completed</span>
            <span className="text-muted-foreground">{Math.round(completedCount / MONTHLY_ITEMS.length * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${completedCount / MONTHLY_ITEMS.length * 100}%` }} />
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3">
        {MONTHLY_ITEMS.map(item => {
          const { status, record } = getMonthlyStatus(item);
          return (
            <Card key={item} className={`p-4 border-2 ${BORDER[status]} space-y-2`}>
              <p className="font-semibold text-sm">{item}</p>
              {record ? (
                <>
                  <p className="text-sm text-emerald-600 font-medium">✅ Completed</p>
                  <p className="text-xs text-muted-foreground">{record.date ? format(parseISO(record.date), 'd MMM') : ''} — {record.performed_by}</p>
                  <p className={`text-xs ${RESULT_DISPLAY[record.result]?.cls}`}>Result: {RESULT_DISPLAY[record.result]?.label || '—'}</p>
                </>
              ) : (
                <>
                  <p className={`text-sm font-medium ${status === 'red' ? 'text-red-600' : 'text-amber-600'}`}>{status === 'red' ? '🔴 Overdue' : '⚠ Due this month'}</p>
                  <Button variant="outline" size="sm" onClick={() => handleExpand(item)} className="mt-1">Log Check</Button>
                </>
              )}
              {expandedItem === item && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <div><Label className="text-xs">Date</Label><Input type="date" value={formData.date} onChange={e => setFormData(f => ({ ...f, date: e.target.value }))} className="mt-1" /></div>
                  <div>
                    <Label className="text-xs">Result</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {['pass', 'fail', 'needs_attention'].map(r => (
                        <button key={r} type="button" onClick={() => setFormData(f => ({ ...f, result: r }))}
                          className={`h-11 rounded-lg text-xs font-medium border-2 ${formData.result === r ? 'border-primary bg-primary/10' : 'border-border'}`}>{RESULT_DISPLAY[r].label}</button>
                      ))}
                    </div>
                  </div>
                  <div><Label className="text-xs">Notes (optional)</Label><Textarea value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" /></div>
                  <div><Label className="text-xs">Completed by</Label><Input value={formData.performed_by} onChange={e => setFormData(f => ({ ...f, performed_by: e.target.value }))} className="mt-1" /></div>
                  <Button onClick={() => handleSave(item)} disabled={saving} className="w-full">Save</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
            <span className="font-semibold text-sm">View Previous Monthly Checks</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Check Item</TableHead><TableHead>Result</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paginatedHistory.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No monthly checks recorded</TableCell></TableRow>
                  ) : paginatedHistory.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm">{r.check_item_name || '—'}</TableCell>
                      <TableCell className={`text-sm ${RESULT_DISPLAY[r.result]?.cls || ''}`}>{RESULT_DISPLAY[r.result]?.label || '—'}</TableCell>
                      <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="p-4"><Pagination total={monthlyRecords.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}