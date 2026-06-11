import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1OxsZShFqlKItv0_bM1U5SpaiUnfUtpWnu5T-jE_OAz8';

// Column order must match the 3PL sheet headers exactly
const HEADERS = [
  'dispatch_date', 'customer_name', 'customer_address', 'product_name',
  'batch_number', 'bottle_size_ml', 'quantity_bottles', 'total_lals',
  'parcel_weight_kg', 'transport_distance_km', 'transport_method', 'co2e_kg',
  'dispatched_from', 'status', 'notes', 'id', 'created_date', 'updated_date',
  'created_by_id', 'created_by', 'is_sample'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const dispatch = body.dispatch || {};

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get first sheet name
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaRes.json();
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';

    // Build row in header order
    const row = HEADERS.map(h => {
      const val = dispatch[h];
      if (val === null || val === undefined) return '';
      return String(val);
    });

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(firstSheet)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!appendRes.ok) {
      const err = await appendRes.text();
      return Response.json({ error: err }, { status: appendRes.status });
    }

    const result = await appendRes.json();
    return Response.json({ success: true, updatedRange: result.updates?.updatedRange });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});