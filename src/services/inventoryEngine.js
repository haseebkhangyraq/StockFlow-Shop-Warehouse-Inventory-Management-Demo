// src/services/inventoryEngine.js
// ============================================================================
// THE SINGLE SOURCE OF TRUTH for all inventory mutations and calculations.
// UI components MUST NOT modify quantities directly — every stock change goes
// through these functions. All money is INTEGER minor units (paisa/cents).
//
// Model:
//   - Stock exists ONLY as batch records ({productId, locationId, qty, expDate…}).
//   - Product/location totals are derived by summing batches → always consistent.
//   - Transfers: creating reserves stock ("reserved"); dispatch consumes source
//     batches into an "in transit" pool; receiving credits the destination;
//     cancellation reverses to the exact previous state. In-transit stock is
//     counted at neither location.
//   - Sales consume eligible (non-expired) batches FEFO at the shop location.
//   - Inventory valuation uses weighted average cost (WAC) per product; retail
//     value is computed separately and never mixed into cost valuation.
// ============================================================================

import { newId, padNum } from '../utils/identifiers';
import { nowIso, daysUntil, MS_DAY, dayKey } from '../utils/dates';
import { ISSUE_REASONS, ADJUSTMENT_REASONS, OVERSTOCK_MULTIPLIER } from '../utils/constants';
import { validateProduct, validateSupplier, validateCategory, validateCustomer } from '../utils/validation';

const clone = (state) => (typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state)));
export const ok = (state, message, extra = {}) => ({ ok: true, state, message, ...extra });
export const fail = (error, fieldErrors = null) => ({ ok: false, error, fieldErrors });

const nextCounter = (state, key) => { state.counters[key] = (state.counters[key] || 0) + 1; return state.counters[key]; };

export function pushActivity(state, o) {
  state.activity.unshift({ id: newId('act'), at: nowIso(), ...o });
  if (state.activity.length > 800) state.activity.length = 800;
}
export function pushNotification(state, type, title, message, opts = {}) {
  state.notifications.unshift({ id: newId('ntf'), at: nowIso(), type, title, message, read: false, isSeeded: false, ...opts });
  if (state.notifications.length > 300) state.notifications.length = 300;
}
const bumpMovement = (state, productId) => {
  const p = state.products.find((x) => x.id === productId);
  if (p) p.lastMovementAt = nowIso();
};

/* ------------------------------------------------------------------ */
/* Read selectors                                                      */
/* ------------------------------------------------------------------ */

export const activeProducts = (state) => state.products.filter((p) => p.status === 'active');

export const productName = (state, id) => state.products.find((p) => p.id === id)?.name || id || '—';

export const batchesOf = (state, productId, locationId = null) =>
  state.batches.filter((b) => b.productId === productId && b.qty > 0 && (locationId ? b.locationId === locationId : true));

export const onHand = (state, productId, locationId = null) =>
  batchesOf(state, productId, locationId).reduce((a, b) => a + b.qty, 0);

export const totalOnHand = (state, productId) =>
  state.batches.reduce((a, b) => (b.productId === productId ? a + b.qty : a), 0);

/** Units committed to PENDING transfers sourced from `locationId`. */
export function reserved(state, productId, locationId) {
  return state.transfers
    .filter((t) => t.status === 'pending' && t.sourceLocationId === locationId)
    .reduce((a, t) => a + t.lines.reduce((s, l) => (l.productId === productId ? s + l.qty : s), 0), 0);
}

/** Units dispatched but not yet received (counted at neither location). */
export function inTransit(state, productId = null, fromLocationId = null) {
  return state.transfers
    .filter((t) => t.status === 'in_transit')
    .reduce((a, t) => a + t.lines.reduce((s, l) => ((!productId || l.productId === productId) && (!fromLocationId || t.sourceLocationId === fromLocationId) ? s + l.qty : s), 0), 0);
}

export function available(state, productId, locationId) {
  return Math.max(0, onHand(state, productId, locationId) - reserved(state, productId, locationId));
}

/** Qty that can legally be SOLD at a location: non-expired batches only. */
export function sellableQty(state, productId, locationId) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  return batchesOf(state, productId, locationId)
    .filter((b) => !b.expDate || new Date(b.expDate) >= todayStart)
    .reduce((a, b) => a + b.qty, 0);
}

export function stockStatus(state, productId, locationId = null) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return 'out';
  if (locationId) {
    const avail = available(state, productId, locationId);
    if (avail <= 0) return 'out';
    if (avail <= product.reorderLevel) return 'low';
    if (avail > product.reorderLevel * OVERSTOCK_MULTIPLIER) return 'overstocked';
    return 'in_stock';
  }
  const totalAvail = state.locations.reduce((a, l) => a + available(state, productId, l.id), 0);
  if (totalAvail <= 0) return 'out';
  const anyLow = state.locations.some((l) => {
    const av = available(state, productId, l.id);
    return av > 0 && av <= product.reorderLevel;
  });
  if (anyLow) return 'low';
  if (totalOnHand(state, productId) > product.reorderLevel * OVERSTOCK_MULTIPLIER) return 'overstocked';
  return 'in_stock';
}

export function expiryStatus(state, productId, locationId = null) {
  const product = state.products.find((p) => p.id === productId);
  if (!product || !product.trackExpiry) return 'not_tracked';
  const list = batchesOf(state, productId, locationId).filter((b) => b.expDate);
  if (!list.length) return 'no_stock';
  const threshold = state.settings.expiryWarningDays;
  const buckets = list.map((b) => batchExpiryBucket(b, threshold));
  if (buckets.some((b) => b === 'expired')) return 'expired';
  if (buckets.some((b) => b === 'expiring_today')) return 'expiring_today';
  if (buckets.some((b) => b === 'expiring_soon')) return 'expiring_soon';
  return 'healthy';
}

export const batchExpiryBucket = (batch, thresholdDays) => {
  if (!batch.expDate) return 'not_tracked';
  const d = daysUntil(batch.expDate);
  if (d == null) return 'not_tracked';
  if (d < 0) return 'expired';
  if (d === 0) return 'expiring_today';
  if (d <= thresholdDays) return 'expiring_soon';
  return 'healthy';
};
export const batchExpiryStatus = (state, batch) => batchExpiryBucket(batch, state.settings.expiryWarningDays);

export function calculateInventoryValue(state) {
  let cost = 0, retail = 0, units = 0;
  const transitProducts = [];
  for (const p of activeProducts(state)) {
    const q = totalOnHand(state, p.id);
    if (q > 0) {
      cost += q * p.costPrice;
      retail += q * p.sellPrice;
      units += q;
    }
    const t = inTransit(state, p.id);
    if (t > 0) {
      transitProducts.push({ product: p, qty: t, value: t * p.costPrice });
      units += t;
    }
  }
  const transitValue = transitProducts.reduce((a, r) => a + r.value, 0);
  return { costValue: cost + transitValue, retailValue: retail, units, transitUnits: transitValue ? transitProducts.reduce((a, r) => a + r.qty, 0) : 0, transitValue, transitProducts };
}

/* ------------------------------------------------------------------ */
/* Alerts / lists                                                      */
/* ------------------------------------------------------------------ */

