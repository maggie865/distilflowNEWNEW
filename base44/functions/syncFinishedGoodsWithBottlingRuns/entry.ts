import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const bottlingRuns = await base44.entities.BottlingRun.list('-date', 500);
    const completedRuns = bottlingRuns.filter(r => r.status === 'completed' && r.bottles_produced > 0);

    // Aggregate bottles by product + batch + bottle size
    const aggregated = {};
    for (const run of completedRuns) {
      if (!run.batch_number || !run.bottle_size_ml || !run.product_name) continue;
      const key = `${run.product_name}|||${run.batch_number}|||${run.bottle_size_ml}`;
      if (!aggregated[key]) {
        aggregated[key] = {
          product_name: run.product_name,
          batch_number: run.batch_number,
          bottle_size_ml: run.bottle_size_ml,
          total_bottles: 0,
          total_lals: 0,
          abv_percent: run.input_abv || 45,
        };
      }
      aggregated[key].total_bottles += run.bottles_produced;
      aggregated[key].total_lals += (run.input_lals || 0);
    }

    const finishedGoods = await base44.entities.FinishedGood.list('product_name', 500);

    let created = 0;
    let updated = 0;

    for (const key of Object.keys(aggregated)) {
      const data = aggregated[key];
      const match = finishedGoods.find(fg =>
        fg.batch_number === data.batch_number &&
        fg.bottle_size_ml === data.bottle_size_ml &&
        fg.product_name === data.product_name
      );

      if (match) {
        if (match.quantity_bottles !== data.total_bottles || match.total_lals !== data.total_lals) {
          await base44.entities.FinishedGood.update(match.id, {
            quantity_bottles: data.total_bottles,
            total_lals: data.total_lals,
            abv_percent: data.abv_percent,
          });
          updated++;
        }
      } else {
        await base44.entities.FinishedGood.create({
          product_name: data.product_name,
          batch_number: data.batch_number,
          bottle_size_ml: data.bottle_size_ml,
          quantity_bottles: data.total_bottles,
          total_lals: data.total_lals,
          abv_percent: data.abv_percent,
          notes: 'Auto-created from bottling run sync',
        });
        created++;
      }
    }

    return Response.json({
      success: true,
      message: `Synced inventory from bottling runs. Created ${created} new records, updated ${updated} existing records.`,
      created,
      updated,
      totalBatches: Object.keys(aggregated).length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});