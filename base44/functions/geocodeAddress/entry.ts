import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { address } = await req.json();
    if (!address) return Response.json({ error: 'address is required' }, { status: 400 });

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return Response.json({ error: `Geocoding failed: ${data.status}` }, { status: 422 });
    }

    const { lat, lng } = data.results[0].geometry.location;
    return Response.json({ lat, lng, formatted_address: data.results[0].formatted_address });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});