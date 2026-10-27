// src/services/reportingService.js
// Builds every report table + CSV payload and chart series from CURRENT state.
// Seeded demonstration records are flagged as such in the app UI.

import {
  activeProducts, batchesOf, onHand, totalOnHand, available, reserved, inTransit,
  stockStatus, expiryStatus, getStockAlerts, getExpiryAlerts, getDeadStock,
  getReplenishmentList, calculateInventoryValue, sellableQty,
} from './inventoryEngine';
import { dayKey, eachDayKey, formatDate, formatDateTime } from '../utils/dates';
import { formatMoney } from '../utils/currency';

const sumReturnedQty = (sale, productId) => (sale.returns || []).reduce((a, r) => a + r.lines.filter((rl) => rl.productId === productId).reduce((b, rl) => b + rl.qty, 0), 0);
const saleNet = (s) => Math.max(0, s.total - (s.returnedTotal || 0));
const inRange = (iso, range) => {
  if (!range) return true;
  const k = dayKey(iso);
  if (range.from && k < range.from) return false;
  if (range.to && k > range.to) return false;
  return true;
};

function moneyFmt(state) {
  return (minor) => formatMoney(minor, state.settings.currency);
}
function dateFmt(state) {
  return (iso) => formatDate(iso, state.settings.dateFormat);
}

/* ---------------- Chart series (dashboard) ---------------- */

export function getSalesSeries(state, range) {
  const keys = eachDayKey(range.from, range.to);
  const map = Object.fromEntries(keys.map((k) => [k, { key: k, sales: 0, orders: 0 }]));
  for (const s of state.sales) {
    const k = dayKey(s.createdAt);
    if (k in map) {
      map[k].sales += Math.round(saleNet(s) / 100);
      map[k].orders += 1;
    }
  }
  return keys.map((k) => ({ day: k, label: k.slice(5), sales: map[k].sales, orders: map[k].orders }));
}

export function getMovementSeries(state, range) {
  const keys = eachDayKey(range.from, range.to);
  const map = Object.fromEntries(keys.map((k) => [k, { key: k, received: 0, issued: 0, sold: 0, transferred: 0 }]));
  for (const r of state.receipts) {
    const k = dayKey(r.createdAt);
    if (k in map) for (const l of r.lines) map[k].received += l.qty;
  }
  for (const iss of state.issues) {
    const k = dayKey(iss.createdAt);
    if (k in map) for (const l of iss.lines) map[k].issued += l.qty;
  }
  for (const t of state.transfers) {
    const k = dayKey(t.dispatchedAt || t.createdAt);
    if (k in map && (t.status === 'in_transit' || t.status === 'received' || t.status === 'cancelled')) {
      for (const l of t.lines) map[k].transferred += l.qty;
    }
  }
  for (const s of state.sales) {
    const k = dayKey(s.createdAt);
    if (k in map) for (const l of s.lines) map[k].sold += Math.max(0, l.qty - sumReturnedQty(s, l.productId));
  }
  return keys.map((k) => ({ day: k, label: k.slice(5), ...map[k] }));
}

export function getCategoryDistribution(state) {
  return state.categories
    .map((c) => {
      const products = activeProducts(state).filter((p) => p.categoryId === c.id);
      const units = products.reduce((a, p) => a + totalOnHand(state, p.id), 0);
      const value = products.reduce((a, p) => a + totalOnHand(state, p.id) * p.costPrice, 0);
      return { id: c.id, name: c.name, color: c.color, units, value: Math.round(value / 100), products: products.length };
    })
    .filter((c) => c.units > 0)
    .sort((a, b) => b.value - a.value);
}

