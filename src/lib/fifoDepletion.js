import { base44 } from '@/api/base44Client';

/**
 * Deplete a raw material using FIFO against its lots array.
 * Oldest lots (by date_received) are depleted first.
 * Updates both the lots array and the master quantity on the single record.
 */
export async function depleteFIFO(materialName, qtyToDeplete) {
  const allRM = await base44.entities.RawMaterial.list('name', 5000);

  // Find the record — exact match first, then fuzzy
  const rm = allRM.find(m => (m.name || '').toLowerCase().trim() === (materialName || '').toLowerCase().trim())
    || allRM.find(m => {
      const n = (m.name || '').toLowerCase();
      const p = (materialName || '').toLowerCase();
      return n.includes(p) || p.includes(n);
    });

  if (!rm) return [];

  const lots = Array.isArray(rm.lots) && rm.lots.length > 0
    ? [...rm.lots].sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
    : null;

  // If no lots tracked, just deduct from total quantity directly
  if (!lots) {
    const newQty = Math.max(0, (rm.quantity || 0) - qtyToDeplete);
    const newLals = rm.abv_percent
      ? parseFloat((newQty * rm.abv_percent / 100).toFixed(4))
      : rm.lals && rm.quantity ? parseFloat(((rm.lals / rm.quantity) * newQty).toFixed(4)) : 0;
    await base44.entities.RawMaterial.update(rm.id, { quantity: newQty, lals: newLals });
    return [{ name: rm.name, taken: qtyToDeplete, remaining: newQty }];
  }

  // FIFO: deplete oldest lots first
  let remaining = qtyToDeplete;
  const depleted = [];
  const updatedLots = lots.map(lot => {
    if (remaining <= 0) return lot;
    const take = Math.min(remaining, lot.quantity_remaining || 0);
    remaining -= take;
    depleted.push({
      lot_number: lot.lot_number,
      date_received: lot.date_received,
      taken: take,
      remaining: (lot.quantity_remaining || 0) - take,
    });
    return { ...lot, quantity_remaining: parseFloat(((lot.quantity_remaining || 0) - take).toFixed(4)) };
  });

  const newTotalQty = Math.max(0, (rm.quantity || 0) - qtyToDeplete);
  const newLals = rm.abv_percent
    ? parseFloat((newTotalQty * rm.abv_percent / 100).toFixed(4))
    : rm.lals && rm.quantity ? parseFloat(((rm.lals / rm.quantity) * newTotalQty).toFixed(4)) : 0;

  await base44.entities.RawMaterial.update(rm.id, {
    quantity: parseFloat(newTotalQty.toFixed(4)),
    lals: newLals,
    lots: updatedLots,
  });

  return depleted;
}
