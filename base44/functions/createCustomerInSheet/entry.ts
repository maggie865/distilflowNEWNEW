import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1AZuwsBn_awKnHzAYpXsd3hK4mTbcx8igK9RIrD04plk';
const RANGE = 'Sheet1!A:B';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { business_name, delivery_address } = await req.json();

    if (!business_name?.trim()) {
      return Response.json({ error: 'Business name is required' }, { status: 400 });
    }

    // Check for existing customer (case-insensitive)
    const existing = await base44.entities.Customer.list('-created_date', 500);
    const match = existing.find(c => (c.business_name || '').toLowerCase().trim() === business_name.trim().toLowerCase());
    if (match) {
      return Response.json({ error: 'A customer with this name already exists' }, { status: 409 });
    }

    // Create in DB
    const customer = await base44.entities.Customer.create({
      business_name: business_name.trim(),
      delivery_address: (delivery_address || '').trim(),
    });

    // Append to Google Sheet
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [[business_name.trim(), (delivery_address || '').trim()]] }),
      }
    );

    return Response.json({ success: true, customer });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});