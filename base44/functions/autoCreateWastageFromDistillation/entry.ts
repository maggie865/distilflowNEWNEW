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

    // Calculate dumped LALs from mass balance instead of trusting stored values
    // Balance: dumped_lals = input_lals - (heads_lals + hearts_lals + tails_lals)
    const inputLals = runData.input_lals || 0;
    const collectedLals = (runData.heads_lals || 0) + (runData.hearts_lals || 0) + (runData.tails_lals || 0);
    const balancedDumpedLals = Math.max(0, inputLals - collectedLals);
    const balancedDumpedAbv = runData.dumped_volume > 0 ? (balancedDumpedLals / runData.dumped_volume * 100) : 0;

    // Also fix the distillation run if stored dumped values are impossible (>100% ABV or negative LALs)
    if (runData.dumped_abv > 100 || (runData.dumped_lals || 0) < 0) {
      await base44.asServiceRole.entities.DistillationRun.update(runData.id, {
        dumped_lals: balancedDumpedLals,
        dumped_abv: balancedDumpedAbv
      });
    }

    // Create the wastage record from the balanced dumped data
    const wastageRecord = await base44.asServiceRole.entities.WastageRecord.create({
      date: runData.date,
      batch_number: subBatchCode,
      product_name: runData.product_name || 'Unknown',
      volume: runData.dumped_volume,
      abv: balancedDumpedAbv,
      lals: balancedDumpedLals,
      reason: `Still waste from ${subBatchCode}`,
      source: 'distillation',
      run_id: runData.id || event?.entity_id
    });

    return Response.json({ created: true, wastage_record_id: wastageRecord.id, batch: subBatchCode });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});