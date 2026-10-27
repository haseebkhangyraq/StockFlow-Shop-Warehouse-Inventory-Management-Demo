// src/utils/validation.js
// Field-level validation used by forms and the inventory engine.
// Every validator returns { ok: boolean, errors: {field: message} }.

export function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}
export function isNonNegativeInt(n) {
  return Number.isInteger(n) && n >= 0;
}

export function parseQty(text) {
  if (text === null || text === undefined || text === '') return NaN;
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

export function requireText(v, msg = 'This field is required') {
  return v !== undefined && v !== null && String(v).trim() !== '' ? null : msg;
}

export function requireId(v, msg = 'Please make a selection') {
  return v ? null : msg;
}

export function requireMin(v, min, msg) {
  return Number.isFinite(v) && v >= min ? null : (msg || `Must be at least ${min}`);
}

export function validEmail(v) {
  if (!v) return null; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : 'Enter a valid email address';
}

export function validPhone(v) {
  if (!v) return null;
  return /^[+\d()\-\s]{5,20}$/.test(String(v).trim()) ? null : 'Enter a valid phone number';
}

function firstResult(results) {
  for (const r of results) if (r) return r;
  return null;
}

/** Product master-data validation. Checks duplicates against other products. */
export function validateProduct(input, products, { currentId = null } = {}) {
  const errors = {};
  const e1 = requireText(input.name, 'Product name is required');
  if (e1) errors.name = e1;
  const skuMsg = requireText(input.sku, 'SKU is required');
  if (skuMsg) errors.sku = skuMsg;
  else {
    const dup = products.find((p) => p.id !== currentId && p.sku.trim().toLowerCase() === String(input.sku).trim().toLowerCase() && p.status === 'active');
    if (dup) errors.sku = `SKU already used by “${dup.name}”`;
  }
  if (input.barcode && input.barcode.trim()) {
    const dupB = products.find((p) => p.id !== currentId && p.barcode && p.barcode.trim().toLowerCase() === input.barcode.trim().toLowerCase() && p.status === 'active');
    if (dupB) errors.barcode = `Barcode already used by “${dupB.name}”`;
  }
  const catMsg = requireId(input.categoryId, 'Choose a category');
  if (catMsg) errors.categoryId = catMsg;
  if (!Number.isFinite(input.costPrice) || input.costPrice < 0) errors.costPrice = 'Enter a valid purchase cost (≥ 0)';
  if (!Number.isFinite(input.sellPrice) || input.sellPrice < 0) errors.sellPrice = 'Enter a valid selling price (≥ 0)';
  if (Number.isFinite(input.sellPrice) && Number.isFinite(input.costPrice) && input.sellPrice > 0 && input.sellPrice < input.costPrice) {
    errors.sellPrice = 'Selling price is lower than the purchase cost';
  }
  if (!Number.isFinite(input.reorderLevel) || input.reorderLevel < 0 || !Number.isInteger(input.reorderLevel)) {
    errors.reorderLevel = 'Reorder level must be a whole number ≥ 0';
  }
  if (!requireId(input.unitId || input.unit, 'Choose a unit of measurement')) {} // unit always set by UI
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateSupplier(input) {
  const errors = {};
  const c = requireText(input.companyName, 'Company name is required');
  if (c) errors.companyName = c;
  const em = validEmail(input.email);
  if (em) errors.email = em;
  const ph = validPhone(input.phone);
  if (ph) errors.phone = ph;
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateCategory(input, categories, { currentId = null } = {}) {
  const errors = {};
  const n = requireText(input.name, 'Category name is required');
  if (n) errors.name = n;
  else {
    const dup = categories.find((c) => c.id !== currentId && c.name.trim().toLowerCase() === String(input.name).trim().toLowerCase());
    if (dup) errors.name = 'A category with this name already exists';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateCustomer(input) {
  const errors = {};
  const n = requireText(input.name, 'Customer name is required');
  if (n) errors.name = n;
  const ph = validPhone(input.phone);
  if (ph) errors.phone = ph;
  const em = validEmail(input.email);
  if (em) errors.email = em;
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateReceivePayload(payload) {
  const errors = {};
  const sup = requireId(payload.supplierId, 'Select a supplier');
  if (sup) errors.supplierId = sup;
  const loc = requireId(payload.locationId, 'Select a destination warehouse');
  if (loc) errors.locationId = loc;
  if (!payload.lines || payload.lines.length === 0) errors.lines = 'Add at least one product line';
  if (!Number.isFinite(Date.parse(payload.date))) errors.date = 'Enter a valid receiving date';
  const lineErrors = (payload.lines || []).map((l) => {
    const le = {};
    const p = requireId(l.productId, 'Select a product');
    if (p) le.productId = p;
    if (!isPositiveInt(l.qty)) le.qty = 'Quantity must be a whole number ≥ 1';
    if (!isNonNegativeInt(l.unitCost)) le.unitCost = 'Enter a valid unit cost (≥ 0)';
    if (l.trackBatch && !String(l.batchNo || '').trim()) le.batchNo = 'Batch number is required for batch-tracked products';
    if (l.trackExpiry && !l.expDate) le.expDate = 'Expiry date is required for perishable products';
    return le;
  });
  return { ok: Object.keys(errors).length === 0 && lineErrors.every((le) => Object.keys(le).length === 0), errors: { ...errors, lineErrors } };
}

export function validateIssuePayload(payload) {
  const errors = {};
  const loc = requireId(payload.sourceLocationId, 'Select a source location');
  if (loc) errors.sourceLocationId = loc;
  const r = requireId(payload.reason, 'Select a reason');
  if (r) errors.reason = r;
  if (payload.reason === 'shop_replenishment' && !payload.destinationLocationId) {
    errors.destinationLocationId = 'Choose the shop location';
  }
  if ((payload.reason === 'branch_transfer' || payload.reason === 'other') && !String(payload.destination || '').trim()) {
    errors.destination = 'Describe the destination';
  }
  if (!payload.lines || payload.lines.length === 0) errors.lines = 'Add at least one product line';
  const lineErrors = (payload.lines || []).map((l) => {
    const le = {};
    const p = requireId(l.productId, 'Select a product');
    if (p) le.productId = p;
    if (!isPositiveInt(l.qty)) le.qty = 'Quantity must be a whole number ≥ 1';
    return le;
  });
  return { ok: Object.keys(errors).length === 0 && lineErrors.every((le) => Object.keys(le).length === 0), errors: { ...errors, lineErrors } };
}

export function validateTransferPayload(payload) {
  const errors = {};
  const src = requireId(payload.sourceLocationId, 'Select a source location');
  if (src) errors.sourceLocationId = src;
  const dst = requireId(payload.destinationLocationId, 'Select a destination location');
  if (dst) errors.destinationLocationId = dst;
  if (src === dst) errors.destinationLocationId = 'Source and destination must be different locations';
  if (!payload.lines || payload.lines.length === 0) errors.lines = 'Add at least one product line';
  const lineErrors = (payload.lines || []).map((l) => {
    const le = {};
    const p = requireId(l.productId, 'Select a product');
    if (p) le.productId = p;
    if (!isPositiveInt(l.qty)) le.qty = 'Quantity must be a whole number ≥ 1';
    return le;
  });
  return { ok: Object.keys(errors).length === 0 && lineErrors.every((le) => Object.keys(le).length === 0), errors: { ...errors, lineErrors } };
}

export function validateAdjustmentPayload(payload) {
  const errors = {};
  const p = requireId(payload.productId, 'Select a product');
  if (p) errors.productId = p;
  const l = requireId(payload.locationId, 'Select a location');
  if (l) errors.locationId = l;
  if (!isNonNegativeInt(payload.adjustedQty)) errors.adjustedQty = 'Counted quantity must be a whole number ≥ 0';
  if (isNonNegativeInt(payload.adjustedQty) && payload.available !== undefined && payload.adjustedQty > payload.available) {
    errors.adjustedQty = `Quantity on record is ${payload.available}; a higher value is not an adjustment — receive stock instead`;
  }
  const r = requireId(payload.reason, 'Select a reason');
  if (r) errors.reason = r;
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateSupplierRequired(productId, state, locationId) {
  if (!productId) return null;
  const product = state.products.find((p) => p.id === productId);
  if (!product) return 'Product not found';
  if (product.status !== 'active') return `${product.name} is archived`;
  return null;
}
