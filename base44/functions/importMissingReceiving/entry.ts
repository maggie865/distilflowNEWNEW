import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHEET_ID = '1l2H2jLZXBPLlkNIZWI-7dO6zXBsC37zax1FYSvazE_o';

const MATERIAL_TYPE_MAP = {
  botanical: 'Botanicals', botanicals: 'Botanicals',
  ethanol: 'Ethanol',
  packaging: 'Packaging',
  grain: 'Grain',
  sugar: 'Sugar',
  water: 'Water',
  flavoring: 'Flavoring', flavouring: 'Flavoring',
  other: 'Other',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaRes.json();
    const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';

    const range = encodeURIComponent(`${firstSheet}!A1:Z5000`);
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    const rows = json.values || [];
    if (rows.length < 2) return Response.json({ imported: 0, message: 'No sheet data' });

    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[\s\/]+/g, '_'));
    const sheetRecords = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
      return {
        material_name: obj.material_name || obj.material || obj.name || obj.product || '',
        material_type: obj.material_type || obj.type || obj.category || '',
        quantity: obj.quantity ? parseFloat(obj.quantity) : null,
        unit: obj.unit || obj.units || 'litres',
        abv_percent: obj.abv_percent || obj.abv ? parseFloat(obj.abv_percent || obj.abv) : null,
        lals: obj.lals ? parseFloat(obj.lals) : null,
        supplier_name: obj.supplier_name || obj.supplier || '',
        supplier_id: obj.supplier_id || undefined,
        transport_distance_km: (obj.transport_distance_km || obj.distance_km) ? parseFloat(obj.transport_distance_km || obj.distance_km) : null,
        transport_method: obj.transport_method || obj.transport || 'road',
        weight_kg: (obj.weight_kg || obj.weight) ? parseFloat(obj.weight_kg || obj.weight) : null,
        co2e_kg: (obj.co2e_kg || obj.co2e) ? parseFloat(obj.co2e_kg || obj.co2e) : null,
        cost_per_unit: (obj.cost_per_unit || obj.cost) ? parseFloat(obj.cost_per_unit || obj.cost) : null,
        batch_number: obj.batch_number || obj.lot_number || obj.lot || obj.batch || '',
        date_received: obj.date_received || obj.date || '',
        notes: obj.notes || obj.note || '',
        packing_slip_url: obj.packing_slip_url || '',
      };
    }).filter(r => r.material_name && r.quantity && r.date_received);

    // Fetch all existing DB records
    const dbRecords = await base44.asServiceRole.entities.Receiving.list('-date_received', 2000);
    const dbKeys = new Set(dbRecords.map(r => `${r.material_name}|${r.batch_number}|${r.date_received}`));

    const missing = sheetRecords.filter(r => !dbKeys.has(`${r.material_name}|${r.batch_number}|${r.date_received}`));

    let imported = 0;
    let errors = [];

    for (const r of missing) {
      try {
        // Normalise material_type to title case
        const rawType = (r.material_type || '').toLowerCase().trim();
        const normType = MATERIAL_TYPE_MAP[rawType] || 'Other';

        const payload = {
          material_name: r.material_name,
          material_type: normType,
          quantity: r.quantity,
          unit: r.unit || 'litres',
          date_received: r.date_received,
        };

        if (r.abv_percent) payload.abv_percent = r.abv_percent;
        if (r.lals) payload.lals = r.lals;
        if (r.supplier_name) payload.supplier_name = r.supplier_name;
        if (r.supplier_id) payload.supplier_id = r.supplier_id;
        if (r.transport_distance_km) payload.transport_distance_km = r.transport_distance_km;
        if (r.transport_method) payload.transport_method = r.transport_method;
        if (r.weight_kg) payload.weight_kg = r.weight_kg;
        if (r.co2e_kg) payload.co2e_kg = r.co2e_kg;
        if (r.cost_per_unit) payload.cost_per_unit = r.cost_per_unit;
        if (r.batch_number) payload.batch_number = r.batch_number;
        if (r.notes) payload.notes = r.notes;
        if (r.packing_slip_url) payload.packing_slip_url = r.packing_slip_url;

        await base44.asServiceRole.entities.Receiving.create(payload);
        imported++;
      } catch (e) {
        errors.push({ record: r.material_name, error: e.message });
      }
    }

    return Response.json({
      sheet_total: sheetRecords.length,
      db_before: dbRecords.length,
      missing_found: missing.length,
      imported,
      errors,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});