export function getStockAlerts(state) {
  const out = [], low = [];
  const outIds = new Set();
  for (const p of activeProducts(state)) {
    for (const l of state.locations) {
      const avail = available(state, p.id, l.id);
      if (avail <= 0) {
        if (!outIds.has(p.id)) {
          outIds.add(p.id);
          out.push({ product: p, location: l, avail: 0, allLocations: state.locations.every((x) => available(state, p.id, x.id) <= 0) });
        }
      } else if (avail <= p.reorderLevel) {
        low.push({ product: p, location: l, avail });
      }
    }
  }
  out.sort((a, b) => Number(b.allLocations) - Number(a.allLocations) || a.product.name.localeCompare(b.product.name));
  low.sort((a, b) => a.avail - b.avail);
  return { out: out.slice(0, 40), low: low.slice(0, 40) };
}

export function getExpiryAlerts(state) {
  const threshold = state.settings.expiryWarningDays;
  const expired = [], expiringToday = [], expiringSoon = [];
  for (const b of state.batches) {
    if (b.qty <= 0 || !b.expDate) continue;
    const product = state.products.find((p) => p.id === b.productId);
    if (!product || product.status !== 'active') continue;
    const bucket = batchExpiryBucket(b, threshold);
    if (bucket === 'not_tracked' || bucket === 'healthy') continue;
    const row = { batch: b, product, location: state.locations.find((l) => l.id === b.locationId), days: daysUntil(b.expDate), bucket };
    if (bucket === 'expired') expired.push(row);
    else if (bucket === 'expiring_today') expiringToday.push(row);
    else expiringSoon.push(row);
  }
  expired.sort((a, b) => a.days - b.days);
  expiringToday.sort((a, b) => a.days - b.days);
  expiringSoon.sort((a, b) => a.days - b.days);
  return { expired, expiringToday, expiringSoon };
}

export function getDeadStock(state) {
  const threshold = state.settings.deadStockDays;
  const now = Date.now();
  const rows = [];
  for (const p of activeProducts(state)) {
    const units = totalOnHand(state, p.id);
    if (units <= 0 || !p.lastMovementAt) continue;
    const ageDays = Math.floor((now - new Date(p.lastMovementAt).getTime()) / MS_DAY);
    if (ageDays >= threshold) {
      rows.push({ product: p, units, lastMovementAt: p.lastMovementAt, ageDays, value: units * p.costPrice });
    }
  }
  return rows.sort((a, b) => b.ageDays - a.ageDays);
}

export function getReplenishmentList(state) {
  const rows = [];
  for (const p of activeProducts(state)) {
    for (const l of state.locations) {
      const avail = available(state, p.id, l.id);
      if (avail <= p.reorderLevel) {
        rows.push({ product: p, location: l, avail, onHand: onHand(state, p.id, l.id), reorderLevel: p.reorderLevel });
      }
    }
  }
  return rows.sort((a, b) => a.avail - b.avail || a.product.name.localeCompare(b.product.name));
}

/* ------------------------------------------------------------------ */
/* Dashboard metrics — always derived from current state               */
/* ------------------------------------------------------------------ */

const sumReturnedQty = (sale, productId) => (sale.returns || []).reduce((a, r) => a + r.lines.filter((rl) => rl.productId === productId).reduce((b, rl) => b + rl.qty, 0), 0);

export function calculateDashboardMetrics(state, range = null) {
  const todayK = dayKey(new Date());
  const inRange = (iso) => {
    if (!range) return true;
    const k = dayKey(iso);
    if (range.from && k < range.from) return false;
    if (range.to && k > range.to) return false;
    return true;
  };

  const valuation = calculateInventoryValue(state);
  const alerts = getStockAlerts(state);
  const outProductIds = new Set(alerts.out.map((a) => a.product.id));
  const lowProductIds = new Set(alerts.low.map((a) => a.product.id));
  const lowCount = [...lowProductIds].filter((id) => !outProductIds.has(id)).length;

  const exp = getExpiryAlerts(state);
  const expiredProducts = new Set(exp.expired.map((r) => r.product.id)).size;
  const nearExpiryProducts = new Set([...exp.expiringSoon, ...exp.expiringToday].map((r) => r.product.id)).size;
  const dead = getDeadStock(state);

  let salesTotal = 0, salesCount = 0, unitsSold = 0;
  for (const s of state.sales) {
    if (!inRange(s.createdAt)) continue;
    salesTotal += Math.max(0, s.total - (s.returnedTotal || 0));
    salesCount += 1;
    for (const l of s.lines) unitsSold += Math.max(0, l.qty - sumReturnedQty(s, l.productId));
  }
  let todaySalesTotal = 0, todayUnits = 0;
  for (const s of state.sales) {
    if (dayKey(s.createdAt) !== todayK) continue;
    todaySalesTotal += Math.max(0, s.total - (s.returnedTotal || 0));
    for (const l of s.lines) todayUnits += Math.max(0, l.qty - sumReturnedQty(s, l.productId));
  }

  const pendingTransfers = state.transfers.filter((t) => t.status === 'pending' || t.status === 'in_transit').length;
  const weekAgoMs = Date.now() - 7 * MS_DAY;
  const recentReceipts = state.receipts.filter((r) => new Date(r.createdAt).getTime() >= weekAgoMs).length;

  return {
    totalProducts: activeProducts(state).length,
    totalUnits: valuation.units,
    inventoryCostValue: valuation.costValue,
    retailValue: valuation.retailValue,
    transitUnits: valuation.transitUnits,
    transitValue: valuation.transitValue,
    lowStockCount: lowCount,
    outOfStockCount: outProductIds.size,
    expiredProductsCount: expiredProducts,
    nearExpiryProductsCount: nearExpiryProducts,
    deadStockCount: dead.length,
    deadStockValue: dead.reduce((a, r) => a + r.value, 0),
    salesTotal, salesCount, unitsSold,
    todaySalesTotal, todayUnits,
    pendingTransfers,
    recentReceipts,
  };
}

/* ------------------------------------------------------------------ */
/* MUTATIONS — master data                                             */
/* ------------------------------------------------------------------ */

export function createProduct(state, payload) {
  const v = validateProduct(payload, state.products);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const p = {
    id: newId('prd'),
    sku: payload.sku.trim(), barcode: payload.barcode?.trim() || '',
    name: payload.name.trim(), categoryId: payload.categoryId,
    description: payload.description?.trim() || '',
    unit: payload.unit || 'pcs',
    costPrice: Math.round(payload.costPrice), sellPrice: Math.round(payload.sellPrice),
    reorderLevel: Math.round(payload.reorderLevel), supplierId: payload.supplierId || null,
    trackExpiry: !!payload.trackExpiry, trackBatch: !!payload.trackBatch,
    status: 'active', createdAt: nowIso(), lastMovementAt: nowIso(),
  };
  next.products.push(p);
  pushActivity(next, { action: 'product_created', refId: p.sku, productId: p.id, description: `Product created: “${p.name}” (${p.sku}).` });
  return ok(next, `Product “${p.name}” created. Receive stock to make it sellable.`, { productId: p.id });
}

