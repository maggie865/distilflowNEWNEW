import { base44 } from '@/api/base44Client';

const TYPE_MAP = {
  'Ethanol': 'ethanol', 'Botanicals': 'botanical', 'Packaging': 'packaging',
  'Grain': 'grain', 'Sugar': 'sugar', 'Water': 'water', 'Flavoring': 'flavoring', 'Other': 'other',
};

export function calcReceivingCo2e(data) {
  const weight = data.weight_kg ? parseFloat(data.weight_kg) : 0;
  const distance = data.transport_distance_km ? parseFloat(data.transport_distance_km) : 0;
  if (data.transport_method === 'pickup' || weight <= 0 || distance <= 0) return 0;
  return weight / 1000 / 56 * distance * 0.21;
}

export function buildReceivingPayload(data) {
  const lals = data.material_type === 'Ethanol' && data.abv_percent
    ? (parseFloat(data.quantity) * parseFloat(data.abv_percent) / 100)
    : undefined;

  const weight = data.weight_kg ? parseFloat(data.weight_kg) : 0;
  const distance = data.transport_distance_km ? parseFloat(data.transport_distance_km) : 0;
  const method = data.transport_method || 'road';
  const co2e = calcReceivingCo2e(data);

  return {
    material_name: data.material_name,
    supplier_product_name: data.supplier_product_name || undefined,
    material_type: data.material_type || undefined,
    quantity: parseFloat(data.quantity),
    unit: data.unit,
    abv_percent: data.abv_percent ? parseFloat(data.abv_percent) : undefined,
    lals,
    supplier_id: data.supplier_id || undefined,
    supplier_name: data.supplier_name || undefined,
    transport_distance_km: distance || undefined,
    transport_method: method || undefined,
    weight_kg: weight || undefined,
    co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined,
    cost_per_unit: data.cost_per_unit ? parseFloat(data.cost_per_unit) : undefined,
    batch_number: data.batch_number || undefined,
    packing_slip_number: data.packing_slip_number || undefined,
    date_received: data.date_received,
    notes: data.notes || undefined,
    packing_slip_url: data.packing_slip_url || undefined,
  };
}

// Resolve a typed supplier product name to a stock item name via saved aliases.
// Exact case-insensitive match only (the alias manager is explicit).
export function resolveAlias(typedName, aliases) {
  if (!typedName) return null;
  const n = typedName.toLowerCase().trim();
  const exact = aliases.find(a => (a.alias_name || '').toLowerCase().trim() === n);
  return exact ? exact.stock_item_name : null;
}

// Create or merge the RawMaterial inventory record for a received item.
export async function syncRawMaterialFromReceiving(payload, createdReceivingId) {
  const allRM = await base44.entities.RawMaterial.list('name', 5000);
  const isEthanol = (payload.material_type || '').toLowerCase() === 'ethanol';
  const incomingName = (payload.material_name || '').toLowerCase().trim();

  const existingRM = isEthanol
    ? (allRM.find(r => (r.type || '').toLowerCase() === 'ethanol' && (r.name || '').toLowerCase().trim() === incomingName)
      || allRM.find(r => (r.type || '').toLowerCase() === 'ethanol' && (() => {
        const rn = (r.name || '').toLowerCase();
        const lactonolIn = incomingName.includes('lactonol') || incomingName.includes('lactanol');
        const lactonolRec = rn.includes('lactonol') || rn.includes('lactanol');
        if (lactonolIn && lactonolRec) return true;
        const wheatIn = incomingName.includes('wheat') || incomingName.includes('ena') || incomingName.includes('neutral');
        const wheatRec = rn.includes('wheat') || rn.includes('ena') || rn.includes('neutral');
        if (wheatIn && wheatRec) return true;
        return false;
      })()))
    : allRM.find(r => (r.name || '').toLowerCase().trim() === incomingName);

  const newLot = {
    lot_number: payload.batch_number
      ? `${payload.batch_number}${isEthanol && payload.material_name ? ' — ' + payload.material_name : ''}`
      : (isEthanol && payload.material_name ? payload.material_name : null),
    date_received: payload.date_received,
    quantity_received: payload.quantity || 0,
    quantity_remaining: payload.quantity || 0,
    supplier: payload.supplier_name || null,
    cost_per_unit: payload.cost_per_unit || null,
    receiving_id: createdReceivingId,
  };

  if (existingRM) {
    const existingLots = Array.isArray(existingRM.lots) ? existingRM.lots : [];
    await base44.entities.RawMaterial.update(existingRM.id, {
      quantity: parseFloat(((existingRM.quantity || 0) + (payload.quantity || 0)).toFixed(4)),
      lals: parseFloat(((existingRM.lals || 0) + (payload.lals || 0)).toFixed(4)),
      cost_per_unit: payload.cost_per_unit || existingRM.cost_per_unit,
      date_received: payload.date_received,
      lots: [...existingLots, newLot],
    });
    return existingRM.id;
  }

  const created = await base44.entities.RawMaterial.create({
    name: payload.material_name,
    type: TYPE_MAP[payload.material_type] || 'other',
    quantity: payload.quantity || 0,
    unit: payload.unit,
    lals: payload.lals || 0,
    abv_percent: payload.abv_percent,
    batch_number: payload.batch_number || null,
    supplier: payload.supplier_name,
    cost_per_unit: payload.cost_per_unit,
    date_received: payload.date_received,
    receiving_id: createdReceivingId,
    lots: [newLot],
  });
  return created.id;
}