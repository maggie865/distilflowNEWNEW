import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1AZuwsBn_awKnHzAYpXsd3hK4mTbcx8igK9RIrD04plk';
const RANGE = 'Sheet1!A:B';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetsData = await sheetsRes.json();
    const rows = sheetsData.values || [];

    if (rows.length < 2) {
      return Response.json({ synced: 0, created: 0, updated: 0, message: 'No data rows found in sheet' });
    }

    const sheetCustomers = rows.slice(1)
      .filter(row => row[0]?.trim())
      .map(row => ({
        business_name: row[0]?.trim() || '',
        delivery_address: row[1]?.trim() || '',
      }));

    const existing = await base44.entities.Customer.list('-created_date', 500);
    const existingMap = {};
    for (const c of existing) {
      existingMap[(c.business_name || '').toLowerCase()] = c;
    }

    const toCreate = [];
    const toUpdate = [];

    for (const sc of sheetCustomers) {
      const key = sc.business_name.toLowerCase();
      if (existingMap[key]) {
        if ((existingMap[key].delivery_address || '') !== sc.delivery_address) {
          toUpdate.push({ id: existingMap[key].id, delivery_address: sc.delivery_address });
        }
      } else {
        toCreate.push(sc);
      }
    }

    if (toCreate.length > 0) {
      await base44.entities.Customer.bulkCreate(toCreate);
    }

    for (const u of toUpdate) {
      await base44.entities.Customer.update(u.id, { delivery_address: u.delivery_address });
    }

    return Response.json({
      synced: toCreate.length + toUpdate.length,
      created: toCreate.length,
      updated: toUpdate.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});