export function updateProduct(state, id, payload) {
  const v = validateProduct(payload, state.products, { currentId: id });
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const p = next.products.find((x) => x.id === id);
  if (!p) return fail('Product not found.');
  Object.assign(p, {
    sku: payload.sku.trim(), barcode: payload.barcode?.trim() || '',
    name: payload.name.trim(), categoryId: payload.categoryId,
    description: payload.description?.trim() || '',
    unit: payload.unit || p.unit,
    costPrice: Math.round(payload.costPrice), sellPrice: Math.round(payload.sellPrice),
    reorderLevel: Math.round(payload.reorderLevel), supplierId: payload.supplierId || null,
    trackExpiry: !!payload.trackExpiry, trackBatch: !!payload.trackBatch,
  });
  pushActivity(next, { action: 'product_updated', refId: p.sku, productId: p.id, description: `Product edited: “${p.name}”.` });
  return ok(next, `Product “${p.name}” updated.`);
}

export function archiveProduct(state, id, { confirmZero = false } = {}) {
  const next = clone(state);
  const p = next.products.find((x) => x.id === id);
  if (!p) return fail('Product not found.');
  const units = totalOnHand(next, id);
  if (units > 0 && !confirmZero) {
    return fail(`“${p.name}” still holds ${units} units of stock. Write the stock off via Stock Issuance (or transfer it) before archiving.`);
  }
  p.status = 'archived';
  pushActivity(next, { action: 'product_archived', refId: p.sku, productId: id, description: `Product archived: “${p.name}”. Historical records remain intact.` });
  return ok(next, `“${p.name}” archived.`);
}

export function deleteProduct(state, id) {
  const next = clone(state);
  const p = next.products.find((x) => x.id === id);
  if (!p) return fail('Product not found.');
  if (totalOnHand(next, id) > 0) return fail(`Cannot delete “${p.name}”: stock is still on hand. Archive it instead.`);
  const used = state.sales.some((s) => s.lines.some((l) => l.productId === id))
    || state.receipts.some((r) => r.lines.some((l) => l.productId === id))
    || state.issues.some((i) => i.lines.some((l) => l.productId === id))
    || state.transfers.some((t) => t.lines.some((l) => l.productId === id));
  if (used) return fail(`Cannot delete “${p.name}”: it appears in historical transactions, which must not be erased. Archive it instead.`);
  next.products = next.products.filter((x) => x.id !== id);
  next.batches = next.batches.filter((b) => b.productId !== id);
  pushActivity(next, { action: 'product_deleted', refId: p.sku, productId: id, description: `Product deleted: “${p.name}”.` });
  return ok(next, `“${p.name}” deleted.`);
}

export function createSupplier(state, payload) {
  const v = validateSupplier(payload);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const s = { id: newId('sup'), companyName: payload.companyName.trim(), contactPerson: payload.contactPerson?.trim() || '', phone: payload.phone?.trim() || '', email: payload.email?.trim() || '', address: payload.address?.trim() || '', notes: payload.notes?.trim() || '', createdAt: nowIso(), isSeeded: false };
  next.suppliers.push(s);
  pushActivity(next, { action: 'supplier_created', refId: s.companyName, description: `Supplier added: “${s.companyName}”.` });
  return ok(next, `Supplier “${s.companyName}” added.`);
}
export function updateSupplier(state, id, payload) {
  const v = validateSupplier(payload);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const s = next.suppliers.find((x) => x.id === id);
  if (!s) return fail('Supplier not found.');
  Object.assign(s, { companyName: payload.companyName.trim(), contactPerson: payload.contactPerson?.trim() || '', phone: payload.phone?.trim() || '', email: payload.email?.trim() || '', address: payload.address?.trim() || '', notes: payload.notes?.trim() || '' });
  pushActivity(next, { action: 'supplier_updated', refId: s.companyName, description: `Supplier updated: “${s.companyName}”.` });
  return ok(next, `Supplier “${s.companyName}” updated.`);
}

export function deleteSupplier(state, id) {
  const s = state.suppliers.find((x) => x.id === id);
  if (!s) return fail('Supplier not found.');
  if (state.products.some((p) => p.supplierId === id && p.status === 'active')) {
    return fail('This supplier is linked to active products. Re-assign those products first.');
  }
  if (state.receipts.some((r) => r.supplierId === id)) {
    return fail(`Cannot delete “${s.companyName}”: receiving history references this supplier, which must stay intact.`);
  }
  const next = clone(state);
  next.suppliers = next.suppliers.filter((x) => x.id !== id);
  pushActivity(next, { action: 'supplier_deleted', refId: s.companyName, description: `Supplier deleted: “${s.companyName}”.` });
  return ok(next, `Supplier “${s.companyName}” deleted.`);
}

export function createCategory(state, payload) {
  const v = validateCategory(payload, state.categories);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const c = { id: newId('cat'), name: payload.name.trim(), description: payload.description?.trim() || '', color: payload.color || '#5b8def' };
  next.categories.push(c);
  pushActivity(next, { action: 'category_created', refId: c.name, description: `Category added: “${c.name}”.` });
  return ok(next, `Category “${c.name}” added.`);
}
export function updateCategory(state, id, payload) {
  const v = validateCategory(payload, state.categories, { currentId: id });
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const c = next.categories.find((x) => x.id === id);
  if (!c) return fail('Category not found.');
  Object.assign(c, { name: payload.name.trim(), description: payload.description?.trim() || '', color: payload.color || c.color });
  pushActivity(next, { action: 'category_updated', refId: c.name, description: `Category updated: “${c.name}”.` });
  return ok(next, `Category “${c.name}” updated.`);
}
export function deleteCategory(state, id) {
  const next = clone(state);
  const c = next.categories.find((x) => x.id === id);
  if (!c) return fail('Category not found.');
  if (state.products.some((p) => p.categoryId === id && p.status === 'active')) {
    return fail('This category is assigned to active products. Re-assign them first.');
  }
  next.categories = next.categories.filter((x) => x.id !== id);
  pushActivity(next, { action: 'category_deleted', refId: c.name, description: `Category deleted: “${c.name}”.` });
  return ok(next, `Category “${c.name}” deleted.`);
}

export function createCustomer(state, payload) {
  const v = validateCustomer(payload);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const c = { id: newId('cus'), name: payload.name.trim(), phone: payload.phone?.trim() || '', email: payload.email?.trim() || '', notes: payload.notes?.trim() || '', createdAt: nowIso(), isSeeded: false };
  next.customers.push(c);
  pushActivity(next, { action: 'customer_created', refId: c.name, description: `Customer added: “${c.name}”.` });
  return ok(next, `Customer “${c.name}” added.`, { customerId: c.id });
}
export function updateCustomer(state, id, payload) {
  const v = validateCustomer(payload);
  if (!v.ok) return fail('Please fix the highlighted fields.', v.errors);
  const next = clone(state);
  const c = next.customers.find((x) => x.id === id);
  if (!c) return fail('Customer not found.');
  Object.assign(c, { name: payload.name.trim(), phone: payload.phone?.trim() || '', email: payload.email?.trim() || '', notes: payload.notes?.trim() || '' });
  pushActivity(next, { action: 'customer_updated', refId: c.name, description: `Customer updated: “${c.name}”.` });
  return ok(next, `Customer “${c.name}” updated.`);
}

