import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all bottling runs and finished goods
    const bottlingRuns = await base44.entities.BottlingRun.list('-date', 500);
    const finishedGoods = await base44.entities.FinishedGood.list('product_name', 500);

    let updated = 0;

    // For each bottling run with bottle_size_ml, find matching FinishedGood records
    for (const run of bottlingRuns) {
      if (!run.bottle_size_ml || !run.product_name || !run.batch_number) continue;

      // Find all FinishedGood records for this product + batch
      const matches = finishedGoods.filter(fg => 
        fg.batch_number === run.batch_number &&
        fg.product_name === run.product_name &&
        (fg.bottle_size_ml === undefined || fg.bottle_size_ml === null || fg.bottle_size_ml === 700)
      );

      // Update each match to have the correct bottle_size_ml if it differs
      for (const fg of matches) {
        if (fg.bottle_size_ml !== run.bottle_size_ml) {
          await base44.entities.FinishedGood.update(fg.id, {
            bottle_size_ml: run.bottle_size_ml,
          });
          updated++;
        }
      }
    }

    return Response.json({ 
      success: true, 
      message: `Updated ${updated} finished goods records with correct bottle sizes` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});