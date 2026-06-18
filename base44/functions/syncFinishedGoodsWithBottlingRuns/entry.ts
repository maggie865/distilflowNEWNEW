import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const bottlingRuns = await base44.entities.BottlingRun.list('-date', 500);
    const finishedGoods = await base44.entities.FinishedGood.list('product_name', 500);

    let updated = 0;

    // For each bottling run, find and update matching finished goods
    for (const run of bottlingRuns) {
      if (!run.batch_number) continue;

      // Find all finished goods with matching batch number
      const matches = finishedGoods.filter(fg => fg.batch_number === run.batch_number);

      for (const fg of matches) {
        const updates = {};
        let needsUpdate = false;

        // Update product name if it differs
        if (fg.product_name !== run.product_name) {
          updates.product_name = run.product_name;
          needsUpdate = true;
        }

        // Update bottle size if it differs
        if (fg.bottle_size_ml !== run.bottle_size_ml) {
          updates.bottle_size_ml = run.bottle_size_ml;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await base44.entities.FinishedGood.update(fg.id, updates);
          updated++;
        }
      }
    }

    return Response.json({
      success: true,
      message: `Synced ${updated} finished goods records with bottling run data`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});