export function deleteCustomer(state, id) {
  const c = state.customers.find((x) => x.id === id);
  if (!c) return fail('Customer not found.');
  if (state.sales.some((s) => s.customerId === id)) {
    return fail(`Cannot delete “${c.name}”: sales receipts reference this customer, which must stay intact.`);
  }
  const next = clone(state);
  next.customers = next.customers.filter((x) => x.id !== id);
  pushActivity(next, { action: 'customer_deleted', refId: c.name, description: `Customer deleted: “${c.name}”.` });
  return ok(next, `Customer “${c.name}” deleted.`);
}

export function updateSettings(state, patch) {
  const next = clone(state);
  next.settings = { ...next.settings, ...patch };
  pushActivity(next, { action: 'settings_updated', refId: 'Settings', description: `Settings updated (${Object.keys(patch).join(', ')}).` });
  return ok(next, 'Settings saved.');
}

export function markNotificationsRead(state, ids = null) {
  const next = clone(state);
  for (const n of next.notifications) {
    if (!ids || ids.includes(n.id)) n.read = true;
  }
  return ok(next);
}

export function clearNotifications(state) {
  const next = clone(state);
  next.notifications = [];
  return ok(next, 'All notifications cleared.');
}

/* ------------------------------------------------------------------ */
/* BATCH ENGINE HELPERS                                                */
/* ------------------------------------------------------------------ */

function sortFefo(list) {
  return [...list].sort((a, b) => {
    const da = a.expDate ? new Date(a.expDate).setHours(0, 0, 0, 0) : Infinity;
    const db = b.expDate ? new Date(b.expDate).setHours(0, 0, 0, 0) : Infinity;
    if (da !== db) return da - db;
    return new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0);
  });
}

const isExpiredBatch = (b, todayStart = new Date(new Date().setHours(0, 0, 0, 0))) => b.expDate && new Date(new Date(b.expDate).setHours(0, 0, 0, 0)) < todayStart;

/**
 * Consume `qty` units from `pool` (an array of batch row REFERENCES belonging to
 * the state). Mutates qty of consumed batches. Returns allocations.
 * Throws Error('STOCK_SHORT:<n>') when the pool cannot cover `qty`.
 */
function consumeFromPool(pool, qty, { excludeExpired = false } = {}) {
  // FEFO: earliest expiry consumes first — expired batches are always the
  // earliest-dated ones, so plain FEFO already satisfies "expired first".
  const usable = sortFefo(pool.filter((b) => b.qty > 0 && (!excludeExpired || !isExpiredBatch(b))));
  const alloc = [];
  let remaining = qty;
  for (const b of usable) {
    if (remaining <= 0) break;
    const take = Math.min(b.qty, remaining);
    b.qty -= take;
    remaining -= take;
    alloc.push({ batchId: b.id, qty: take, batchNo: b.batchNo, expDate: b.expDate || null, cost: b.cost });
  }
  if (remaining > 0) {
    // rollback partial consumption for safety
    for (const a of alloc.map((x) => ({ batchId: x.batchId, qty: x.qty }))) {
      const b = usable.find((x) => x.id === a.batchId);
      if (b) b.qty += a.qty;
    }
    throw new Error(`STOCK_SHORT:${remaining}`);
  }
  return alloc;
}

function createOrMergeBatch(next, { productId, locationId, batchNo, expDate, mfgDate, qty, cost, source, receivedAt }) {
  const key = batchNo || 'BASE';
  const match = next.batches.find(
    (b) => b.productId === productId && b.locationId === locationId && b.batchNo === key && (b.expDate || null) === (expDate || null) && b.qty > 0,
  );
  if (match) {
    match.qty += qty;
    match.cost = cost;
    if (receivedAt) match.receivedAt = receivedAt;
    match.source = source || match.source;
    return match;
  }
  const batch = {
    id: newId('bt'),
    productId, locationId, batchNo: batchNo || 'BASE',
    expDate: expDate || null, mfgDate: mfgDate || null,
    qty, cost, receivedAt: receivedAt || nowIso(), source: source || 'manual',
  };
  next.batches.push(batch);
  return batch;
}

/** WAC update after ADDING `addedQty` units at `unitCost`. */
function updateCostBasis(next, product, addedQty, unitCost) {
  if (!addedQty) return;
  const onHandNow = next.batches.reduce((a, b) => (b.productId === product.id ? a + b.qty : a), 0);
  const prevQty = onHandNow - addedQty;
  if (prevQty <= 0) { product.costPrice = Math.round(unitCost); return; }
  product.costPrice = Math.round((prevQty * product.costPrice + addedQty * unitCost) / (prevQty + addedQty));
}

