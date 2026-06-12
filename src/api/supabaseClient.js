import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://gvnlmxxgfinoufgtkgxf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mh3iR546ydljRasy2OEYdA_m6OUmN_t';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function entity(table) {
  return {
    async list(orderBy = 'created_at', limit = 1000) {
      const ascending = !orderBy.startsWith('-');
      const col = orderBy.replace(/^-/, '');
      let q = supabase.from(table).select('*').order(col, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    // Exact match filter (case-sensitive)
    async filter(filters = {}) {
      let q = supabase.from(table).select('*');
      Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    // Case-insensitive filter — use this for name lookups
    async filterIlike(filters = {}) {
      let q = supabase.from(table).select('*');
      Object.entries(filters).forEach(([col, val]) => { q = q.ilike(col, val); });
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { id };
    },
  };
}

export const db = {
  RawMaterial:      entity('raw_materials'),
  FinishedGood:     entity('finished_goods'),
  DistillationRun:  entity('distillation_runs'),
  BottlingRun:      entity('bottling_runs'),
  Dilution:         entity('dilutions'),
  Dispatch:         entity('dispatches'),
  Customer:         entity('customers'),
  Supplier:         entity('suppliers'),
  Receiving:        entity('receiving'),
  StorageTank:      entity('storage_tanks'),
  TankMovement:     entity('tank_movements'),
  MasterBatch:      entity('master_batches'),
  SubBatch:         entity('sub_batches'),
  SNSRun:           entity('sns_runs'),
  WastageRecord:    entity('wastage_records'),
  Recipe:           entity('recipes'),
  WarehouseStock:   entity('warehouse_stock'),
  StockThreshold:   entity('stock_thresholds'),
  StockTake:        entity('stock_takes'),
  StockTakeLine:    entity('stock_take_lines'),
};
