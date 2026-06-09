import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

let googleMapsLoaded = false;
let loadingPromise = null;

async function loadGoogleMaps() {
  if (googleMapsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const res = await base44.functions.invoke('getMapsConfig', {});
    const apiKey = res.data?.apiKey;
    if (!apiKey) throw new Error('No Maps API key');

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    googleMapsLoaded = true;
  })();

  return loadingPromise;
}

export default function AddressAutocomplete({ value, onChange, placeholder, className }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const autocompleteService = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
    }).catch(() => {});
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

    if (!val || val.length < 3 || !autocompleteService.current) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    autocompleteService.current.getPlacePredictions(
      { input: val, componentRestrictions: { country: 'nz' } },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
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
      <Input
        value={value}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder || 'Full delivery address'}
        className={className}
        autoComplete="off"
      />
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