function notifyStockTransitions(prevState, nextState, productIds) {
  const ids = Array.isArray(productIds) ? productIds : Object.keys(productIds || {});
  for (const pid of ids) {
    const product = nextState.products.find((x) => x.id === pid);
    if (!product || product.status !== 'active') continue;
    for (const l of nextState.locations) {
      const afterAvail = available(nextState, pid, l.id);
      const afterOnHand = onHand(nextState, pid, l.id);
      const beforeAvail = batchesOf(prevState, pid, l.id).reduce((a, b) => a + b.qty, 0);
      if (afterOnHand <= 0 && beforeAvail > 0) {
        pushNotification(nextState, 'out_of_stock', 'Out of stock', `${product.name} has run out at ${l.name}.`);
      } else if (afterAvail <= product.reorderLevel && beforeAvail > product.reorderLevel) {
        pushNotification(nextState, 'low_stock', 'Low stock alert', `${product.name} is low at ${l.name}: ${afterAvail} ${product.unit} available (reorder level ${product.reorderLevel}).`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* STOCK RECEIVING                                                     */
/* ------------------------------------------------------------------ */

export function receiveStock(state, payload) {
  const next = clone(state);
  const supplier = next.suppliers.find((s) => s.id === payload.supplierId);
  if (!supplier) return fail('Select a valid supplier.');
  const location = next.locations.find((l) => l.id === payload.locationId);
  if (!location) return fail('Select a valid destination warehouse.');
  if (!payload.lines?.length) return fail('Add at least one product line.');
  if (!String(payload.date || '').trim() || Number.isNaN(Date.parse(payload.date))) return fail('Enter a valid receiving date.');

  const added = [];
  for (const line of payload.lines) {
    const product = next.products.find((p) => p.id === line.productId);
    if (!product || product.status !== 'active') return fail('A receipt line references an invalid or archived product.');
    const qty = line.qty, unitCost = line.unitCost;
    if (!Number.isInteger(qty) || qty <= 0) return fail(`Quantity for “${product.name}” must be a whole number ≥ 1.`);
    if (!Number.isInteger(unitCost) || unitCost < 0) return fail(`Unit cost for “${product.name}” must be 0 or greater.`);
    if (product.trackBatch && !String(line.batchNo || '').trim()) return fail(`Batch number is required for batch-tracked product “${product.name}”.`);
    if (product.trackExpiry && !line.expDate) return fail(`Expiry date is required for perishable product “${product.name}”.`);
    added.push({ product, qty, unitCost, line });
  }

  const ref = `RCV-${padNum(nextCounter(next, 'rcv'), 4)}`;
  const receivedAtIso = `${payload.date}T${new Date().toTimeString().slice(0, 8)}`;
  for (const { product, qty, unitCost, line } of added) {
    createOrMergeBatch(next, {
      productId: product.id, locationId: location.id,
      batchNo: product.trackBatch ? String(line.batchNo).trim() : 'BASE',
      expDate: product.trackExpiry ? line.expDate : null,
      mfgDate: product.trackExpiry ? (line.mfgDate || null) : null,
      qty, cost: unitCost, source: ref, receivedAt: receivedAtIso,
    });
    updateCostBasis(next, product, qty, unitCost);
    bumpMovement(next, product.id);
  }

  const receipt = {
    id: newId('rcv'), ref, supplierId: supplier.id, locationId: location.id,
    invoiceNo: payload.invoiceNo?.trim() || '', date: payload.date,
    notes: payload.notes?.trim() || '', createdAt: nowIso(), isSeeded: false,
    lines: added.map(({ product, qty, unitCost, line }) => ({
      productId: product.id, qty, unitCost,
      batchNo: product.trackBatch ? String(line.batchNo).trim() : '',
      expDate: product.trackExpiry ? (line.expDate || null) : null,
      mfgDate: product.trackExpiry ? (line.mfgDate || null) : null,
    })),
  };
  next.receipts.unshift(receipt);

  const summary = added.map((r) => `${r.qty} × ${r.product.name}`).join(', ');
  pushActivity(next, { action: 'stock_receipt', refId: ref, productId: added[0].product.id, locationId: location.id, qtyDelta: added.reduce((a, r) => a + r.qty, 0), description: `Stock received ${ref} from “${supplier.companyName}” at ${location.name}: ${summary}${payload.invoiceNo ? ` (invoice ${payload.invoiceNo})` : ''}.` });
  pushNotification(next, 'receipt', 'Stock received', `${ref}: ${summary} received at ${location.name}.`, { ref });
  notifyStockTransitions(state, next, added.map((r) => r.product.id));

  return ok(next, `Receipt ${ref} recorded — stock added at ${location.name}.`, { ref });
}

/* ------------------------------------------------------------------ */
/* STOCK ISSUANCE                                                      */
/* ------------------------------------------------------------------ */

export function issueStock(state, payload) {
  if (!payload.lines?.length) return fail('Add at least one product line.');
  const next = clone(state);
  const source = next.locations.find((l) => l.id === payload.sourceLocationId);
  if (!source) return fail('Select a valid source location.');
  const reasonDef = ISSUE_REASONS.find((r) => r.id === payload.reason);
  if (!reasonDef) return fail('Select a valid reason.');

  let destinationDesc = '';
  if (reasonDef.needsShopDest) {
    const dest = next.locations.find((l) => l.id === payload.destinationLocationId);
    if (!dest || dest.type !== 'shop') return fail('Shop replenishment requires a destination shop.');
    if (dest.id === source.id) return fail('Source and destination must differ.');
    destinationDesc = dest.name;
  } else {
    destinationDesc = String(payload.destination || '').trim() || reasonDef.label;
  }

  // Full pre-validation BEFORE committing anything.
  const planned = [];
  for (const line of payload.lines) {
    const product = next.products.find((p) => p.id === line.productId);
    if (!product || product.status !== 'active') return fail('An issuance line references an invalid or archived product.');
    if (!Number.isInteger(line.qty) || line.qty <= 0) return fail(`Quantity for “${product.name}” must be a whole number ≥ 1.`);
    const avail = available(next, product.id, source.id);
    if (line.qty > avail) {
      return fail(`Insufficient stock: “${product.name}” has only ${avail} of ${line.qty} requested available at ${source.name}.`, { lineIndex: planned.length, productId: product.id });
    }
    planned.push({ product, qty: line.qty });
  }

  const ref = `ISS-${padNum(nextCounter(next, 'iss'), 4)}`;
  const issued = [];
  for (const { product, qty } of planned) {
    const pool = batchesOf(next, product.id, source.id);
    let alloc;
    try {
      alloc = consumeFromPool(pool, qty);
    } catch (e) {
      if (String(e.message).startsWith('STOCK_SHORT')) {
        return fail(`Stock changed while validating: not enough “${product.name}” at ${source.name}.`);
      }
      return fail('Unexpected error during issuance.');
    }
    issued.push({ product, qty, alloc });
    bumpMovement(next, product.id);
  }

  // For replenishment-style reasons the destination shop must CREDIT the exact
  // batches that left the source (expiry dates and per-batch cost preserved).
  if (reasonDef.needsShopDest) {
    for (const { product, alloc } of issued) {
      for (const a of alloc) {
        createOrMergeBatch(next, {
          productId: product.id,
          locationId: payload.destinationLocationId,
          batchNo: a.batchNo || 'BASE',
          expDate: a.expDate || null,
          mfgDate: null,
          qty: a.qty,
          cost: a.cost ?? product.costPrice,
          source: ref,
        });
      }
    }
  }

  const issue = {
    id: newId('iss'), ref, sourceLocationId: source.id, reason: payload.reason,
    destination: destinationDesc,
    destinationLocationId: reasonDef.needsShopDest ? payload.destinationLocationId : null,
    reference: payload.reference?.trim() || '',
    notes: payload.notes?.trim() || '',
    lines: issued.map(({ product, qty, alloc }) => ({ productId: product.id, qty, batchAllocations: alloc })),
    createdAt: nowIso(), operator: next.settings.operator || 'Demo Operator', isSeeded: false,
  };
  next.issues.unshift(issue);

  const summary = issued.map((r) => `${r.qty} × ${r.product.name}`).join(', ');
  pushActivity(next, { action: 'stock_issue', refId: ref, productId: issued[0].product.id, locationId: source.id, qtyDelta: -issued.reduce((a, r) => a + r.qty, 0), description: `Stock issued ${ref} from ${source.name} (${reasonDef.label} → ${destinationDesc}): ${summary}.` });
    if (payload.reason === 'damaged_stock' || payload.reason === 'expired_stock') {
    pushNotification(next, 'issue', 'Stock written off', `${ref}: ${summary} (${reasonDef.label}).`);
  }
  notifyStockTransitions(state, next, planned.map((r) => r.product.id));

  return ok(next, `Issuance ${ref} completed — ${issued.reduce((a, r) => a + r.qty, 0)} units issued.`, { ref });
}

/* ------------------------------------------------------------------ */
/* TRANSFERS                                                           */
/* ------------------------------------------------------------------ */

export function createTransfer(state, payload) {
  if (!payload.lines?.length) return fail('Add at least one product line.');
  const next = clone(state);
  const source = next.locations.find((l) => l.id === payload.sourceLocationId);
  const dest = next.locations.find((l) => l.id === payload.destinationLocationId);
  if (!source || !dest) return fail('Select valid source and destination locations.');
  if (source.id === dest.id) return fail('Source and destination must differ.');

  // Validate: after creating this pending transfer, availability must remain >= 0
  const demand = {};
  for (const line of payload.lines) {
    const product = next.products.find((p) => p.id === line.productId);
    if (!product || product.status !== 'active') return fail('A transfer line references an invalid or archived product.');
    if (!Number.isInteger(line.qty) || line.qty <= 0) return fail(`Quantity for “${product.name}” must be a whole number ≥ 1.`);
    demand[line.productId] = (demand[line.productId] || 0) + line.qty;
  }
  for (const [pid, qty] of Object.entries(demand)) {
    const product = next.products.find((p) => p.id === pid);
    const avail = available(next, pid, source.id);
    if (qty > avail) return fail(`Insufficient available stock for “${product.name}” at ${source.name}: ${avail} (including pending reservations).`);
  }

  const ref = `TRF-${padNum(nextCounter(next, 'trf'), 4)}`;
  const transfer = {
    id: newId('trf'), ref, sourceLocationId: source.id, destinationLocationId: dest.id,
    lines: payload.lines.map((l) => ({ productId: l.productId, qty: l.qty, batchAllocations: [] })),
    status: 'pending', notes: payload.notes?.trim() || '',
    createdAt: nowIso(), dispatchedAt: null, receivedAt: null, cancelledAt: null,
    history: [{ status: 'pending', at: nowIso() }], isSeeded: false,
  };
  next.transfers.unshift(transfer);
  pushActivity(next, { action: 'transfer_created', refId: ref, productId: payload.lines[0].productId, locationId: source.id, qtyDelta: null, description: `Transfer ${ref} created (pending): ${payload.lines.map((l) => `${l.qty} × ${productName(next, l.productId)}`).join(', ')} — ${source.name} → ${dest.name}.` });
  return ok(next, `Transfer ${ref} created and stock reserved at ${source.name}. Dispatch when ready.`);
}

export function dispatchTransfer(state, id) {
  const next = clone(state);
  const t = next.transfers.find((x) => x.id === id);
  if (!t) return fail('Transfer not found.');
  if (t.status !== 'pending') return fail(`Only pending transfers can be dispatched (current status: ${t.status.replace('_', ' ')}).`);
  const source = next.locations.find((l) => l.id === t.sourceLocationId);

  try {
    for (const line of t.lines) {
      const product = next.products.find((p) => p.id === line.productId);
      const pool = batchesOf(next, line.productId, t.sourceLocationId);
      // at dispatch the pending reservation is lifted; availability = onHand - other pending
      const otherPendingReserve = next.transfers
        .filter((x) => x.id !== t.id && x.status === 'pending' && x.sourceLocationId === t.sourceLocationId)
        .reduce((a, x) => a + x.lines.reduce((s, l) => (l.productId === line.productId ? s + l.qty : s), 0), 0);
      const onHandNow = pool.reduce((a, b) => a + b.qty, 0);
      if (line.qty > Math.max(0, onHandNow - otherPendingReserve)) {
        throw new Error(`Stock no longer available for “${product.name}” at ${source.name}.`);
      }
      line.batchAllocations = consumeFromPool(pool, line.qty);
      bumpMovement(next, line.productId);
    }
  } catch (e) {
    if (String(e.message).startsWith('Stock no longer')) return fail(e.message);
    return fail('Unexpected error during dispatch.');
  }

  t.status = 'in_transit';
  t.dispatchedAt = nowIso();
  t.history.push({ status: 'in_transit', at: nowIso() });
  pushActivity(next, { action: 'transfer_dispatch', refId: t.ref, productId: t.lines[0].productId, locationId: t.sourceLocationId, qtyDelta: null, description: `Transfer ${t.ref} dispatched from ${source.name} — ${t.lines.map((l) => `${l.qty} × ${productName(next, l.productId)}`).join(', ')} now in transit.` });
  pushNotification(next, 'transfer', 'Transfer dispatched', `${t.ref} left ${source.name} for ${next.locations.find((l) => l.id === t.destinationLocationId).name}.`, { ref: t.ref });
  return ok(next, `Transfer ${t.ref} dispatched — stock is now in transit.`);
}

export function receiveTransfer(state, id, receivedLocationId = null) {
  const next = clone(state);
  const t = next.transfers.find((x) => x.id === id);
  if (!t) return fail('Transfer not found.');
  if (t.status !== 'in_transit') return fail(`Only in-transit transfers can be received (current status: ${t.status.replace('_', ' ')}).`);
  const dest = next.locations.find((l) => l.id === (receivedLocationId || t.destinationLocationId));
  if (!dest) return fail('Destination location not found.');

  for (const line of t.lines) {
    const product = next.products.find((p) => p.id === line.productId);
    if (!product) return fail('Transfer references a deleted product.');
    const addedQty = line.qty;
    for (const alloc of line.batchAllocations || []) {
      createOrMergeBatch(next, {
        productId: line.productId, locationId: dest.id,
        batchNo: alloc.batchNo || 'BASE',
        expDate: alloc.expDate || null,
        mfgDate: null,
        qty: alloc.qty, cost: alloc.cost ?? product.costPrice,
        source: t.ref,
      });
    }
    if (!line.batchAllocations?.length) {
      // Defensive: allocation info missing — restore transparently as a new batch.
      createOrMergeBatch(next, { productId: line.productId, locationId: dest.id, batchNo: 'BASE', expDate: null, mfgDate: null, qty: addedQty, cost: product.costPrice, source: t.ref });
    }
    updateCostBasis(next, product, addedQty, product.costPrice);
    bumpMovement(next, line.productId);
    pushActivity(next, { action: 'transfer_received', refId: t.ref, productId: line.productId, locationId: dest.id, qtyDelta: addedQty, description: `Transfer ${t.ref} received at ${dest.name}: +${addedQty} × ${product.name}.` });
  }

  t.status = 'received';
  t.receivedAt = nowIso();
  t.history.push({ status: 'received', at: nowIso() });
  pushNotification(next, 'transfer', 'Transfer received', `${t.ref} received at ${dest.name} (${t.lines.reduce((a, l) => a + l.qty, 0)} units added).`, { ref: t.ref });
  notifyStockTransitions(state, next, t.lines.map((l) => l.productId));
  return ok(next, `Transfer ${t.ref} received — stock added at ${dest.name}.`);
}

export function cancelTransfer(state, id, reason = '') {
  const next = clone(state);
  const t = next.transfers.find((x) => x.id === id);
  if (!t) return fail('Transfer not found.');
  if (t.status === 'received') return fail('A received transfer cannot be cancelled. Use a return transfer or a stock adjustment instead.');
  if (t.status === 'cancelled') return fail('Transfer is already cancelled.');

  if (t.status === 'in_transit') {
    // safe reversal: put the dispatched quantities back into the exact batches
    for (const line of t.lines) {
      for (const alloc of line.batchAllocations || []) {
        const b = next.batches.find((x) => x.id === alloc.batchId);
        if (b) b.qty += alloc.qty;
        else {
          const product = next.products.find((p) => p.id === line.productId);
          createOrMergeBatch(next, { productId: line.productId, locationId: t.sourceLocationId, batchNo: alloc.batchNo, expDate: alloc.expDate, mfgDate: null, qty: alloc.qty, cost: alloc.cost ?? (product ? product.costPrice : 0), source: `${t.ref}-reversal` });
        }
      }
      line.reversed = true; // allocations retained for audit; qty restored above
      bumpMovement(next, line.productId);
    }
    pushActivity(next, { action: 'transfer_cancelled', refId: t.ref, productId: t.lines[0].productId, locationId: t.sourceLocationId, qtyDelta: null, description: `In-transit transfer ${t.ref} cancelled — stock returned to ${next.locations.find((l) => l.id === t.sourceLocationId).name}. ${reason || ''}`.trim() });
  } else {
    pushActivity(next, { action: 'transfer_cancelled', refId: t.ref, productId: t.lines[0].productId, locationId: t.sourceLocationId, qtyDelta: null, description: `Pending transfer ${t.ref} cancelled before dispatch — reservation released. ${reason || ''}`.trim() });
  }

  t.status = 'cancelled';
  t.cancelledAt = nowIso();
  t.history.push({ status: 'cancelled', at: nowIso() });
  pushNotification(next, 'transfer', 'Transfer cancelled', `${t.ref} cancelled.${reason ? ` Reason: ${reason}` : ''}`, { ref: t.ref });
  return ok(next, `Transfer ${t.ref} cancelled.`);
}

/* ------------------------------------------------------------------ */
/* STOCK ADJUSTMENTS                                                   */
/* ------------------------------------------------------------------ */

export function adjustStock(state, payload) {
  const next = clone(state);
  const product = next.products.find((p) => p.id === payload.productId);
  if (!product) return fail('Select a valid product.');
  const location = next.locations.find((l) => l.id === payload.locationId);
  if (!location) return fail('Select a valid location.');
  if (!Number.isInteger(payload.adjustedQty) || payload.adjustedQty < 0) {
    return fail('Counted quantity must be a whole number ≥ 0.');
  }
  if (payload.adjustedQty > 999999) return fail('Quantity is unrealistically large.');
  const reasonDef = ADJUSTMENT_REASONS.find((r) => r.id === payload.reason);
  if (!reasonDef) return fail('Select an adjustment reason.');

  const previousQty = onHand(next, payload.productId, location.id);
  const diff = payload.adjustedQty - previousQty;
  if (diff === 0) return fail('Counted quantity equals the current record — nothing to adjust.');

  if (diff < 0) {
    // Down-adjustment consumes stock: expired batches first (they are the usual
    // cause of shrinkage), then FEFO.
    const pool = batchesOf(next, payload.productId, location.id);
    if (pool.reduce((a, b) => a + b.qty, 0) < Math.abs(diff)) return fail('Not enough on-hand batches to adjust down — inconsistency detected, please report.');
    try {
      consumeFromPool(pool, Math.abs(diff));
    } catch {
      return fail('Not enough on-hand stock to complete this write-down.');
    }
  } else {
    createOrMergeBatch(next, {
      productId: product.id, locationId: location.id,
      batchNo: product.trackBatch ? `ADJ-${payload.productId.slice(-4).toUpperCase()}` : 'BASE',
      expDate: product.trackExpiry ? `${new Date(Date.now() + 180 * MS_DAY).toISOString().slice(0, 10)}T00:00:00` : null,
      mfgDate: null, qty: diff, cost: product.costPrice, source: 'adjustment',
    });
  }
  bumpMovement(next, product.id);

  const ref = `ADJ-${padNum(nextCounter(next, 'adj'), 4)}`;
  const adjustment = {
    id: newId('adj'), ref, productId: product.id, locationId: location.id,
    previousQty, adjustedQty: payload.adjustedQty, difference: diff,
    reason: payload.reason, notes: payload.notes?.trim() || '',
    operator: next.settings.operator || 'Demo Operator', createdAt: nowIso(), isSeeded: false,
  };
  next.adjustments.unshift(adjustment);

  const sign = diff > 0 ? '+' : '';
  pushActivity(next, { action: 'adjustment', refId: ref, productId: product.id, locationId: location.id, qtyDelta: diff, description: `Stock adjustment ${ref}: ${product.name} @ ${location.name} — recorded ${previousQty}, counted ${payload.adjustedQty} (${sign}${diff}) — ${reasonDef.label}.${payload.notes ? ` Note: ${payload.notes}` : ''}` });
  pushNotification(next, 'adjustment', 'Inventory adjusted', `${ref}: ${product.name} @ ${location.name} ${sign}${diff} (${reasonDef.label}).`, { ref });
  notifyStockTransitions(state, next, [product.id]);

  return ok(next, `Adjustment ${ref} saved — ${location.name} stock set to ${payload.adjustedQty}.`, { ref });
}

/* ------------------------------------------------------------------ */
/* SALES                                                               */
/* ------------------------------------------------------------------ */

export function completeSale(state, payload) {
  if (!payload.lines?.length) return fail('The cart is empty.');
  const next = clone(state);
  const shop = next.locations.find((l) => l.id === payload.locationId);
  if (!shop || shop.type !== 'shop') return fail('Select a valid shop location.');
  const taxRatePct = Number.isFinite(next.settings.taxRatePct) ? next.settings.taxRatePct : 0;

  // validate lines & allocate FEFO among non-expired batches
  const prepared = [];
  for (const line of payload.lines) {
    const product = next.products.find((p) => p.id === line.productId);
    if (!product || product.status !== 'active') return fail('The cart contains an invalid or archived product.');
    if (!Number.isInteger(line.qty) || line.qty <= 0) return fail(`Quantity for “${product.name}” must be a whole number ≥ 1.`);
    if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) return fail(`Price for “${product.name}” is invalid.`);
    const eligible = batchesOf(next, product.id, shop.id).filter((b) => !isExpiredBatch(b));
    const eligibleQty = eligible.reduce((a, b) => a + b.qty, 0);
    if (line.qty > eligibleQty) {
      const expiredQty = onHand(next, product.id, shop.id) - eligibleQty;
      return fail(
        expiredQty > 0
          ? `Cannot sell ${line.qty} × “${product.name}”: only ${eligibleQty} sellable units at ${shop.name} (${expiredQty} are expired and cannot be sold).`
          : `Insufficient shop stock: “${product.name}” has only ${eligibleQty} units at ${shop.name}.`,
        { productId: product.id },
      );
    }
    let alloc;
    try {
      alloc = consumeFromPool(batchesOf(next, product.id, shop.id), line.qty, { excludeExpired: true });
    } catch {
      return fail(`Could not allocate batches for “${product.name}” — expired stock cannot be sold.`);
    }
    prepared.push({ product, qty: line.qty, unitPrice: line.unitPrice, batchAllocations: alloc });
  }

  // financial math (integer minor units)
  const subtotal = prepared.reduce((a, r) => a + r.unitPrice * r.qty, 0);
  let discount = 0;
  if (payload.discountType === 'pct') {
    discount = Math.round((subtotal * (Number(payload.discountValue) || 0)) / 100);
  } else if (payload.discountType === 'amount') {
    discount = Math.min(Math.round(Number(payload.discountValue) || 0), subtotal);
  }
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * taxRatePct) / 100);
  const total = taxable + tax;

  const method = payload.paymentMethod || 'cash';
  let amountReceived = Math.round(Number(payload.amountReceived) || 0);
  if (!Number.isInteger(amountReceived) || amountReceived < 0) return fail('Invalid amount received.');
  if (amountReceived < total) {
    return fail(`Payment insufficient: ${method === 'cash' ? `cash received is less than the grand total` : `received amount is less than the total due`}. Collect at least the full amount for a paid sale.`);
  }
  if (method !== 'cash' && amountReceived > total) {
    return fail(`${method === 'card' ? 'Card payments' : 'This payment method'} must equal the grand total — adjust the tendered amount.`);
  }
  const change = amountReceived - total;

  const salN = nextCounter(next, 'sal');
  const receiptNo = `SAL-${padNum(salN, 4)}`;
  const sale = {
    id: newId('sal'), ref: receiptNo, receiptNo, locationId: shop.id,
    lines: prepared.map((r) => ({ productId: r.product.id, qty: r.qty, unitPrice: r.unitPrice, discount: 0, batchAllocations: r.batchAllocations })),
    subtotal, discount, discountType: payload.discountType || 'amount', discountValue: Number(payload.discountValue) || 0,
    tax, total, paymentMethod: method, amountReceived, change, paymentStatus: 'paid',
    customerId: payload.customerId || null,
    status: 'completed', returnedTotal: 0, returns: [],
    notes: payload.notes?.trim() || '', createdAt: nowIso(), isSeeded: false,
    operator: next.settings.operator || 'Demo Operator',
  };
  next.sales.unshift(sale);

  for (const r of prepared) {
    bumpMovement(next, r.product.id);
    pushActivity(next, { action: 'sale', refId: receiptNo, productId: r.product.id, locationId: shop.id, qtyDelta: -r.qty, description: `POS sale ${receiptNo}: ${r.qty} × ${r.product.name} @ ${(r.unitPrice / 100).toFixed(2)} at ${shop.name}.` });
  }
  pushNotification(next, 'sale', 'Sale completed', `${receiptNo} — ${prepared.length} line(s), total ${(total / 100).toFixed(2)} via ${method.toUpperCase()}.`, { ref: receiptNo });
  notifyStockTransitions(state, next, prepared.map((r) => r.product.id));

  return ok(next, `Sale ${receiptNo} completed. Change due: ${(change / 100).toFixed(2)}.`, { saleId: sale.id, receiptNo, sale });
}

export function processReturn(state, { saleId, lines, reason, notes }) {
  const next = clone(state);
  const sale = next.sales.find((s) => s.id === saleId);
  if (!sale) return fail('Sale not found.');
  if (sale.status === 'returned') return fail('This sale has already been fully returned.');
  if (!lines?.length) return fail('Select at least one item to return.');

  const shop = next.locations.find((l) => l.id === sale.locationId);
  const retLines = [];
  for (const rl of lines) {
    const saleLine = sale.lines.find((l) => l.productId === rl.productId);
    if (!saleLine) return fail('Return references an item not on this receipt.');
    const soldQty = saleLine.qty;
    const alreadyReturned = (sale.returns || []).reduce((a, r) => a + r.lines.filter((x) => x.productId === rl.productId).reduce((b, x) => b + x.qty, 0), 0);
    const maxReturnable = soldQty - alreadyReturned;
    if (!Number.isInteger(rl.qty) || rl.qty <= 0) return fail('Return quantity must be a whole number ≥ 1.');
    if (rl.qty > maxReturnable) return fail(`Only ${maxReturnable} of ${soldQty} × “${productName(next, rl.productId)}” can still be returned.`);
    retLines.push({ productId: rl.productId, qty: rl.qty });
  }

  // Refund shares the order discount/tax proportionally.
  const factor = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
  let refundTotal = 0;
  for (const rl of retLines) {
    const saleLine = sale.lines.find((l) => l.productId === rl.productId);
    refundTotal += Math.round(saleLine.unitPrice * rl.qty * factor);
  }

  // restore inventory: prefer putting units back into the original batches
  for (const rl of retLines) {
    const saleLine = sale.lines.find((l) => l.productId === rl.productId);
    let remaining = rl.qty;
    for (const alloc of saleLine.batchAllocations || []) {
      if (remaining <= 0) break;
      const give = Math.min(alloc.qty - (alloc.returnedQty || 0), remaining);
      if (give <= 0) continue;
      const b = next.batches.find((x) => x.id === alloc.batchId);
      if (b) {
        b.qty += give;
      } else {
        const product = next.products.find((p) => p.id === rl.productId);
        createOrMergeBatch(next, {
          productId: rl.productId, locationId: sale.locationId,
          batchNo: alloc.batchNo || 'BASE', expDate: alloc.expDate || null, mfgDate: null,
          qty: give, cost: alloc.cost ?? (product ? product.costPrice : 0), source: 'return',
        });
      }
      alloc.returnedQty = (alloc.returnedQty || 0) + give;
      remaining -= give;
    }
    if (remaining > 0) {
      const product = next.products.find((p) => p.id === rl.productId);
      createOrMergeBatch(next, {
        productId: rl.productId, locationId: sale.locationId,
        batchNo: `RET-${sale.receiptNo.slice(-4)}`, expDate: null, mfgDate: null,
        qty: remaining, cost: product ? product.costPrice : 0, source: 'return',
      });
    }
    bumpMovement(next, rl.productId);
    pushActivity(next, { action: 'sale_return', refId: sale.receiptNo, productId: rl.productId, locationId: sale.locationId, qtyDelta: rl.qty, description: `Return against ${sale.receiptNo}: ${rl.qty} × ${productName(next, rl.productId)} restored to ${shop ? shop.name : sale.locationId}. ${reason || ''}`.trim() });
  }

  sale.returnedTotal = (sale.returnedTotal || 0) + refundTotal;
  sale.status = sale.lines.every((l) => sumReturned(sale, l.productId) >= l.qty) ? 'returned' : 'partially_returned';

  const returnDoc = {
    id: newId('ret'), ref: `RET-${padNum(nextCounter(next, 'ret'), 4)}`,
    saleId: sale.id, receiptNo: sale.receiptNo, lines: retLines,
    refundTotal, reason: reason || '', notes: notes || '',
    createdAt: nowIso(), operator: next.settings.operator || 'Demo Operator', isSeeded: false,
  };
  sale.returns.push({ id: returnDoc.id, ref: returnDoc.ref, at: nowIso(), lines: retLines, refundTotal, reason: reason || '' });
  pushActivity(next, { action: 'sale_return', refId: returnDoc.ref, productId: retLines[0].productId, locationId: sale.locationId, qtyDelta: null, description: `Return ${returnDoc.ref} processed against ${sale.receiptNo}: refund ${(refundTotal / 100).toFixed(2)}${reason ? ` — ${reason}` : ''}.` });
  pushNotification(next, 'return', 'Sale returned', `${returnDoc.ref} against ${sale.receiptNo}: refund ${(refundTotal / 100).toFixed(2)} credited, stock restored.`, { ref: returnDoc.ref });
  notifyStockTransitions(state, next, retLines.map((r) => r.productId));

  return ok(next, `Return processed — refund ${(refundTotal / 100).toFixed(2)}, stock restored at ${shop ? shop.name : 'the shop'}.`, { saleId: sale.id, refundTotal });
}

function sumReturned(sale, productId) {
  return (sale.returns || []).reduce((a, r) => a + r.lines.filter((x) => x.productId === productId).reduce((b, x) => b + x.qty, 0), 0);
}
