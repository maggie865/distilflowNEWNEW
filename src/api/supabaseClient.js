/**
 * db — Base44 entity wrapper that mirrors the old Supabase `db` interface.
 * All pages import { db } from '@/api/supabaseClient' and call the same methods.
 */
import { createClient } from '@supabase/supabase-js';
import { base44 } from '@/api/base44Client';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'
);

const e = base44.entities;

function entity(entityName) {
  const ent = e[entityName];

  return {
    /** List all records, ordered by `orderBy` (prefix with - for desc). */
    async list(orderBy = 'created_date', limit = 1000) {
      return ent.list(orderBy, limit);
    },

    /**
     * Paginated list — returns { data: [], count: number }.
     * Base44 doesn't expose a native count+offset API so we fetch all and slice.
     */
    async listPage(orderBy = 'created_date', limit = 50, offset = 0) {
      // Fetch enough records to cover offset+limit, then slice
      const allData = await ent.list(orderBy, offset + limit + 500);
      const total = allData.length;
      const data = allData.slice(offset, offset + limit);
      return { data, count: total };
    },

    /** Exact-match filter on one or more fields. */
    async filter(filters = {}) {
      return ent.filter(filters);
    },

    /** Case-insensitive filter — approximated with regular filter here. */
    async filterIlike(filters = {}) {
      // Base44 filter is already case-insensitive for string fields
      return ent.filter(filters);
    },

    /** Get a single record by id. */
    async get(id) {
      return ent.get(id);
    },

    /** Create a new record. */
    async create(payload) {
      // Force boolean fields to be real booleans not null/undefined
      const clean = { ...payload };
      const BOOL_FIELDS = ['is_sample', 'duty_free', 'is_export', 'requires_followup', 'filter_cleaned'];
      for (const f of BOOL_FIELDS) {
        if (f in clean) clean[f] = clean[f] === true;
      }
      return ent.create(clean);
    },

    /** Update a record by id. */
    async update(id, payload) {
      // Sanitise payload — convert null/undefined booleans to explicit false
      // so Base44 SDK doesn't skip them as "unchanged"
      const clean = { ...payload };
      for (const [k, v] of Object.entries(clean)) {
        if (v === null || v === undefined) {
          // leave nulls as-is for non-boolean fields
        }
      }
      // Force boolean fields to be real booleans not null/undefined
      const BOOL_FIELDS = ['is_sample', 'duty_free', 'is_export', 'requires_followup', 'filter_cleaned', 'check_springs'];
      for (const f of BOOL_FIELDS) {
        if (f in clean) clean[f] = clean[f] === true;
      }
      return ent.update(id, clean);
    },

    /** Delete a record by id. */
    async delete(id) {
      return ent.delete(id);
    },
  };
}

export const db = {
  RawMaterial:     entity('RawMaterial'),
  FinishedGood:    entity('FinishedGood'),
  DistillationRun: entity('DistillationRun'),
  BottlingRun:     entity('BottlingRun'),
  Dilution:        entity('Dilution'),
  Dispatch:        entity('Dispatch'),
  Customer:        entity('Customer'),
  Supplier:        entity('Supplier'),
  Receiving:       entity('Receiving'),
  StorageTank:     entity('StorageTank'),
  TankMovement:    entity('TankMovement'),
  MasterBatch:     entity('MasterBatch'),
  SubBatch:        entity('SubBatch'),
  SNSRun:          entity('SNSRun'),
  WastageRecord:   entity('WastageRecord'),
  Recipe:          entity('Recipe'),
  WarehouseStock:  entity('WarehouseStock'),
  StockThreshold:  entity('StockThreshold'),
  StockTake:       entity('StockTake'),
  StockTakeLine:   entity('StockTakeLine'),
};