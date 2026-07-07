import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1arE8wVEyq3wKuqfpZ2pwNx6ZmpZtIHvPY-mzVmFjWng';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // First get spreadsheet metadata to find sheet names
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      return Response.json({ error: `Metadata error: ${err}` }, { status: metaRes.status });
    }

    const meta = await metaRes.json();
    const sheetNames = meta.sheets?.map(s => s.properties?.title) || [];
    const firstSheet = sheetNames[0] || 'Sheet1';

    // Read all data
    const range = encodeURIComponent(`${firstSheet}!A1:Z5000`);
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Read error: ${err}` }, { status: res.status });
    }

    const json = await res.json();
    const rows = json.values || [];

    if (rows.length < 2) {
      return Response.json({ dispatches: [], headers: rows[0] || [], sheetNames });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const dispatches = rows.slice(1).map((row, idx) => {
      const obj = { _row_index: idx + 2 };
      headers.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? row[i] : '';
      });
      return {
        ...obj,
        quantity_bottles: obj.quantity_bottles ? parseFloat(obj.quantity_bottles) : null,
        total_lals: obj.total_lals ? parseFloat(obj.total_lals) : null,
        parcel_weight_kg: obj.parcel_weight_kg ? parseFloat(obj.parcel_weight_kg) : null,
        transport_distance_km: obj.transport_distance_km ? parseFloat(obj.transport_distance_km) : null,
        co2e_kg: obj.co2e_kg ? parseFloat(obj.co2e_kg) : null,
        bottle_size_ml: obj.bottle_size_ml ? parseFloat(obj.bottle_size_ml) : null,
        _source: 'sheet',
      };
    }).filter(d => d.dispatch_date && d.customer_name);

    return Response.json({ dispatches, total: dispatches.length, sheetNames, headers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});