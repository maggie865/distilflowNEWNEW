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

    // Find B-027 bottling runs with 200ml bottles
    const runsToUpdate = bottlingRuns.filter(r => 
      r.batch_number === 'B-027' && 
      r.bottle_size_ml === 200
    );

    let updatedRuns = 0;
    let updatedGoods = 0;

    // Update bottling runs
    for (const run of runsToUpdate) {
      await base44.entities.BottlingRun.update(run.id, {
        product_name: 'London Dry Gin 200ml',
      });
      updatedRuns++;
    }

    // Update finished goods for B-027 with 200ml
    const goodsToUpdate = finishedGoods.filter(fg =>
      fg.batch_number === 'B-027' &&
      fg.bottle_size_ml === 200
    );

    for (const good of goodsToUpdate) {
      await base44.entities.FinishedGood.update(good.id, {
        product_name: 'London Dry Gin 200ml',
      });
      updatedGoods++;
    }

    return Response.json({
      success: true,
      message: `Updated ${updatedRuns} bottling runs and ${updatedGoods} finished goods to 'London Dry Gin 200ml'`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});