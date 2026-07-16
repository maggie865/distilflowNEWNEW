import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import { ChevronDown, ClipboardList } from 'lucide-react';

export default function LegacyRecords({ records }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const sorted = useMemo(() =>
    [...records].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [records]);

  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  if (sorted.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Other / Legacy Records ({sorted.length})</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Equipment</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {paginated.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">{r.equipment_name || '—'}</TableCell>
                    <TableCell className="text-sm"><Badge variant="secondary">{r.maintenance_type || 'unspecified'}</Badge></TableCell>
                    <TableCell className="text-sm">{r.status || '—'}</TableCell>
                    <TableCell className="text-sm">{r.performed_by || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.description || r.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="p-4"><Pagination total={sorted.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}