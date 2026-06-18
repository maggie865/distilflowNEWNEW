import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const bottlingRuns = await base44.entities.BottlingRun.list('-date', 500);
    const runs200ml = bottlingRuns.filter(r => r.bottle_size_ml === 200);

    let updated = 0;
    for (const run of runs200ml) {
      await base44.entities.BottlingRun.update(run.id, {
        product_name: 'London Dry Gin 200',
      });
      updated++;
    }

    return Response.json({ 
      success: true, 
      message: `Renamed ${updated} bottling run(s) to "London Dry Gin 200"` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});