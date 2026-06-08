import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, RefreshCw } from 'lucide-react';

// Distillery origin — update this to your actual address
const DISTILLERY_ADDRESS = '10 Tawa Drive, Albany, Auckland, New Zealand';

export default function DeliveryMap({ dispatches, customers }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [geocoded, setGeocoded] = useState({}); // address -> {lat, lng}
  const [distilleryCoords, setDistilleryCoords] = useState(null);
  const [error, setError] = useState(null);

  // Load the Maps JS SDK once (fetch key from backend)
  useEffect(() => {
    if (window.google?.maps) { initMap(); return; }

    base44.functions.invoke('getMapsConfig', {}).then(res => {
      const apiKey = res.data?.apiKey;
      if (!apiKey) { setError('Maps API key not configured'); return; }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.onload = initMap;
      script.onerror = () => setError('Failed to load Google Maps');
      document.head.appendChild(script);
    });
  }, []);

  const initMap = () => {
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: -36.85, lng: 174.76 }, // Auckland default
      zoom: 7,
      mapTypeControl: false,
      streetViewControl: false,
    });
    geocodeAll();
  };

  const geocodeAll = async () => {
    setLoading(true);
    setError(null);

    // Geocode distillery
    const distRes = await base44.functions.invoke('geocodeAddress', { address: DISTILLERY_ADDRESS });
    if (!distRes.data?.lat) { setError('Could not geocode distillery address'); setLoading(false); return; }
    setDistilleryCoords(distRes.data);

    // Collect unique customer addresses from dispatch history
    const addresses = [...new Set(
      dispatches
        .filter(d => d.customer_address)
        .map(d => d.customer_address)
    )];

    const results = {};
    await Promise.all(addresses.map(async (addr) => {
      const r = await base44.functions.invoke('geocodeAddress', { address: addr });
      if (r.data?.lat) results[addr] = r.data;
    }));

    setGeocoded(results);
    setLoading(false);
  };

  // Place markers whenever geocoded data or map changes
  useEffect(() => {
    if (!mapInstanceRef.current || !distilleryCoords) return;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    // Distillery marker (amber/primary)
    const distMarker = new window.google.maps.Marker({
      position: { lat: distilleryCoords.lat, lng: distilleryCoords.lng },
      map: mapInstanceRef.current,
      title: 'Distillery',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#c2600a',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });
    const distInfo = new window.google.maps.InfoWindow({ content: '<strong>🏭 Distillery</strong>' });
    distMarker.addListener('click', () => distInfo.open(mapInstanceRef.current, distMarker));
    markersRef.current.push(distMarker);
    bounds.extend({ lat: distilleryCoords.lat, lng: distilleryCoords.lng });

    // Customer markers
    Object.entries(geocoded).forEach(([addr, coords]) => {
      // Find dispatches to this address
      const customerDispatches = dispatches.filter(d => d.customer_address === addr);
      const customerName = customerDispatches[0]?.customer_name || addr;
      const totalBottles = customerDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);

      const marker = new window.google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: mapInstanceRef.current,
        title: customerName,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#3b82f6',
          fillOpacity: 0.9,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });

      const info = new window.google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif;min-width:140px">
          <strong>${customerName}</strong><br/>
          <span style="color:#666;font-size:12px">${addr}</span><br/>
          <span style="font-size:12px">📦 ${totalBottles} bottles dispatched</span>
        </div>`,
      });
      marker.addListener('click', () => info.open(mapInstanceRef.current, marker));
      markersRef.current.push(marker);
      bounds.extend({ lat: coords.lat, lng: coords.lng });
    });

    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 });
    }
  }, [geocoded, distilleryCoords]);

  const uniqueCustomers = Object.keys(geocoded).length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">Delivery Map</h2>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-primary" />
                Distillery
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                {uniqueCustomers} customer{uniqueCustomers !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={geocodeAll} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 mb-3">{error}</div>
      )}

      <div className="relative rounded-lg overflow-hidden border" style={{ height: '420px' }}>
        <div ref={mapRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Geocoding addresses…</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}