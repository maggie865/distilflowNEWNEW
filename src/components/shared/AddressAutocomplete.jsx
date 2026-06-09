import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

// Load the Maps script once globally
let scriptStatus = 'idle'; // idle | loading | ready | error
const listeners = [];

function loadMapsScript(apiKey) {
  if (scriptStatus === 'ready') return Promise.resolve();
  if (scriptStatus === 'loading') {
    return new Promise((res, rej) => listeners.push({ res, rej }));
  }
  scriptStatus = 'loading';
  return new Promise((res, rej) => {
    listeners.push({ res, rej });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__mapsReady`;
    script.async = true;
    script.defer = true;
    window.__mapsReady = () => {
      scriptStatus = 'ready';
      listeners.forEach(l => l.res());
      listeners.length = 0;
    };
    script.onerror = (e) => {
      scriptStatus = 'error';
      listeners.forEach(l => l.rej(e));
      listeners.length = 0;
    };
    document.head.appendChild(script);
  });
}

let apiKeyPromise = null;
function getApiKey() {
  if (!apiKeyPromise) {
    apiKeyPromise = base44.functions.invoke('getMapsConfig', {}).then(r => r.data?.apiKey);
  }
  return apiKeyPromise;
}

export default function AddressAutocomplete({ value, onChange, placeholder, className }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [inputVal, setInputVal] = useState(value || '');
  const [status, setStatus] = useState(scriptStatus); // 'idle'|'loading'|'ready'|'error'

  // Keep local input in sync if parent changes value externally
  useEffect(() => {
    setInputVal(value || '');
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (scriptStatus !== 'ready') {
        setStatus('loading');
        try {
          const key = await getApiKey();
          if (!key) throw new Error('No API key');
          await loadMapsScript(key);
        } catch (e) {
          if (!cancelled) setStatus('error');
          return;
        }
      }
      if (cancelled || !inputRef.current) return;
      setStatus('ready');

      // Attach native Google Places Autocomplete to the input
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'nz' },
        fields: ['formatted_address'],
        types: ['address'],
      });
      autocompleteRef.current = ac;

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const addr = place.formatted_address || inputRef.current.value;
        setInputVal(addr);
        onChange(addr);
      });
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    setInputVal(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={inputVal}
        onChange={handleChange}
        placeholder={status === 'loading' ? 'Loading address search…' : (placeholder || 'Start typing an address…')}
        disabled={status === 'loading'}
        autoComplete="off"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
      />
      {status === 'error' && (
        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Address search unavailable — type manually
        </p>
      )}
    </div>
  );
}