export function getTopProducts(state, range, limit = 7) {
  const rows = new Map();
  for (const s of state.sales) {
    if (!inRange(s.createdAt, range)) continue;
    for (const l of s.lines) {
      const netQty = Math.max(0, l.qty - sumReturnedQty(s, l.productId));
      const cur = rows.get(l.productId) || { productId: l.productId, qty: 0, revenue: 0 };
      cur.qty += netQty;
      cur.revenue += Math.round(l.unitPrice * netQty);
      rows.set(l.productId, cur);
    }
  }
  return [...rows.values()]
    .map((r) => {
      const p = state.products.find((x) => x.id === r.productId);
      return { ...r, name: p ? p.name : '—', unit: p?.unit || 'pcs' };
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function getHealthBreakdown(state) {
  const counts = { in_stock: 0, low: 0, out: 0, overstocked: 0 };
  for (const p of activeProducts(state)) counts[stockStatus(state, p.id)] += 1;
  return [
    { name: 'In Stock', value: counts.in_stock, color: 'var(--ok)' },
    { name: 'Low Stock', value: counts.low, color: 'var(--warn)' },
    { name: 'Out of Stock', value: counts.out, color: 'var(--danger)' },
    { name: 'Overstocked', value: counts.overstocked, color: 'var(--blue)' },
  ].filter((r) => r.value > 0);
}

/* ---------------- Report tables ---------------- */

const REPORTS = [
  { id: 'inventory_current', label: 'Current Inventory', icon: 'Boxes' },
  { id: 'stock_movements', label: 'Stock Movement', icon: 'ArrowLeftRight' },
  { id: 'receiving', label: 'Stock Receiving', icon: 'PackagePlus' },
  { id: 'issuance', label: 'Stock Issuance', icon: 'PackageMinus' },
  { id: 'transfers', label: 'Transfer Register', icon: 'Truck' },
  { id: 'sales', label: 'Sales Report', icon: 'ShoppingCart' },
  { id: 'low_stock', label: 'Low Stock / Reorder', icon: 'AlertTriangle' },
  { id: 'expiry', label: 'Expiry Report', icon: 'CalendarClock' },
  { id: 'dead_stock', label: 'Dead Stock', icon: 'Hourglass' },
  { id: 'valuation', label: 'Inventory Valuation', icon: 'CircleDollarSign' },
  { id: 'best_sellers', label: 'Best-Selling Products', icon: 'Award' },
  { id: 'category_perf', label: 'Category Performance', icon: 'PieChart' },
];
export const REPORT_LIST = REPORTS;

export function buildReport(state, reportId, { range = null, locationId = null } = {}) {
  const fmtM = moneyFmt(state);
  const fmtD = dateFmt(state);
  const lNames = Object.fromEntries(state.locations.map((l) => [l.id, l.name]));
  const lName = (id) => lNames[id] || id || '—';
  const cName = (id) => state.categories.find((c) => c.id === id)?.name || '—';
  const sName = (id) => state.suppliers.find((s) => s.id === id)?.companyName || '—';
  const pName = (id) => state.products.find((p) => p.id === id)?.name || '—';

  switch (reportId) {
    case 'inventory_current': {
      const rows = activeProducts(state)
        .filter((p) => !locationId || true)
        .map((p) => {
          const perLoc = state.locations.map((l) => ({ loc: l.name, onHand: onHand(state, p.id, l.id) }));
          const units = totalOnHand(state, p.id);
          return {
            ...p,
            categoryName: cName(p.categoryId),
            units,
            availTotal: state.locations.reduce((a, l) => a + available(state, p.id, l.id), 0),
            transit: inTransit(state, p.id),
            perLocText: perLoc.filter((x) => x.onHand > 0).map((x) => `${x.loc}: ${x.onHand}`).join(' · ') || '—',
            status: stockStatus(state, p.id),
            expiry: expiryStatus(state, p.id),
            value: units * p.costPrice,
            retail: units * p.sellPrice,
            lastMovement: p.lastMovementAt,
          };
        });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      const columns = [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'name' },
        { label: 'Category', value: 'categoryName' }, { label: 'Unit', value: 'unit' },
        { label: 'Stock by Location', value: 'perLocText' }, { label: 'Units', value: (r) => r.units },
        { label: 'In Transit', value: (r) => r.transit },
        { label: 'Status', value: (r) => r.status.replace('_', ' ') }, { label: 'Expiry', value: (r) => r.expiry.replace(/_/g, ' ') },
        { label: `Stock Value (${state.settings.currency})`, value: (r) => (r.value / 100).toFixed(2) },
        { label: `Retail Value (${state.settings.currency})`, value: (r) => (r.retail / 100).toFixed(2) },
        { label: 'Last Movement', value: (r) => (r.lastMovement ? fmtD(r.lastMovement) : 'no record') },
      ];
      const view = rows.map((r) => ({ ...r, valueText: fmtM(r.value), retailText: fmtM(r.retail), lastMovementText: r.lastMovement ? fmtD(r.lastMovement) : 'No record yet' }));
      const totals = { rows: view.length, units: rows.reduce((a, r) => a + r.units, 0), value: rows.reduce((a, r) => a + r.value, 0), retail: rows.reduce((a, r) => a + r.retail, 0) };
      return { rows: view, columns, totals, dateRangeSensitive: false, note: 'Valuation uses weighted average cost. Retail value shown separately.' };
    }
    case 'stock_movements': {
      const acts = state.activity.filter((a) => ['stock_receipt', 'stock_issue', 'transfer_received', 'sale', 'adjustment'].includes(a.action) && a.qtyDelta !== null && inRange(a.at, range));
      const rows = acts.map((a) => ({
        ...a, dateText: fmtD(a.at),
        product: a.productId ? pName(a.productId) : '—', location: lName(a.locationId),
        actionLabel: a.action.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase()),
        delta: a.qtyDelta, qtyText: a.qtyDelta > 0 ? `+${a.qtyDelta}` : `${a.qtyDelta}`,
      }));
      const columns = [
        { label: 'Date', value: 'dateText' }, { label: 'Action', value: 'actionLabel' },
        { label: 'Reference', value: 'refId' }, { label: 'Product', value: 'product' },
        { label: 'Location', value: 'location' }, { label: 'Qty Change', value: 'qtyText' },
        { label: 'Description', value: 'description' },
      ];
      return { rows, columns, totals: { rows: rows.length, in: rows.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0), out: rows.filter((r) => r.delta < 0).reduce((a, r) => a - r.delta, 0) }, dateRangeSensitive: true, note: 'Derived from the activity ledger. Seeded demonstration history included.' };
    }
    case 'receiving': {
      const rows = state.receipts.filter((r) => inRange(r.createdAt, range)).map((r) => ({
        ...r, dateText: fmtD(r.createdAt), supplier: sName(r.supplierId), location: lName(r.locationId),
        items: r.lines.map((l) => `${l.qty} × ${pName(l.productId)}`).join('; '),
        value: r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0), valueText: fmtM(r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0)),
        sourceLabel: r.isSeeded ? 'Seeded history' : 'This session',
      })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const columns = [
        { label: 'Receipt', value: 'ref' }, { label: 'Date', value: 'dateText' },
        { label: 'Supplier', value: 'supplier' }, { label: 'Destination', value: 'location' },
        { label: 'Invoice No', value: 'invoiceNo' }, { label: 'Items', value: 'items' },
        { label: `Value (${state.settings.currency})`, value: (r) => (r.value / 100).toFixed(2) },
        { label: 'Source', value: 'sourceLabel' },
      ];
      return { rows, columns, totals: { docs: rows.length, units: rows.reduce((a, r) => a + r.lines.reduce((x, l) => x + l.qty, 0), 0) }, dateRangeSensitive: true };
    }
    case 'issuance': {
      const rows = state.issues.filter((r) => inRange(r.createdAt, range)).map((r) => ({
        ...r, dateText: fmtD(r.createdAt), location: lName(r.sourceLocationId),
        reasonLabel: ISSUE_REASONS_MAP()[r.reason] || r.reason,
        items: r.lines.map((l) => `${l.qty} × ${pName(l.productId)}`).join('; '),
        sourceLabel: r.isSeeded ? 'Seeded history' : 'This session',
      })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const columns = [
        { label: 'Issue No', value: 'ref' }, { label: 'Date', value: 'dateText' },
        { label: 'Source', value: 'location' }, { label: 'Reason', value: 'reasonLabel' },
        { label: 'Destination', value: 'destination' }, { label: 'Items', value: 'items' },
        { label: 'Reference', value: 'reference' }, { label: 'Source', value: 'sourceLabel' },
      ];
      return { rows, columns, totals: { docs: rows.length, units: rows.reduce((a, r) => a + r.lines.reduce((x, l) => x + l.qty, 0), 0) }, dateRangeSensitive: true };
    }
    case 'transfers': {
      const st = { pending: 'Pending', in_transit: 'In Transit', received: 'Received', cancelled: 'Cancelled' };
      const rows = state.transfers.filter((t) => inRange(t.createdAt, range)).map((t) => ({
        ...t, dateText: fmtD(t.createdAt), from: lName(t.sourceLocationId), to: lName(t.destinationLocationId),
        items: t.lines.map((l) => `${l.qty} × ${pName(l.productId)}`).join('; '),
        units: t.lines.reduce((a, l) => a + l.qty, 0),
        statusLabel: st[t.status], sourceLabel: t.isSeeded ? 'Seeded history' : 'This session',
      })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const columns = [
        { label: 'Transfer', value: 'ref' }, { label: 'Created', value: 'dateText' },
        { label: 'From', value: 'from' }, { label: 'To', value: 'to' },
        { label: 'Units', value: (r) => r.units }, { label: 'Status', value: 'statusLabel' },
        { label: 'Items', value: 'items' }, { label: 'Source', value: 'sourceLabel' },
      ];
      return { rows, columns, totals: { docs: rows.length, units: rows.reduce((a, r) => a + r.units, 0), unitsInTransit: state.transfers.filter((t) => t.status === 'in_transit').reduce((a, t) => a + t.lines.reduce((x, l) => x + l.qty, 0), 0) }, dateRangeSensitive: true };
    }
    case 'sales': {
      const rows = state.sales.filter((s) => inRange(s.createdAt, range)).map((s) => ({
        ...s, dateText: formatDateTime(s.createdAt, state.settings.dateFormat),
        location: lName(s.locationId), items: s.lines.map((l) => `${l.qty} × ${pName(l.productId)}`).join('; '),
        units: s.lines.reduce((a, l) => a + Math.max(0, l.qty - sumReturnedQty(s, l.productId)), 0),
        totalText: fmtM(Math.max(0, s.total - (s.returnedTotal || 0))),
        returnedText: s.returnedTotal ? fmtM(s.returnedTotal) : '',
        statusLabel: s.status === 'completed' ? 'Completed' : s.status === 'partially_returned' ? 'Partially Returned' : 'Returned',
        sourceLabel: s.isSeeded ? 'Seeded history' : 'This session',
      })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const columns = [
        { label: 'Receipt', value: 'receiptNo' }, { label: 'Date', value: 'dateText' },
        { label: 'Location', value: 'location' }, { label: 'Items', value: 'items' },
        { label: 'Units', value: (r) => r.units }, { label: 'Payment', value: 'paymentMethod' },
        { label: `Net Total (${state.settings.currency})`, value: (r) => (Math.max(0, r.total - (r.returnedTotal || 0)) / 100).toFixed(2) },
        { label: `Returned (${state.settings.currency})`, value: (r) => ((r.returnedTotal || 0) / 100).toFixed(2) },
        { label: 'Status', value: 'statusLabel' }, { label: 'Source', value: 'sourceLabel' },
      ];
      return { rows, columns, totals: { orders: rows.length, units: rows.reduce((a, r) => a + r.units, 0), gross: rows.reduce((a, r) => a + Math.max(0, r.total - (r.returnedTotal || 0)), 0) }, dateRangeSensitive: true };
    }
    case 'low_stock': {
      const alerts = getStockAlerts(state);
      const rows = [
        ...alerts.out.map((a) => ({ product: a.product, location: a.location?.name || 'ALL LOCATIONS', qty: 0, avail: 0, reorderLevel: a.product.reorderLevel, suggested: Math.max(a.product.reorderLevel * 3, 1), level: 'Out of Stock', supplier: sName(a.product.supplierId) })),
        ...alerts.low.map((a) => ({ product: a.product, location: a.location.name, qty: a.avail, avail: a.avail, reorderLevel: a.product.reorderLevel, suggested: Math.max(a.product.reorderLevel * 2 - a.avail, a.product.reorderLevel - a.avail), level: `Low (${a.avail} left)`, supplier: sName(a.product.supplierId) })),
      ];
      const view = rows.map((r) => ({ ...r, productName: r.product.name, sku: r.product.sku, unit: r.product.unit }));
      const columns = [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'productName' },
        { label: 'Location', value: 'location' }, { label: 'Available', value: (r) => r.avail },
        { label: 'Reorder Level', value: (r) => r.reorderLevel }, { label: 'Unit', value: 'unit' },
        { label: 'Alert Level', value: 'level' }, { label: 'Suggested Order', value: (r) => r.suggested },
        { label: 'Preferred Supplier', value: 'supplier' },
      ];
      return { rows: view, columns, totals: { rows: view.length }, dateRangeSensitive: false };
    }
    case 'expiry': {
      const alt = getExpiryAlerts(state);
      const rows = [...alt.expired, ...alt.expiringToday, ...alt.expiringSoon].map((r) => ({
        ...r, productName: r.product.name, sku: r.product.sku, location: r.location?.name,
        dateText: fmtD(r.batch.expDate), daysLabel: r.days < 0 ? `${-r.days}d ago` : r.days === 0 ? 'today' : `${r.days}d`,
        level: r.days < 0 ? 'Expired' : r.days === 0 ? 'Expiring Today' : 'Expiring Soon',
        qty: r.batch.qty, value: r.batch.qty * r.batch.cost,
      }));
      const columns = [
        { label: 'Product', value: 'productName' }, { label: 'SKU', value: 'sku' },
        { label: 'Location', value: 'location' }, { label: 'Batch', value: (r) => r.batch.batchNo },
        { label: 'Expiry Date', value: 'dateText' }, { label: 'Days', value: 'daysLabel' },
        { label: 'Qty', value: (r) => r.qty }, { label: 'Level', value: 'level' },
        { label: `Stock Value (${state.settings.currency})`, value: (r) => (r.value / 100).toFixed(2) },
      ];
      return { rows, columns, totals: { batches: rows.length, units: rows.reduce((a, r) => a + r.qty, 0), value: rows.reduce((a, r) => a + r.value, 0) }, dateRangeSensitive: false, note: `“Expiring soon” threshold: ${state.settings.expiryWarningDays} days (Settings). Expired stock is never sold.` };
    }
    case 'dead_stock': {
      const rows = getDeadStock(state).map((r) => ({
        ...r, productName: r.product.name, sku: r.product.sku, lastText: fmtD(r.lastMovementAt),
        valueText: fmtM(r.value), categoryName: cName(r.product.categoryId),
      }));
      const columns = [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'productName' },
        { label: 'Category', value: 'categoryName' }, { label: 'Units', value: (r) => r.units },
        { label: 'Last Movement', value: 'lastText' }, { label: 'Days Idle', value: (r) => r.ageDays },
        { label: `Blocked Value (${state.settings.currency})`, value: (r) => (r.value / 100).toFixed(2) },
      ];
      return { rows, columns, totals: { rows: rows.length, value: rows.reduce((a, r) => a + r.value, 0), units: rows.reduce((a, r) => a + r.units, 0) }, dateRangeSensitive: false, note: `Dead stock = no movement for ≥ ${state.settings.deadStockDays} days (Settings). Movement history is complete for this demo dataset.` };
    }
    case 'valuation': {
      const val = calculateInventoryValue(state);
      const rows = activeProducts(state).map((p) => {
        const units = totalOnHand(state, p.id);
        return {
          ...p, categoryName: cName(p.categoryId), units, wac: p.costPrice,
          value: units * p.costPrice, retail: units * p.sellPrice,
          wacText: fmtM(p.costPrice), valueText: fmtM(units * p.costPrice), retailText: fmtM(units * p.sellPrice),
        };
      }).filter((r) => r.units > 0).sort((a, b) => b.value - a.value);
      const columns = [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'name' },
        { label: 'Category', value: 'categoryName' }, { label: 'Units', value: (r) => r.units },
        { label: `WAC/unit (${state.settings.currency})`, value: (r) => (r.wac / 100).toFixed(2) },
        { label: `Stock Value WAC (${state.settings.currency})`, value: (r) => (r.value / 100).toFixed(2) },
        { label: `Retail Value (${state.settings.currency})`, value: (r) => (r.retail / 100).toFixed(2) },
      ];
      return { rows, columns, totals: { rows: rows.length, units: rows.reduce((a, r) => a + r.units, 0), value: rows.reduce((a, r) => a + r.value, 0) + val.transitValue, retail: rows.reduce((a, r) => a + r.retail, 0), transitValue: val.transitValue }, dateRangeSensitive: false, note: 'Weighted average cost per product, updated on every receipt/return. In-transit stock valued at source WAC.' };
    }
    case 'best_sellers': {
      const rows = getTopProducts(state, range, 30).map((r) => ({ ...r, revenueText: fmtM(r.revenue), unitsSold: r.qty }));
      const columns = [
        { label: 'Rank', value: (r, i) => i + 1 }, { label: 'Product', value: 'name' },
        { label: 'Units Sold', value: (r) => r.unitsSold }, { label: 'Unit', value: 'unit' },
        { label: `Revenue (${state.settings.currency})`, value: (r) => (r.revenue / 100).toFixed(2) },
      ];
      return { rows, columns, totals: { products: rows.length, units: rows.reduce((a, r) => a + r.qty, 0), revenue: rows.reduce((a, r) => a + r.revenue, 0) }, dateRangeSensitive: true };
    }
    case 'category_perf': {
      const map = new Map();
      for (const s of state.sales) {
        if (!inRange(s.createdAt, range)) continue;
        for (const l of s.lines) {
          const p = state.products.find((x) => x.id === l.productId);
          if (!p) continue;
          const cur = map.get(p.categoryId) || { categoryId: p.categoryId, revenue: 0, units: 0, orders: 0 };
          cur.units += Math.max(0, l.qty - sumReturnedQty(s, l.productId));
          cur.revenue += Math.round(l.unitPrice * Math.max(0, l.qty - sumReturnedQty(s, l.productId)));
          cur.orders += 1;
          map.set(p.categoryId, cur);
        }
      }
      const rows = [...map.entries()].map(([cid, r]) => {
        const c = state.categories.find((x) => x.id === cid);
        const catProducts = activeProducts(state).filter((p) => p.categoryId === cid);
        const stockUnits = catProducts.reduce((a, p) => a + totalOnHand(state, p.id), 0);
        return { id: cid, name: c ? c.name : '—', unitsSold: r.units, revenue: r.revenue, revenueText: fmtM(r.revenue), stockUnits, orders: r.orders };
      }).sort((a, b) => b.revenue - a.revenue);
      const columns = [
        { label: 'Category', value: 'name' }, { label: 'Orders', value: (r) => r.orders },
        { label: 'Units Sold', value: (r) => r.unitsSold },
        { label: `Revenue (${state.settings.currency})`, value: (r) => (r.revenue / 100).toFixed(2) },
        { label: 'Units In Stock', value: (r) => r.stockUnits },
      ];
      return { rows, columns, totals: { cats: rows.length, units: rows.reduce((a, r) => a + r.unitsSold, 0), revenue: rows.reduce((a, r) => a + r.revenue, 0) }, dateRangeSensitive: true };
    }
    default:
      return { rows: [], columns: [], totals: {}, dateRangeSensitive: false };
  }
}

function ISSUE_REASONS_MAP() {
  return {
    shop_replenishment: 'Shop replenishment',
    branch_transfer: 'Branch transfer',
    internal_use: 'Internal use',
    damaged_stock: 'Damaged stock write-off',
    expired_stock: 'Expired stock write-off',
    other: 'Other approved adjustment',
  };
}
