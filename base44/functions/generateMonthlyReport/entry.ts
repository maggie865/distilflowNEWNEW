import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { month, wastage, receiving, dispatches, rawMaterials, finishedGoods, warehouseStock } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const monthLabel = new Date(month + '-01').toLocaleString('en-NZ', { month: 'long', year: 'numeric' });
    const title = `Bluff Distillery — Monthly Report ${monthLabel}`;

    // 1. Create the spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title },
        sheets: [
          { properties: { title: 'Inventory Summary', sheetId: 0 } },
          { properties: { title: 'Wastage Ledger', sheetId: 1 } },
          { properties: { title: 'Movement Audit', sheetId: 2 } },
        ],
      }),
    });
    const spreadsheet = await createRes.json();
    const spreadsheetId = spreadsheet.spreadsheetId;
    const spreadsheetUrl = spreadsheet.spreadsheetUrl;

    // ── Sheet 1: Inventory Summary ──────────────────────────────────────────
    const invRows = [
      ['INVENTORY SUMMARY', monthLabel],
      [],
      ['FINISHED GOODS — DISTILLERY'],
      ['Product', 'Batch', 'Bottle Size (ml)', 'ABV %', 'Bottles', 'LALs'],
      ...finishedGoods.map(g => [g.product_name, g.batch_number, g.bottle_size_ml || '', g.abv_percent || '', g.quantity_bottles, g.total_lals?.toFixed(4) || '']),
      [],
      ['FINISHED GOODS — 3PL WAREHOUSE (AUCKLAND)'],
      ['Product', 'Batch', 'Bottle Size (ml)', 'ABV %', 'Bottles', 'LALs', 'Transferred In'],
      ...warehouseStock.map(w => [w.product_name, w.batch_number, w.bottle_size_ml || '', w.abv_percent || '', w.quantity_bottles, w.total_lals?.toFixed(4) || '', w.date_transferred_in || '']),
      [],
      ['RAW MATERIALS'],
      ['Name', 'Type', 'Quantity', 'Unit', 'ABV %', 'LALs', 'Supplier', 'Batch #'],
      ...rawMaterials.map(m => [m.name, m.type, m.quantity, m.unit, m.abv_percent || '', m.lals?.toFixed(4) || '', m.supplier || '', m.batch_number || '']),
    ];

    // ── Sheet 2: Wastage Ledger ─────────────────────────────────────────────
    const wastageRows = [
      ['WASTAGE LEDGER', monthLabel],
      [],
      ['Date', 'Product', 'Batch', 'Source', 'Volume (L)', 'ABV %', 'LALs', 'Cost / Litre ($)', 'Total Loss ($)', 'Reason'],
      ...wastage.map(w => [w.date, w.product_name, w.batch_number, w.source, w.volume?.toFixed(3) || '', w.abv || '', w.lals?.toFixed(4) || '', w.cost_per_litre?.toFixed(2) || '', w.total_loss?.toFixed(2) || '', w.reason || '']),
      [],
      ['TOTALS', '', '', '',
        wastage.reduce((s, w) => s + (w.volume || 0), 0).toFixed(3),
        '',
        wastage.reduce((s, w) => s + (w.lals || 0), 0).toFixed(4),
        '',
        wastage.reduce((s, w) => s + (w.total_loss || 0), 0).toFixed(2),
        ''
      ],
    ];

    // ── Sheet 3: Movement Audit ─────────────────────────────────────────────
    const inboundRows = receiving.map(r => ['INBOUND', r.date_received, r.material_name, r.material_type, `${r.quantity} ${r.unit}`, r.lals?.toFixed(4) || '', r.supplier || '', r.batch_number || '', '—', '—']);
    const outboundRows = dispatches.map(d => [
      d.notes?.startsWith('[3PL]') ? 'OUTBOUND (3PL)' : 'OUTBOUND (Distillery)',
      d.dispatch_date, d.product_name, 'finished_good', d.quantity_bottles,
      d.total_lals?.toFixed(4) || '', d.customer_name, d.batch_number || '',
      d.transport_method || '', d.status,
    ]);

    const movementRows = [
      ['MOVEMENT AUDIT', monthLabel],
      [],
      ['Direction', 'Date', 'Material / Product', 'Type', 'Qty / Bottles', 'LALs', 'Supplier / Customer', 'Batch #', 'Transport / Unit', 'Status'],
      ...inboundRows,
      ...outboundRows,
    ];

    // 2. Batch update all sheets
    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Inventory Summary!A1', values: invRows },
          { range: 'Wastage Ledger!A1', values: wastageRows },
          { range: 'Movement Audit!A1', values: movementRows },
        ],
      }),
    });
    await updateRes.json();

    // 3. Apply basic formatting — bold headers
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [0, 1, 2].map(sheetId => ({
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 10 },
            cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } },
            fields: 'userEnteredFormat.textFormat',
          },
        })),
      }),
    });

    return Response.json({ spreadsheet_url: spreadsheetUrl, spreadsheet_id: spreadsheetId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});