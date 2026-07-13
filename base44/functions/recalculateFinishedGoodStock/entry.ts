import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [bottlingRuns, dispatches, warehouseStock, finishedGoods] = await Promise.all([
      base44.asServiceRole.entities.BottlingRun.list('-created_date', 1000),
      base44.asServiceRole.entities.Dispatch.list('-created_date', 5000),
      base44.asServiceRole.entities.WarehouseStock.list('-created_date', 1000),
      base44.asServiceRole.entities.FinishedGood.list('-created_date', 1000),
    ]);

    const key = (r) => `${r.product_name}|||${r.batch_number}|||${Number(r.bottle_size_ml)}`;

    // Calculate total produced per product/batch/size from bottling runs
    const produced = {};
    for (const br of bottlingRuns) {
      if (br.status !== 'completed') continue;
      const k = key(br);
      if (!produced[k]) produced[k] = { product_name: br.product_name, batch_number: br.batch_number, bottle_size_ml: Number(br.bottle_size_ml), bottles: 0, lals: 0 };
      produced[k].bottles += br.bottles_produced || 0;
      produced[k].lals += br.input_lals || 0;
    }

    // Calculate total dispatched from Bluff per product/batch/size
    const dispatchedBluff = {};
    for (const d of dispatches) {
      if ((d.dispatched_from || 'Bluff').includes('Auckland')) continue;
      const k = key(d);
      if (!dispatchedBluff[k]) dispatchedBluff[k] = { bottles: 0, lals: 0 };
      dispatchedBluff[k].bottles += d.quantity_bottles || 0;
      dispatchedBluff[k].lals += d.total_lals || 0;
    }

    // Calculate total dispatched FROM 3PL per product/batch/size
    // (these left the 3PL after being transferred there, so current 3PL stock alone doesn't capture them)
    const dispatchedFrom3PL = {};
    for (const d of dispatches) {
      if (!(d.dispatched_from || 'Bluff').includes('Auckland')) continue;
      const k = key(d);
      if (!dispatchedFrom3PL[k]) dispatchedFrom3PL[k] = { bottles: 0, lals: 0 };
      dispatchedFrom3PL[k].bottles += d.quantity_bottles || 0;
      dispatchedFrom3PL[k].lals += d.total_lals || 0;
    }

    // Calculate total at 3PL per product/batch/size (currently sitting at warehouse)
    const at3PL = {};
    for (const ws of warehouseStock) {
      const k = key(ws);
      if (!at3PL[k]) at3PL[k] = { bottles: 0, lals: 0 };
      at3PL[k].bottles += ws.quantity_bottles || 0;
      at3PL[k].lals += ws.total_lals || 0;
    }

    const adjustments = [];
    const fgMap = {};
    for (const fg of finishedGoods) {
      fgMap[key(fg)] = fg;
    }

    // For each produced combination, calculate correct Bluff stock
    // Bluff stock = produced - dispatchedFromBluff - totalTransferredTo3PL
    // totalTransferredTo3PL = dispatchedFrom3PL (already sold from 3PL) + at3PL (still at warehouse)
    for (const [k, prod] of Object.entries(produced)) {
      const dispatched = dispatchedBluff[k]?.bottles || 0;
      const dispatched3PL = dispatchedFrom3PL[k]?.bottles || 0;
      const atWarehouse = at3PL[k]?.bottles || 0;
      const correctBottles = prod.bottles - dispatched - dispatched3PL - atWarehouse;
      const correctLals = parseFloat((prod.lals - (dispatchedBluff[k]?.lals || 0) - (dispatchedFrom3PL[k]?.lals || 0) - (at3PL[k]?.lals || 0)).toFixed(4));

      const existing = fgMap[k];
      if (existing) {
        const currentBottles = existing.quantity_bottles || 0;
        if (currentBottles !== correctBottles) {
          adjustments.push({
            action: existing.id ? (correctBottles <= 0 ? 'delete' : 'update') : 'update',
            id: existing.id,
            product_name: prod.product_name,
            batch_number: prod.batch_number,
            bottle_size_ml: prod.bottle_size_ml,
            old_bottles: currentBottles,
            new_bottles: correctBottles,
            old_lals: existing.total_lals,
            new_lals: correctLals,
          });
        }
      } else if (correctBottles > 0) {
        // FinishedGood record was deleted when stock hit 0 — recreate it
        adjustments.push({
          action: 'create',
          id: null,
          product_name: prod.product_name,
          batch_number: prod.batch_number,
          bottle_size_ml: prod.bottle_size_ml,
          old_bottles: 0,
          new_bottles: correctBottles,
          old_lals: 0,
          new_lals: correctLals,
        });
      }
    }

    // Apply adjustments
    let updated = 0;
    let deleted = 0;
    let created = 0;
    for (const adj of adjustments) {
      if (adj.action === 'create') {
        await base44.asServiceRole.entities.FinishedGood.create({
          product_name: adj.product_name,
          batch_number: adj.batch_number,
          bottle_size_ml: adj.bottle_size_ml,
          quantity_bottles: adj.new_bottles,
          total_lals: adj.new_lals,
        });
        created++;
      } else if (adj.action === 'delete') {
        await base44.asServiceRole.entities.FinishedGood.delete(adj.id);
        deleted++;
      } else {
        await base44.asServiceRole.entities.FinishedGood.update(adj.id, {
          quantity_bottles: adj.new_bottles,
          total_lals: adj.new_lals,
        });
        updated++;
      }
    }

    return Response.json({
      status: 'success',
      total_combinations: Object.keys(produced).length,
      adjustments_made: adjustments.length,
      records_updated: updated,
      records_deleted: deleted,
      records_created: created,
      adjustments: adjustments,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});