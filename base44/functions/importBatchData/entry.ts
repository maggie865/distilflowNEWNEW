import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { batchData } = await req.json();

    if (!batchData || !batchData.masterBatch) {
      return Response.json({ error: 'Invalid batch data' }, { status: 400 });
    }

    const results = {
      masterBatch: null,
      subBatches: [],
      distillationRuns: [],
      dilutions: [],
      bottlingRun: null,
      wastageRecords: [],
      inventoryUpdates: []
    };

    // 1. Create MasterBatch
    const masterBatchData = {
      batch_code: batchData.masterBatch.batch_code,
      product_name: batchData.masterBatch.product_name,
      date_started: batchData.masterBatch.date_started,
      date_completed: batchData.masterBatch.date_completed,
      target_volume: batchData.masterBatch.target_volume,
      target_abv: batchData.masterBatch.target_abv,
      distillation_run_count: batchData.masterBatch.distillation_run_count,
      total_output_lals: batchData.masterBatch.total_output_lals,
      holding_tank: batchData.masterBatch.holding_tank,
      status: batchData.masterBatch.status,
      notes: batchData.masterBatch.notes
    };
    results.masterBatch = await base44.entities.MasterBatch.create(masterBatchData);

    // 2. Create SubBatches
    if (batchData.subBatches && Array.isArray(batchData.subBatches)) {
      for (const sb of batchData.subBatches) {
        const subBatchData = {
          master_batch_id: results.masterBatch.id,
          master_batch_code: results.masterBatch.batch_code,
          sub_batch_code: sb.sub_batch_code,
          date: sb.date,
          ethanol_lot: sb.ethanol_lot,
          botanical_lots: sb.botanical_lots,
          input_volume: sb.input_volume,
          input_abv: sb.input_abv,
          maceration_notes: sb.botanical_lots,
          status: sb.status
        };
        const created = await base44.entities.SubBatch.create(subBatchData);
        results.subBatches.push(created);
      }
    }

    // 3. Create DistillationRuns
    if (batchData.distillationRuns && Array.isArray(batchData.distillationRuns)) {
      for (const run of batchData.distillationRuns) {
        const runData = {
          batch_number: run.batch_number,
          sub_batch_code: run.sub_batch_code,
          date: run.date,
          product_name: batchData.masterBatch.product_name,
          input_volume: run.input_volume,
          input_abv: run.input_abv,
          input_lals: run.input_lals,
          heads_volume: run.heads_volume,
          heads_abv: run.heads_abv,
          heads_lals: run.heads_lals,
          tails_volume: run.tails_volume,
          tails_abv: run.tails_abv,
          tails_lals: run.tails_lals,
          hearts_volume: run.hearts_volume,
          hearts_abv: run.hearts_abv,
          hearts_lals: run.hearts_lals,
          dumped_volume: run.dumped_volume,
          dumped_abv: run.dumped_abv,
          dumped_lals: run.dumped_lals,
          output_volume: run.hearts_volume,
          output_abv: run.hearts_abv,
          output_lals: run.hearts_lals,
          status: run.status
        };
        const created = await base44.entities.DistillationRun.create(runData);
        results.distillationRuns.push(created);
      }
    }

    // 4. Create Dilutions
    if (batchData.dilutions && Array.isArray(batchData.dilutions)) {
      for (const dil of batchData.dilutions) {
        const dilData = {
          batch_number: dil.batch_number,
          date: dil.date,
          input_ethanol_volume: dil.input_volume,
          input_abv: dil.input_abv,
          input_lals: dil.input_lals,
          water_added: dil.water_added,
          output_volume: dil.output_volume,
          output_abv: dil.output_abv,
          output_lals: dil.output_lals,
          notes: dil.notes,
          status: 'completed'
        };
        const created = await base44.entities.Dilution.create(dilData);
        results.dilutions.push(created);
      }
    }

    // 5. Create BottlingRun
    if (batchData.bottlingRun) {
      const bottlingData = {
        batch_number: batchData.bottlingRun.batch_number,
        date: batchData.bottlingRun.date,
        product_name: batchData.bottlingRun.product_name,
        input_volume: batchData.bottlingRun.input_volume,
        input_abv: batchData.bottlingRun.input_abv,
        input_lals: batchData.bottlingRun.input_lals,
        bottle_size_ml: batchData.bottlingRun.bottle_size_ml,
        bottles_produced: batchData.bottlingRun.bottles_produced,
        lals_per_bottle: batchData.bottlingRun.lals_per_bottle,
        status: batchData.bottlingRun.status
      };
      results.bottlingRun = await base44.entities.BottlingRun.create(bottlingData);

      // Create FinishedGood from bottling run
      const finishedGood = await base44.entities.FinishedGood.create({
        product_name: batchData.bottlingRun.product_name,
        batch_number: batchData.bottlingRun.batch_number,
        bottle_size_ml: batchData.bottlingRun.bottle_size_ml,
        abv_percent: batchData.bottlingRun.input_abv,
        quantity_bottles: batchData.bottlingRun.bottles_produced,
        total_lals: batchData.bottlingRun.input_lals
      });
      results.bottlingRun.finishedGood = finishedGood;
    }

    // 6. Create WastageRecords
    if (batchData.wastageRecords && Array.isArray(batchData.wastageRecords)) {
      for (const waste of batchData.wastageRecords) {
        const wastageData = {
          batch_number: waste.batch_number,
          product_name: batchData.masterBatch.product_name,
          date: waste.date,
          volume: waste.volume_litres,
          abv: waste.abv_percent,
          lals: waste.lals,
          reason: waste.notes,
          source: 'distillation'
        };
        const created = await base44.entities.WastageRecord.create(wastageData);
        results.wastageRecords.push(created);
      }
    }

    // 7. Create or update RawMaterial records for ethanol used
    if (batchData.masterBatch.ethanol_lot && batchData.distillationRuns && batchData.distillationRuns.length > 0) {
      const totalEthanolVolume = batchData.distillationRuns.reduce((sum, run) => sum + (run.input_volume || 0), 0);
      const totalEthanolLals = batchData.distillationRuns.reduce((sum, run) => sum + (run.input_lals || 0), 0);
      
      // Find ethanol material and deduct
      const ethanolMaterials = await base44.entities.RawMaterial.filter({
        batch_number: batchData.masterBatch.ethanol_lot
      });
      
      if (ethanolMaterials && ethanolMaterials.length > 0) {
        const ethanol = ethanolMaterials[0];
        const newQuantity = (ethanol.quantity || 0) - totalEthanolVolume;
        const newLals = (ethanol.lals || 0) - totalEthanolLals;
        await base44.entities.RawMaterial.update(ethanol.id, {
          quantity: Math.max(0, newQuantity),
          lals: Math.max(0, newLals)
        });
        results.inventoryUpdates.push({
          material: ethanol.name,
          type: 'ethanol deduction',
          volume: totalEthanolVolume,
          lals: totalEthanolLals,
          remaining_volume: Math.max(0, newQuantity),
          remaining_lals: Math.max(0, newLals)
        });
      }
    }

    return Response.json({
      success: true,
      batch_code: batchData.masterBatch.batch_code,
      results
    });
  } catch (error) {
    console.error('Batch import error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});