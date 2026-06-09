import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';

// Module-level state so we only load the script once
let mapsState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let mapsCallbacks = [];

function onMapsReady(cb) {
  if (mapsState === 'ready') { cb(); return; }
  if (mapsState === 'error') return;
  mapsCallbacks.push(cb);
  if (mapsState === 'idle') initMaps();
}

async function initMaps() {
  mapsState = 'loading';
  try {
    const res = await base44.functions.invoke('getMapsConfig', {});
    const apiKey = res.data?.apiKey;
    if (!apiKey) throw new Error('No API key returned');

    await new Promise((resolve, reject) => {
      // Don't load twice if already present
      if (window.google?.maps?.places) { resolve(); return; }
      const existing = document.querySelector('script[data-maps]');
      if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.dataset.maps = 'true';
      script.addEventListener('load', resolve);
      script.addEventListener('error', reject);
      document.head.appendChild(script);
    });

    mapsState = 'ready';
    mapsCallbacks.forEach(cb => cb());
    mapsCallbacks = [];
  } catch (err) {
    console.error('AddressAutocomplete: failed to load Google Maps', err);
    mapsState = 'error';
    mapsCallbacks = [];
  }
}

export default function AddressAutocomplete({ value, onChange, placeholder, className }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [ready, setReady] = useState(mapsState === 'ready');
  const serviceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    onMapsReady(() => {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    onChange(val);

    if (!val || val.length < 3 || !serviceRef.current) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    serviceRef.current.getPlacePredictions(
      { input: val, componentRestrictions: { country: 'nz' } },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
          setSuggestions(predictions);
          setShowDropdown(true);
        } else {
          setSuggestions([]);
          setShowDropdown(false);
        }
      }
    );
  };

  const handleSelect = (prediction) => {
    onChange(prediction.description);
    setSuggestions([]);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder={ready ? (placeholder || 'Start typing an address…') : 'Loading maps…'}
          className={className}
          autoComplete="off"
          disabled={!ready}
        />
        {!ready && mapsState === 'loading' && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <span className="leading-snug">{s.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}