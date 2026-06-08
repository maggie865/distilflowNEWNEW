import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1AZuwsBn_awKnHzAYpXsd3hK4mTbcx8igK9RIrD04plk';
const RANGE = 'Sheet1!A:B'; // Column A = business_name, Column B = delivery_address

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get Google Sheets access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Fetch data from Google Sheets
    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const sheetsData = await sheetsRes.json();
    const rows = sheetsData.values || [];

    if (rows.length < 2) {
      return Response.json({ synced: 0, message: 'No data rows found in sheet' });
    }

    // Skip header row (row 0), map remaining rows
    const sheetCustomers = rows.slice(1)
      .filter(row => row[0]?.trim()) // must have a business name
      .map(row => ({
        business_name: row[0]?.trim() || '',
        delivery_address: row[1]?.trim() || '',
      }));

    // Fetch existing customers from DB
    const existing = await base44.asServiceRole.entities.Customer.list('business_name', 1000);
    const existingMap = {};
    for (const c of existing) {
      existingMap[c.business_name.toLowerCase()] = c;
    }

    let created = 0;
    let updated = 0;

    for (const sc of sheetCustomers) {
      const key = sc.business_name.toLowerCase();
      if (existingMap[key]) {
        // Update if address changed
        if (existingMap[key].delivery_address !== sc.delivery_address) {
          await base44.asServiceRole.entities.Customer.update(existingMap[key].id, {
            delivery_address: sc.delivery_address,
          });
          updated++;
        }
      } else {
        await base44.asServiceRole.entities.Customer.create(sc);
        created++;
      }
    }

    return Response.json({ synced: created + updated, created, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});