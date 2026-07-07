import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1l2H2jLZXBPLlkNIZWI-7dO6zXBsC37zax1FYSvazE_o';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get sheet metadata
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      const err = await metaRes.text();
      return Response.json({ error: `Metadata error: ${err}` }, { status: metaRes.status });
    }
    const meta = await metaRes.json();
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';

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
      return Response.json({ records: [], headers: rows[0] || [] });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[\s\/]+/g, '_'));

    const records = rows.slice(1).map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
      return {
        _row_index: idx + 2,
        // Map common column name variations
        material_name: obj.material_name || obj.material || obj.name || obj.product || '',
        material_type: obj.material_type || obj.type || obj.category || '',
        quantity: obj.quantity ? parseFloat(obj.quantity) : null,
        unit: obj.unit || obj.units || 'litres',
        abv_percent: obj.abv_percent || obj.abv ? parseFloat(obj.abv_percent || obj.abv) : null,
        lals: obj.lals ? parseFloat(obj.lals) : null,
        supplier_name: obj.supplier_name || obj.supplier || '',
        transport_distance_km: obj.transport_distance_km || obj.distance_km ? parseFloat(obj.transport_distance_km || obj.distance_km) : null,
        transport_method: obj.transport_method || obj.transport || 'road',
        weight_kg: obj.weight_kg || obj.weight ? parseFloat(obj.weight_kg || obj.weight) : null,
        co2e_kg: obj.co2e_kg || obj.co2e ? parseFloat(obj.co2e_kg || obj.co2e) : null,
        cost_per_unit: obj.cost_per_unit || obj.cost ? parseFloat(obj.cost_per_unit || obj.cost) : null,
        batch_number: obj.batch_number || obj.lot_number || obj.lot || obj.batch || '',
        date_received: obj.date_received || obj.date || '',
        notes: obj.notes || obj.note || '',
        _raw: obj,
      };
    }).filter(r => r.material_name && r.quantity);

    return Response.json({ records, total: records.length, headers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});