import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1LQFdgn4baMP-XRNMThNCHXHRmTzyyFxWvMk9S9xfvps';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      const err = await metaRes.text();
      return Response.json({ error: `Metadata error: ${err}` }, { status: metaRes.status });
    }
    const meta = await metaRes.json();
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';

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
      return Response.json({ dilutions: [], headers: rows[0] || [] });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const dilutions = rows.slice(1).map((row, idx) => {
      const obj = { _row_index: idx + 2 };
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      // Normalise: sheet uses 'input_volume', app uses 'input_ethanol_volume'
      const inputVol = obj.input_volume || obj.input_ethanol_volume || '';
      return {
        ...obj,
        input_ethanol_volume: inputVol ? parseFloat(inputVol) : null,
        input_abv: obj.input_abv ? parseFloat(obj.input_abv) : null,
        input_lals: obj.input_lals ? parseFloat(obj.input_lals) : null,
        water_added: obj.water_added ? parseFloat(obj.water_added) : null,
        output_volume: obj.output_volume ? parseFloat(obj.output_volume) : null,
        output_abv: obj.output_abv ? parseFloat(obj.output_abv) : null,
        output_lals: obj.output_lals ? parseFloat(obj.output_lals) : null,
        _source: 'sheet',
      };
    }).filter(d => d.date && d.batch_number);

    return Response.json({ dilutions, total: dilutions.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});