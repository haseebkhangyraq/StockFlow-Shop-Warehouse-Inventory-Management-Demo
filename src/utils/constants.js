// src/utils/constants.js
// Shared domain constants (units, reasons, statuses) so logic and UI stay in sync.

export const UNITS = ['pcs', 'box', 'kg', 'g', 'litre', 'ml', 'pack', 'dozen', 'set', 'carton'];

export const ISSUE_REASONS = [
  { id: 'shop_replenishment', label: 'Shop replenishment', needsShopDest: true },
  { id: 'branch_transfer', label: 'Branch transfer', needsDest: 'branch' },
  { id: 'internal_use', label: 'Internal use', needsDest: 'text' },
  { id: 'damaged_stock', label: 'Damaged stock write-off', needsDest: 'text' },
  { id: 'expired_stock', label: 'Expired stock write-off', needsDest: 'text' },
  { id: 'other', label: 'Other approved adjustment', needsDest: 'text' },
];

export const ADJUSTMENT_REASONS = [
  { id: 'stock_count', label: 'Physical stock count correction' },
  { id: 'damaged', label: 'Damaged goods found' },
  { id: 'lost', label: 'Missing / lost goods' },
  { id: 'found', label: 'Found unrecorded stock' },
  { id: 'system_error', label: 'Data entry correction' },
  { id: 'supplier_short', label: 'Supplier shortage on delivery' },
  { id: 'other', label: 'Other' },
];

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: 'Banknote' },
  { id: 'card', label: 'Card', icon: 'CreditCard' },
  { id: 'other', label: 'Other', icon: 'Wallet' },
];

export const TRANSFER_STATUSES = ['pending', 'in_transit', 'received', 'cancelled'];

export const TRANSFER_STATUS_META = {
  pending: { label: 'Pending', color: 'amber' },
  in_transit: { label: 'In Transit', color: 'blue' },
  received: { label: 'Received', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const STOCK_STATUS_META = {
  in_stock: { label: 'In Stock', color: 'green' },
  low: { label: 'Low Stock', color: 'amber' },
  out: { label: 'Out of Stock', color: 'red' },
  overstocked: { label: 'Overstocked', color: 'blue' },
};

export const EXPIRY_STATUS_META = {
  expired: { label: 'Expired', color: 'red' },
  expiring_today: { label: 'Expiring Today', color: 'red' },
  expiring_soon: { label: 'Expiring Soon', color: 'amber' },
  healthy: { label: 'Healthy', color: 'green' },
  not_tracked: { label: 'Not Tracked', color: 'gray' },
  no_stock: { label: 'No Expiring Stock', color: 'gray' },
};

/** Overstocked when available exceeds this multiple of the reorder level. */
export const OVERSTOCK_MULTIPLIER = 4;
