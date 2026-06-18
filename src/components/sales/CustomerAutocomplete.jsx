import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

export default function CustomerAutocomplete({ customers, value, onSelect, onAddressChange }) {
  const [inputValue, setInputValue] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const containerRef = useRef(null);

  const selectedCustomer = customers.find(c => c.business_name === value);

  useEffect(() => {
    if (inputValue.trim()) {
      const matches = customers.filter(c =>
        c.business_name.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFiltered(matches);
      setIsOpen(matches.length > 0);
    } else {
      setFiltered([]);
      setIsOpen(false);
    }
  }, [inputValue, customers]);

  const handleSelect = (customer) => {
    setInputValue(customer.business_name);
    onSelect(customer.business_name);
    onAddressChange(customer.delivery_address || '');
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
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
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 max-h-48 overflow-y-auto">
          {filtered.map((customer) => (
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
        </div>
      )}
      {isOpen && inputValue && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 bg-card border border-input rounded-md shadow-lg z-50 mt-1 px-3 py-4 text-sm text-muted-foreground">
          No customers found
        </div>
      )}
    </div>
  );
}