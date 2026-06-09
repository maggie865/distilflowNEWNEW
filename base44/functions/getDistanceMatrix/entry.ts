import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { origin, destination } = await req.json();
    if (!origin || !destination) {
      return Response.json({ error: 'origin and destination are required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&units=metric&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK') {
      return Response.json({ error: `Distance Matrix API error: ${data.status}` }, { status: 422 });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return Response.json({ error: `Route not found: ${element?.status || 'UNKNOWN'}` }, { status: 422 });
    }

    const distance_km = Math.round(element.distance.value / 1000);
    const duration_text = element.duration.text;

    return Response.json({ distance_km, duration_text });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});