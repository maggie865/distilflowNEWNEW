import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace connection to Google Sheets
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
    
    const spreadsheetId = '1EFAlgvUzkUYo_0ppMHrNv5JYOz89zH_n-y8EJN1uiMg';
    const range = 'Suppliers!A:E'; // Adjust range based on your sheet structure
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      return Response.json({ message: 'No supplier data found' });
    }

    // Parse rows (skip header)
    const suppliers = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue; // Skip empty rows
      
      suppliers.push({
        business_name: row[0]?.trim() || '',
        address: row[1]?.trim() || '',
        contact_email: row[2]?.trim() || '',
        contact_phone: row[3]?.trim() || '',
        goods_types: row[4]?.split(',').map(t => t.trim()).filter(t => t) || []
      });
    }

    // Upsert suppliers
    let synced = 0;
    for (const supplier of suppliers) {
      if (!supplier.business_name || !supplier.address) continue;
      
      const existing = await base44.entities.Supplier.filter({
        business_name: supplier.business_name
      });
      
      if (existing.length > 0) {
        await base44.entities.Supplier.update(existing[0].id, supplier);
      } else {
        await base44.entities.Supplier.create(supplier);
      }
      synced++;
    }

    return Response.json({ message: `Synced ${synced} suppliers from Google Sheet` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});