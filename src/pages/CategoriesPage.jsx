// src/pages/CategoriesPage.jsx
// Category management — color-coded grouping used across warehouse, POS and
// reports. Deleting is guarded by the inventory engine.

import { useMemo, useState } from 'react';
import {
  Tags, Download, Plus, Pencil, Trash2, Boxes, Palette, Info,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import {
  EmptyState, Badge, Modal, ConfirmDialog, Field, TextInput, TextArea, useClickOutside,
} from '../components/common/ui';
import { onHand, totalOnHand, calculateInventoryValue } from '../services/inventoryEngine';
import { formatMoney } from '../utils/currency';
import { downloadCSV } from '../utils/csv';

const SWATCHES = [
  '#e07a3f', '#3f7fe0', '#e03f8f', '#b03fe0', '#3fae7a', '#3fb5e0', '#7a6ff0',
  '#5b6472', '#c23f3f', '#2ea88b', '#d9a13f', '#7c3aed',
];

function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ width: 16, height: 16, borderRadius: 5, background: value, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)', flexShrink: 0 }} />
        {value}
        <Palette size={13} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />
      </button>
      {open ? (
        <div
          className="search-results"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '100%', zIndex: 40, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}
          aria-label="Choose category color"
        >
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use color ${c}`}
              onClick={() => { onChange(c); setOpen(false); }}
              style={{
                width: 24, height: 24, borderRadius: 7, background: c, border: value === c ? '2px solid var(--text)' : '1px solid rgba(0,0,0,0.12)', cursor: 'pointer',
              }}
            />
          ))}
          <label
            className="btn btn-ghost btn-sm"
            style={{ gridColumn: 'span 6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
            title="Pick any custom color"
          >
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              aria-label="Custom color"
            />
            Custom color…
          </label>
        </div>
      ) : null}
    </div>
  );
}

export default function CategoriesPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);
  const valuation = useMemo(() => calculateInventoryValue(state), [state]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', color: SWATCHES[0] });
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);

  const rows = useMemo(() => state.categories.map((c) => {
    const products = state.products.filter((p) => p.categoryId === c.id && p.status === 'active');
    const units = products.reduce((a, p) => a + totalOnHand(state, p.id), 0);
    const value = products.reduce((a, p) => a + totalOnHand(state, p.id) * p.costPrice, 0);
    return {
      ...c,
      productCount: products.length,
      stockSkus: products.filter((p) => onHand(state, p.id) > 0).length,
      units,
      value,
      share: valuation.costValue ? (value / valuation.costValue) * 100 : 0,
    };
  }), [state, valuation.costValue]);

  const openAdd = () => { setEditingId(null); setForm({ name: '', description: '', color: SWATCHES[Math.floor(Math.random() * SWATCHES.length)] }); setErrors({}); setOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description || '', color: c.color || SWATCHES[0] });
    setErrors({}); setOpen(true);
  };

  const save = () => {
    const res = editingId ? perform(engine.updateCategory, editingId, form) : perform(engine.createCategory, form);
    if (res.fieldErrors) setErrors(res.fieldErrors);
    if (res.ok) setOpen(false);
  };

  const runConfirm = () => {
    const id = confirm?.id;
    setConfirm(null);
    if (id) perform(engine.deleteCategory, id);
  };

  const exportCsv = () => {
    downloadCSV('stockflow-categories', rows, [
      { label: 'Category', value: 'name' },
      { label: 'Description', value: (r) => r.description || '' },
      { label: 'Color', value: 'color' },
      { label: 'Products', value: (r) => r.productCount },
      { label: 'SKUs in stock', value: (r) => r.stockSkus },
      { label: 'Units', value: (r) => r.units },
      { label: `Stock value (${cur})`, value: (r) => (r.value / 100).toFixed(2) },
      { label: 'Share of inventory', value: (r) => `${r.share.toFixed(1)}%` },
    ]);
  };
  const totalUnits = rows.reduce((a, r) => a + r.units, 0);

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Tags size={21} /> Product Categories</h1>
          <p className="page-sub">Group your catalog with color-coding that flows through the warehouse, POS filters and reports.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="teal">{state.categories.length} categories</Badge>
            <Badge color="blue">{totalUnits.toLocaleString()} units</Badge>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add category</button>
        </div>
      </div>

      <div className="card section">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Category</th><th>Description</th>
                <th className="cell-num">Products</th>
                <th className="cell-num">In stock</th>
                <th className="cell-num">Units</th>
                <th className="cell-num">Stock value</th>
                <th style={{ minWidth: 150 }}>Share of inventory</th>
                <th style={{ width: 92 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const maxShare = Math.max(...rows.map((r) => r.share), 1);
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 15, height: 15, borderRadius: 5, background: c.color, flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                        <span className="cell-strong">{c.name}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 250 }}><span className="small-text">{c.description || '—'}</span></td>
                    <td className="cell-num">{c.productCount}</td>
                    <td className="cell-num">{c.stockSkus}</td>
                    <td className="cell-num">{c.units.toLocaleString()}</td>
                    <td className="cell-num cell-strong">{c.units ? fmt(c.value) : '—'}</td>
                    <td>
                      {c.share > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 7, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ width: `${(c.share / maxShare) * 100}%`, height: '100%', background: c.color, borderRadius: 99 }} />
                          </div>
                          <span className="small-text" style={{ fontWeight: 650, minWidth: 38 }}>{c.share.toFixed(1)}%</span>
                        </div>
                      ) : <span className="muted" style={{ fontSize: 11 }}>no stock</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(c)}><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => setConfirm({ id: c.id })}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <EmptyState icon={Tags} title="No categories yet" sub="Categories keep a large catalog navigable.">
              <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add category</button>
            </EmptyState>
          ) : null}
        </div>
      </div>

      <div className="storage-banner section" role="note">
        <Info size={15} />
        <span>Deleting a category is only possible once no active product uses it — the engine refuses otherwise so historical reports stay consistent.</span>
      </div>
      <div style={{ height: 4 }} />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Edit category' : 'Add category'}
        icon={Tags}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={save}>{editingId ? 'Save changes' : 'Add category'}</button>
          </>
        )}
      >
        <div className="form-grid">
          <Field label="Category name" required error={errors.name}>
            <TextInput value={form.name} invalid={!!errors.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Household Items" />
          </Field>
          <Field label="Color" hint="Used for chips, tags and charts">
            <ColorPicker value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} />
          </Field>
          <Field label="Description" className="span-2">
            <TextArea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What belongs in this category?" />
          </Field>
        </div>
        <div className="storage-banner" style={{ background: 'var(--surface-2)', borderStyle: 'dashed', height: 'auto' }}>
          <Boxes size={15} />
          <span style={{ fontSize: 11.8 }}>
            {editingId
              ? 'Renaming updates everywhere instantly — products keep their link.'
              : 'New categories appear immediately in the product form and POS filter chips.'}
          </span>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title="Delete category?"
        message="Categories assigned to active products cannot be deleted. Re-assign those products first."
        confirmLabel="Delete category"
        danger
      />
    </>
  );
}
