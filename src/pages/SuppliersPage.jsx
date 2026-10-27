// src/pages/SuppliersPage.jsx
// Supplier directory: add, edit and delete (guarded) suppliers, with a live
// look at each supplier's purchasing history.

import { useMemo, useState } from 'react';
import {
  Building2, Download, Plus, Pencil, Trash2, Eye, Phone, Mail, MapPin, FileText,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import {
  EmptyState, SearchInput, Badge, Modal, ConfirmDialog, Field, TextInput, TextArea,
} from '../components/common/ui';
import { formatMoney } from '../utils/currency';
import { formatDate } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const BLANK = { companyName: '', contactPerson: '', phone: '', email: '', address: '', notes: '' };

export default function SuppliersPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msgErr, setMsgErr] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.suppliers
      .filter((s) => !needle
        || s.companyName.toLowerCase().includes(needle)
        || (s.contactPerson || '').toLowerCase().includes(needle)
        || (s.phone || '').includes(needle)
        || (s.email || '').toLowerCase().includes(needle))
      .map((s) => {
        const myReceipts = state.receipts.filter((r) => r.supplierId === s.id);
        const spend = myReceipts.reduce((a, r) => a + r.lines.reduce((b, l) => b + l.qty * l.unitCost, 0), 0);
        return {
          ...s,
          productCount: state.products.filter((p) => p.supplierId === s.id).length,
          receiptCount: myReceipts.length,
          spend,
          lastReceipt: myReceipts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.createdAt || null,
        };
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [state, q]);

  const openAdd = () => { setEditingId(null); setForm(BLANK); setErrors({}); setMsgErr(null); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      companyName: s.companyName || '', contactPerson: s.contactPerson || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '', notes: s.notes || '',
    });
    setErrors({}); setMsgErr(null); setOpen(true);
  };

  const save = () => {
    setMsgErr(null);
    const res = editingId ? perform(engine.updateSupplier, editingId, form) : perform(engine.createSupplier, form);
    if (res.fieldErrors) setErrors(res.fieldErrors);
    if (res.ok) setOpen(false);
  };

  const runConfirm = () => {
    const id = confirm?.id;
    setConfirm(null);
    if (id) perform(engine.deleteSupplier, id);
  };

  const exportCsv = () => {
    downloadCSV('stockflow-suppliers', rows, [
      { label: 'Company', value: 'companyName' }, { label: 'Contact person', value: (r) => r.contactPerson || '' },
      { label: 'Phone', value: (r) => r.phone || '' }, { label: 'Email', value: (r) => r.email || '' },
      { label: 'Address', value: (r) => r.address || '' }, { label: 'Notes', value: (r) => r.notes || '' },
      { label: 'Products supplied', value: (r) => r.productCount },
      { label: 'Receipts', value: (r) => r.receiptCount },
      { label: `Purchased value (${cur})`, value: (r) => (r.spend / 100).toFixed(2) },
      { label: 'Last receipt', value: (r) => (r.lastReceipt ? formatDate(r.lastReceipt, settings.dateFormat) : 'none') },
    ]);
  };

  const err = (k) => errors[k] ? <span className="field-error">{errors[k]}</span> : null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Building2 size={21} /> Suppliers</h1>
          <p className="page-sub">Every vendor who replenishes your stock — contacts, purchase spend and how they connect to products and receiving history.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="teal">{rows.length} suppliers</Badge>
            <Badge color="blue">{fmt(rows.reduce((a, r) => a + r.spend, 0))} purchased</Badge>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add supplier</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={setQ} placeholder="Search by company, contact, phone or email…" />
        </div>
      </div>

      <div className="grid-3 section" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {rows.map((s) => (
          <div className="card card-pad" key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <span className="stat-ic blue" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Building2 size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.8 }}>{s.companyName}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{s.contactPerson || 'No contact name'}</div>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button className="btn btn-ghost btn-sm btn-icon" title="View" onClick={() => setDetail(s)}><Eye size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(s)}><Pencil size={14} /></button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => setConfirm({ id: s.id })}><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="small-text" style={{ display: 'grid', gap: 5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Phone size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />{s.phone || '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Mail size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />{s.email || '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MapPin size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />{s.address || '—'}</span>
            </div>
            {s.notes ? <div className="small-text" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 10px', fontStyle: 'italic' }}>{s.notes}</div> : null}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
              <Badge color="blue">{s.productCount} products</Badge>
              <Badge color="teal">{s.receiptCount} receipts</Badge>
              <Badge color="violet">{fmt(s.spend)} supplied</Badge>
              {s.isSeeded ? <Badge color="gray">seeded</Badge> : null}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <EmptyState icon={Building2} title="No suppliers found" sub="Add your first supplier to start receiving stock against it.">
              <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add supplier</button>
            </EmptyState>
          </div>
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Edit supplier' : 'Add supplier'}
        icon={Building2}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={save}>{editingId ? 'Save changes' : 'Add supplier'}</button>
          </>
        )}
      >
        <div className="form-grid">
          <Field label="Company name" required error={errors.companyName}>
            <TextInput value={form.companyName} invalid={!!errors.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="FreshFarm Foods Ltd." />
          </Field>
          <Field label="Contact person">
            <TextInput value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} placeholder="Imran Sheikh" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <TextInput value={form.phone} invalid={!!errors.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+92 300 1234567" />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput value={form.email} invalid={!!errors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="orders@example.com" />
          </Field>
          <Field label="Address" className="span-2">
            <TextInput value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Cold store / street / city" />
          </Field>
          <Field label="Notes" className="span-2">
            <TextArea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, delivery schedule, discount policy…" />
          </Field>
        </div>
        {msgErr ? <div className="field-error" style={{ marginTop: 10 }}>{msgErr}</div> : null}
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.companyName : ''}
        icon={Building2}
        size="lg"
        footer={<><span className="spacer" /><button className="btn btn-primary" onClick={() => setDetail(null)}>Done</button></>}
      >
        {detail ? (
          <>
            <div className="detail-grid">
              <div><div className="detail-label">Contact person</div><div className="detail-value">{detail.contactPerson || '—'}</div></div>
              <div><div className="detail-label">Phone</div><div className="detail-value mono">{detail.phone || '—'}</div></div>
              <div><div className="detail-label">Email</div><div className="detail-value">{detail.email || '—'}</div></div>
              <div><div className="detail-label">Added</div><div className="detail-value">{formatDate(detail.createdAt, settings.dateFormat)}</div></div>
              <div className="span-2"><div className="detail-label">Address</div><div className="detail-value">{detail.address || '—'}</div></div>
              {detail.notes ? <div className="span-2"><div className="detail-label">Notes</div><div className="detail-value">{detail.notes}</div></div> : null}
            </div>
            <hr className="divider" />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge color="blue"><Pencil size={11} /> {state.products.filter((p) => p.supplierId === detail.id).length} catalog products</Badge>
              <Badge color="teal"><FileText size={11} /> {rows.find((r) => r.id === detail.id)?.receiptCount || 0} receipts</Badge>
              <Badge color="violet">{fmt(rows.find((r) => r.id === detail.id)?.spend || 0)} lifetime purchasing</Badge>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Products supplied by this supplier</div>
            {state.products.filter((p) => p.supplierId === detail.id).length === 0 ? (
              <p className="small-text">No products are linked to this supplier yet. Link one from the product form.</p>
            ) : (
              <table className="data">
                <thead><tr><th>Product</th><th>SKU</th><th className="cell-num">Cost</th><th className="cell-num">Price</th></tr></thead>
                <tbody>
                  {state.products.filter((p) => p.supplierId === detail.id).map((p) => (
                    <tr key={p.id}>
                      <td className="cell-strong">{p.name}</td>
                      <td className="mono">{p.sku}</td>
                      <td className="cell-num">{fmt(p.costPrice)}</td>
                      <td className="cell-num">{fmt(p.sellPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title="Delete supplier?"
        message="Suppliers with active products or receiving history cannot be removed — this protects your records. Everyone else is safely deleted."
        confirmLabel="Delete supplier"
        danger
      />
    </>
  );
}
