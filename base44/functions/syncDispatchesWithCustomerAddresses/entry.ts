import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allDispatches = await base44.asServiceRole.entities.Dispatch.list();
    const allCustomers = await base44.asServiceRole.entities.Customer.list();

    // Create lookup for customers by business name
    const customerMap = new Map();
    for (const customer of allCustomers) {
      const key = (customer.business_name || '').toLowerCase().trim();
      customerMap.set(key, customer);
    }

    let updatedCount = 0;
    const errors = [];

    // Process each dispatch
    for (const dispatch of allDispatches) {
      if (!dispatch.customer_name) continue;

      const key = (dispatch.customer_name || '').toLowerCase().trim();
      const customer = customerMap.get(key);

      if (!customer) {
        errors.push(`No customer found for: ${dispatch.customer_name}`);
        continue;
      }

      // Update dispatch with customer address if missing
      if (!dispatch.customer_address || dispatch.customer_address !== customer.delivery_address) {
        try {
          // Call getDistanceMatrix to calculate distance
          const distanceRes = await base44.functions.invoke('getDistanceMatrix', {
            origins: ['Bluff, New Zealand'], // Assuming distillery is in Bluff
            destinations: [customer.delivery_address],
            mode: dispatch.transport_method || 'road'
          });

          let distance = 0;
          if (distanceRes.data?.rows?.[0]?.elements?.[0]?.distance?.value) {
            distance = Math.round(distanceRes.data.rows[0].elements[0].distance.value / 1000); // Convert to km
          }

          // Calculate CO2e based on transport method
          let co2e = 0;
          if (distance > 0 && dispatch.parcel_weight_kg) {
            // Emission factors (kg CO2e per kg per km)
            const emissionFactors = {
              road: 0.00012,
              courier: 0.00015,
              air: 0.0005,
              sea: 0.00005,
              pickup: 0
            };
            const factor = emissionFactors[dispatch.transport_method] || 0.00012;
            co2e = Math.round(distance * dispatch.parcel_weight_kg * factor * 100) / 100;
          }

          // Update dispatch
          await base44.asServiceRole.entities.Dispatch.update(dispatch.id, {
            customer_address: customer.delivery_address,
            transport_distance_km: distance,
            co2e_kg: co2e
          });

          updatedCount++;
        } catch (err) {
          errors.push(`Failed to update dispatch ${dispatch.id}: ${err.message}`);
        }
      }
    }

    return Response.json({
      success: true,
      dispatchesProcessed: allDispatches.length,
      dispatchesUpdated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Updated ${updatedCount} dispatch records with customer addresses and CO2e calculations`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});