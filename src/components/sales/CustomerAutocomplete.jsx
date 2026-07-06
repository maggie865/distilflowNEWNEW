import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, UserPlus, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function CustomerAutocomplete({ customers, value, onSelect, onAddressChange }) {
  const [inputValue, setInputValue] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (inputValue.trim()) {
      const matches = customers.filter(c =>
        c.business_name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFiltered(matches);
      setIsOpen(true);
      setShowNewForm(false);
    } else {
      setFiltered([]);
      setIsOpen(false);
      setShowNewForm(false);
    }
  }, [inputValue, customers]);

  const handleSelect = (customer) => {
    setInputValue(customer.business_name);
    onSelect(customer.business_name);
    onAddressChange(customer.delivery_address || '');
    setIsOpen(false);
  };

  const handleAddNew = () => {
    setNewName(inputValue);
    setShowNewForm(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await base44.functions.invoke('createCustomerInSheet', {
        business_name: newName.trim(),
        delivery_address: newAddress.trim(),
      });
      if (res.data?.error) {
        toast.error(res.data.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      onSelect(newName.trim());
      onAddressChange(newAddress.trim());
      setInputValue(newName.trim());
      setIsOpen(false);
      setShowNewForm(false);
      setNewName('');
      setNewAddress('');
      toast.success('Customer created and added to Google Sheets');
    } catch (err) {
      toast.error('Failed to create customer');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowNewForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Type to search customers…"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => inputValue && setIsOpen(true)}
        className="mt-1"
      />
      {isOpen && !showNewForm && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 max-h-60 overflow-y-auto">
          {filtered.length > 0 && filtered.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => handleSelect(customer)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-b-0 transition-colors"
            >
              <p className="font-semibold text-sm">{customer.business_name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {customer.delivery_address}
              </p>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No customers found
            </div>
          )}
          <button
            type="button"
            onClick={handleAddNew}
            className="w-full text-left px-3 py-2.5 hover:bg-accent border-t transition-colors flex items-center gap-2 text-primary"
          >
            <UserPlus className="w-4 h-4" />
            <span className="text-sm font-medium">Add new customer</span>
          </button>
        </div>
      )}
      {isOpen && showNewForm && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 p-3 space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Business Name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1"
              placeholder="Business name"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Delivery Address</label>
            <Input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="mt-1"
              placeholder="Delivery address"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1 gap-2"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {creating ? 'Creating…' : 'Create Customer'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setShowNewForm(false); setNewName(''); setNewAddress(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}