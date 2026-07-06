import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Users, MapPin, Pencil, Zap } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import AddressAutocomplete from '@/components/shared/AddressAutocomplete';
import Pagination from '@/components/shared/Pagination';
import { base44 } from '@/api/base44Client';

const EMPTY_FORM = { business_name: '', delivery_address: '' };
const PAGE_SIZE = 50;

export default function Customers() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [currentPage, setCurrentPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const queryClient = useQueryClient();

  const { data: pageResult = { data: [], count: 0 } } = useQuery({
    queryKey: ['customers', currentPage],
    queryFn: () => db.Customer.listPage('business_name', PAGE_SIZE, currentPage * PAGE_SIZE),
  });
  const customers = pageResult.data ?? [];
  const totalCount = pageResult.count ?? 0;

  const createMutation = useMutation({
    mutationFn: () => db.Customer.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setCurrentPage(0);
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success('Customer added');
    },
  });

  const editMutation = useMutation({
    mutationFn: () => db.Customer.update(editingCustomer.id, {
      business_name: editForm.business_name,
      delivery_address: editForm.delivery_address,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditingCustomer(null);
      toast.success('Customer updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.Customer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeletingCustomer(null);
      toast.success('Customer removed');
    },
  });

  const handleImportFromSheets = async () => {
    setIsImporting(true);
    try {
      const res = await base44.functions.invoke('syncCustomersFromSheet', {});
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setCurrentPage(0);
      const d = res.data || {};
      toast.success(`Imported ${d.synced ?? 0} customers (${d.created ?? 0} new, ${d.updated ?? 0} updated)`);
    } catch (err) {
      toast.error('Failed to import from spreadsheet');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Customers" subtitle="Manage your customer directory for dispatch">
        <div className="flex gap-2">
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
          <Button variant="outline" onClick={handleImportFromSheets} disabled={isImporting} className="gap-2">
            <Zap className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import from Sheets'}
          </Button>
        </div>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 max-w-sm">
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-accent border-accent-foreground/10">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">Total Customers</span>
          </div>
          <p className="text-2xl font-bold font-display text-primary">{totalCount}</p>
        </div>
      </div>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business Name</TableHead>
              <TableHead>Delivery Address</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                  No customers yet — add one to get started
                </TableCell>
              </TableRow>
            ) : customers.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-semibold">{c.business_name}</TableCell>
                <TableCell className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  {c.delivery_address}
                </TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setEditingCustomer(c); setEditForm({ business_name: c.business_name, delivery_address: c.delivery_address }); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeletingCustomer(c)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination currentPage={currentPage} totalCount={totalCount} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setForm(EMPTY_FORM); }}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={e => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
          onPointerDownOutside={e => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="font-display">Add Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Business Name</Label>
              <Input
                value={form.business_name}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                placeholder="e.g. Coastal Liquor"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Delivery Address</Label>
              <AddressAutocomplete
                value={form.delivery_address}
                onChange={v => setForm(f => ({ ...f, delivery_address: v }))}
                placeholder="Full delivery address"
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.business_name || !form.delivery_address}
              className="w-full"
            >
              {createMutation.isPending ? 'Saving…' : 'Add Customer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={!!editingCustomer} onOpenChange={v => !v && setEditingCustomer(null)}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={e => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
          onPointerDownOutside={e => { if (e.target?.closest?.('.pac-container')) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="font-display">Edit Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Business Name</Label>
              <Input
                value={editForm.business_name}
                onChange={e => setEditForm(f => ({ ...f, business_name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Delivery Address</Label>
              <AddressAutocomplete
                value={editForm.delivery_address}
                onChange={v => setEditForm(f => ({ ...f, delivery_address: v }))}
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editForm.business_name || !editForm.delivery_address}
              className="w-full"
            >
              {editMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingCustomer} onOpenChange={v => !v && setDeletingCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deletingCustomer?.business_name}</strong> from your customer directory. Existing dispatch records are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deletingCustomer.id)}
              disabled={deleteMutation.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}