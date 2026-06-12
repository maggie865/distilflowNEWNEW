import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SPREADSHEET_ID = '1AZuwsBn_awKnHzAYpXsd3hK4mTbcx8igK9RIrD04plk';
const RANGE = 'Sheet1!A:B'; // Column A = business_name, Column B = delivery_address

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || 'https://gvnlmxxgfinoufgtkgxf.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || 'sb_publishable_mh3iR546ydljRasy2OEYdA_m6OUmN_t'
    );

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

    // Skip header row, map remaining rows
    const sheetCustomers = rows.slice(1)
      .filter(row => row[0]?.trim())
      .map(row => ({
        business_name: row[0]?.trim() || '',
        delivery_address: row[1]?.trim() || '',
      }));

    // Fetch existing customers from Supabase
    const { data: existing = [] } = await supabase.from('customers').select('id, business_name, delivery_address');
    const existingMap = {};
    for (const c of existing) {
      existingMap[c.business_name.toLowerCase()] = c;
    }

    const toCreate = [];
    const toUpdate = [];

    for (const sc of sheetCustomers) {
      const key = sc.business_name.toLowerCase();
      if (existingMap[key]) {
        if (existingMap[key].delivery_address !== sc.delivery_address) {
          toUpdate.push({ id: existingMap[key].id, delivery_address: sc.delivery_address });
        }
      } else {
        toCreate.push(sc);
      }
    }

    if (toCreate.length > 0) {
      const { error } = await supabase.from('customers').insert(toCreate);
      if (error) throw new Error(`Insert error: ${error.message}`);
    }

    for (const u of toUpdate) {
      await supabase.from('customers').update({ delivery_address: u.delivery_address }).eq('id', u.id);
    }

    return Response.json({ synced: toCreate.length + toUpdate.length, created: toCreate.length, updated: toUpdate.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});