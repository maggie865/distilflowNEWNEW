import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1LQFdgn4baMP-XRNMThNCHXHRmTzyyFxWvMk9S9xfvps';

// 'input_volume' matches the sheet's column header
const HEADERS = [
  'date', 'batch_number', 'type', 'input_volume', 'input_abv', 'input_lals',
  'water_added', 'output_volume', 'output_abv', 'output_lals', 'status', 'notes',
  'id', 'created_date'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const dilution = body.dilution || {};

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaRes.json();
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';

    const row = HEADERS.map(h => {
      const val = dilution[h];
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