import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all customers and dispatches
    const allCustomers = await base44.asServiceRole.entities.Customer.list();
    const allDispatches = await base44.asServiceRole.entities.Dispatch.list();

    // Group by business_name (case-insensitive)
    const groups = new Map(); // business_name -> [{ id, customer }, ...]
    for (const customer of allCustomers) {
      const key = (customer.business_name || '').toLowerCase().trim();
      if (!key) continue;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(customer);
    }

    let mergedCount = 0;
    let dispatchesReasssigned = 0;

    // For each group with duplicates
    for (const [name, customers] of groups) {
      if (customers.length > 1) {
        // Keep first customer, merge all dispatches to it
        const primaryId = customers[0].id;
        const duplicateIds = customers.slice(1).map(c => c.id);

        // Reassign dispatches from duplicates to primary
        for (const dispatch of allDispatches) {
          if (duplicateIds.includes(dispatch.customer_name) || 
              duplicateIds.some(id => dispatch.customer_name?.includes(id))) {
            // Try to update dispatch to point to primary customer
            try {
              await base44.asServiceRole.entities.Dispatch.update(dispatch.id, {
                customer_name: customers[0].business_name
              });
              dispatchesReasssigned++;
            } catch (e) {
              // Continue if dispatch update fails
            }
          }
        }

        // Delete duplicates
        for (const dupId of duplicateIds) {
          await base44.asServiceRole.entities.Customer.delete(dupId);
          mergedCount++;
        }
      }
    }

    return Response.json({
      success: true,
      totalCustomers: allCustomers.length,
      customersMerged: mergedCount,
      dispatchesReassigned: dispatchesReasssigned,
      message: `Consolidated ${mergedCount} duplicate customer records${dispatchesReasssigned > 0 ? ` and reassigned ${dispatchesReasssigned} dispatches` : ''}`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});