// src/components/tour/tourSteps.js
// Each step: which route to show, which element to spotlight (CSS selector),
// and copy. `body` receives live stats so the tour describes the user's data.
// `action` adds a "Try it" button that clicks a real element inside the app.

import { formatMoney } from '../../utils/currency';
import { calculateInventoryValue, getStockAlerts, getExpiryAlerts } from '../../services/inventoryEngine';

export function tourStats(state) {
  const alerts = getStockAlerts(state);
  const exp = getExpiryAlerts(state);
  return {
    products: state.products.filter((p) => p.status === 'active').length,
    value: formatMoney(calculateInventoryValue(state).costValue ?? 0, state.settings.currency),
    low: alerts.low.length,
    out: alerts.out.length,
    expired: exp.expired.length,
    soon: exp.expiringSoon.length + exp.expiringToday.length,
    pending: state.transfers.filter((t) => t.status === 'pending' || t.status === 'in_transit').length,
    sales: state.sales.length,
    suppliers: state.suppliers?.length ?? 0,
    customers: state.customers?.length ?? 0,
  };
}

const nav = (p) => `[data-tour="nav-${p}"]`;

export const STEPS = [
  { route: '/dashboard', title: 'Welcome to StockFlow 👋',
    body: (s) => `A 60-second tour of a full shop + warehouse system. Right now it is tracking ${s.products} products and ${s.sales} sales — all stored only in your browser. Use ← → keys or the buttons.` },
  { route: '/dashboard', target: '.stat-grid', title: 'Your business at a glance',
    body: (s) => `Live KPIs: inventory worth ${s.value}, ${s.low} low-stock and ${s.out} out-of-stock items. Every card is clickable and jumps to the detail page.` },
  { route: '/dashboard', target: '.dash-greet .range-filter', title: 'Change the time window',
    body: () => 'Switch between Today, 7 days, 30 days or a custom range — sales cards and charts recalculate instantly.' },
  { route: '/dashboard', target: '[data-tour="search"]', title: 'Global search',
    body: () => 'Find any product by name, SKU or barcode from anywhere, then jump straight to it.' },
  { route: '/dashboard', target: '[data-tour="theme"]', title: 'Light & dark theme',
    body: () => 'Easy on the eyes in a dim warehouse. Try it — the whole app switches live.',
    action: { label: 'Toggle theme', selector: '[data-tour="theme"]' } },
  { route: '/dashboard', target: '[data-tour="notifs"]', title: 'Alerts that find you',
    body: (s) => `Low stock, expiring batches and finished operations land here. ${s.soon} batches are expiring soon.` },
  { route: '/warehouse', target: nav('/warehouse'), nav: true, title: 'Warehouse',
    body: (s) => `The master catalog (${s.products} active products): add products, adjust stock, and track batches with expiry dates.` },
  { route: '/receiving', target: nav('/receiving'), nav: true, title: 'Receive stock',
    body: (s) => `Book in deliveries from ${s.suppliers} suppliers. Each receipt creates a batch and updates costs automatically.` },
  { route: '/transfers', target: nav('/transfers'), nav: true, title: 'Transfers between locations',
    body: (s) => `Move stock warehouse → shop with a dispatch/receive flow. ${s.pending} transfers are in progress right now.` },
  { route: '/pos', target: '.pos-catalog', title: 'Point of Sale',
    body: () => 'Tap a product to add it to the sale, or scan a barcode. Expired stock can never be sold.',
    action: { label: 'Add an item', selector: '.pos-card:not([disabled])' } },
  { route: '/pos', target: '.pos-cart', title: 'Checkout',
    body: () => 'Discounts, tax, cash tender and change, then a printable receipt. Sales instantly reduce shop stock.' },
  { route: '/inventory', target: '.stat-grid', title: 'Inventory report',
    body: () => 'On-hand vs reserved vs in-transit vs truly available — per location, exportable to CSV.' },
  { route: '/expiry', target: nav('/expiry'), nav: true, title: 'Expiry management',
    body: (s) => `${s.expired} expired and ${s.soon} expiring-soon batches are flagged here so nothing goes to waste (first-expiry-first-out).` },
  { route: '/reports', target: nav('/reports'), nav: true, title: 'Reports & analytics',
    body: () => 'Sales, stock valuation, margins and movement reports with charts — pick a report from the list.' },
  { route: '/settings', target: nav('/settings'), nav: true, title: 'Make it yours',
    body: () => 'Currency, tax rate, expiry warning days — and you can reset the demo data any time.' },
  { route: '/dashboard', target: '[data-tour="help"]', title: "That's the tour! 🎉",
    body: () => 'Everything you changed is saved locally. Tap this help button any time to replay the tour.' },
];
