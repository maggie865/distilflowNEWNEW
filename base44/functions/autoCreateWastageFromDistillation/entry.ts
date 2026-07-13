import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const event = body.event;
    const runData = body.data;

    if (!runData) {
      return Response.json({ skipped: true, reason: 'no run data in payload' });
    }

    // Only process completed runs with dumped volume
    if (runData.status !== 'completed') {
      return Response.json({ skipped: true, reason: `status is ${runData.status}, not completed` });
    }

    if (!runData.dumped_volume || runData.dumped_volume <= 0) {
      return Response.json({ skipped: true, reason: 'no dumped volume on this run' });
    }

    const subBatchCode = runData.sub_batch_code;
    if (!subBatchCode) {
      return Response.json({ skipped: true, reason: 'no sub_batch_code on run' });
    }

    // Check if a wastage record already exists for this sub-batch
    const existing = await base44.asServiceRole.entities.WastageRecord.filter({
      batch_number: subBatchCode
    });

    if (existing && existing.length > 0) {
      return Response.json({ skipped: true, reason: `wastage record already exists for ${subBatchCode}` });
    }

    // Create the wastage record from the dumped data
    const wastageRecord = await base44.asServiceRole.entities.WastageRecord.create({
      date: runData.date,
      batch_number: subBatchCode,
      product_name: runData.product_name || 'Unknown',
      volume: runData.dumped_volume,
      abv: runData.dumped_abv,
      lals: runData.dumped_lals,
      reason: `Still waste from ${subBatchCode}`,
      source: 'distillation',
      run_id: runData.id || event?.entity_id
    });

    return Response.json({ created: true, wastage_record_id: wastageRecord.id, batch: subBatchCode });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});