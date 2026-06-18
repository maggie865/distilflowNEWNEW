import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all customers
    const allCustomers = await base44.asServiceRole.entities.Customer.list();

    // Group by business_name (case-insensitive) and keep track of which to delete
    const seen = new Map(); // business_name -> id of first occurrence
    const toDelete = [];

    for (const customer of allCustomers) {
      const key = (customer.business_name || '').toLowerCase().trim();
      
      if (!key) continue; // Skip empty names
      
      if (seen.has(key)) {
        // This is a duplicate
        toDelete.push(customer.id);
      } else {
        // First occurrence
        seen.set(key, customer.id);
      }
    }

    // Delete duplicates
    let deletedCount = 0;
    for (const id of toDelete) {
      await base44.asServiceRole.entities.Customer.delete(id);
      deletedCount++;
    }

    return Response.json({
      success: true,
      totalCustomers: allCustomers.length,
      duplicatesRemoved: deletedCount,
      message: `Removed ${deletedCount} duplicate customer record${deletedCount !== 1 ? 's' : ''}`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});