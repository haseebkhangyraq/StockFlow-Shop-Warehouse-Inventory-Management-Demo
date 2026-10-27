// src/components/warehouse/ProductForm.jsx
import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, TextInput, Select, TextArea, Switch } from '../common/ui';
import { Package } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import * as engine from '../../services/inventoryEngine';
import { UNITS } from '../../utils/constants';
import { parseMoneyInput, minorToInput } from '../../utils/currency';

export function emptyProductDraft(state) {
  return {
    name: '', sku: '', barcode: '', categoryId: state.categories[0]?.id || '',
    description: '', unit: 'pcs', costPrice: '', sellPrice: '', reorderLevel: 10,
    supplierId: state.suppliers[0]?.id || '',
    trackExpiry: false, trackBatch: false, status: 'active',
  };
}

export default function ProductForm({ open, onClose, editingId, onSaved }) {
  const { state, perform } = useInventory();
  const editing = editingId ? state.products.find((p) => p.id === editingId) : null;
  const [form, setForm] = useState(() => emptyProductDraft(state));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name, sku: editing.sku, barcode: editing.barcode || '',
          categoryId: editing.categoryId, description: editing.description || '',
          unit: editing.unit,
          costPrice: minorToInput(editing.costPrice), sellPrice: minorToInput(editing.sellPrice),
          reorderLevel: editing.reorderLevel, supplierId: editing.supplierId || '',
          trackExpiry: !!editing.trackExpiry, trackBatch: !!editing.trackBatch, status: editing.status,
        });
      } else {
        setForm(emptyProductDraft(state));
      }
      setErrors({});
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const parsed = useMemo(() => ({
    costPrice: Math.round(parseMoneyInput(form.costPrice) || 0),
    sellPrice: Math.round(parseMoneyInput(form.sellPrice) || 0),
    reorderLevel: Number(form.reorderLevel) || 0,
  }), [form]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setSubmitting(true);
    const payload = {
      ...form,
      costPrice: parsed.costPrice,
      sellPrice: parsed.sellPrice,
      reorderLevel: parsed.reorderLevel,
    };
    const result = editingId
      ? perform(engine.updateProduct, editingId, payload)
      : perform(engine.createProduct, payload);
    if (result && result.ok) {
      setSubmitting(false);
      onSaved?.(result);
      onClose();
    } else {
      setSubmitting(false);
      setErrors((result && result.fieldErrors) || {});
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingId ? 'Edit product' : 'Add new product'}
      icon={Package}
      size="lg"
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {editingId ? 'Save changes' : 'Create product'}
          </button>
        </>
      )}
    >
      <div className="form-grid">
        <Field label="Product name" required error={errors.name} className="span-2">
          <TextInput
            value={form.name}
            invalid={!!errors.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Mineral Water 1.5L"
            autoFocus
          />
        </Field>
        <Field label="SKU" required error={errors.sku} hint="Unique product code">
          <TextInput value={form.sku} invalid={!!errors.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="FG-001" />
        </Field>
        <Field label="Barcode (optional)" error={errors.barcode}>
          <TextInput value={form.barcode} invalid={!!errors.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="841201…" />
        </Field>
        <Field label="Category" required error={errors.categoryId}>
          <Select value={form.categoryId} invalid={!!errors.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Unit of measurement" required>
          <Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label={`Purchase cost (${state.settings.currency})`} required error={errors.costPrice} hint="Used for inventory valuation (WAC)">
          <TextInput
            value={form.costPrice}
            invalid={!!errors.costPrice}
            inputMode="decimal"
            onChange={(e) => set('costPrice', e.target.value)}
            placeholder="42.00"
          />
        </Field>
        <Field label={`Selling price (${state.settings.currency})`} required error={errors.sellPrice} hint="POS retail price">
          <TextInput
            value={form.sellPrice}
            invalid={!!errors.sellPrice}
            inputMode="decimal"
            onChange={(e) => set('sellPrice', e.target.value)}
            placeholder="60.00"
          />
        </Field>
        <Field label="Reorder level" required error={errors.reorderLevel} hint="Low-stock alert threshold">
          <TextInput
            type="number"
            min="0"
            step="1"
            value={form.reorderLevel}
            invalid={!!errors.reorderLevel}
            onChange={(e) => set('reorderLevel', e.target.value)}
          />
        </Field>
        <Field label="Preferred supplier">
          <Select value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">— none —</option>
            {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </Select>
        </Field>
        <Field label="Description" className="span-2">
          <TextArea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short internal description (optional)" />
        </Field>
        <div className="span-2" style={{ display: 'grid', gap: 9 }}>
          <Switch
            label="Track expiry dates (perishables)"
            sub="Stock becomes batch-based; sells FEFO (first-expired, first-out). Expired batches can never be sold."
            checked={form.trackExpiry}
            onChange={(v) => set('trackExpiry', v)}
          />
          <Switch
            label="Require batch numbers on receiving"
            sub="Record batch/lot numbers for traceability on each receipt."
            checked={form.trackBatch}
            onChange={(v) => set('trackBatch', v)}
          />
        </div>
      </div>
    </Modal>
  );
}
