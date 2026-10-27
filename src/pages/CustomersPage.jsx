// src/pages/CustomersPage.jsx
// Customer directory with purchase behaviour derived from sales history.

import { useMemo, useState } from 'react';
import {
  Users, Download, Plus, Pencil, Trash2, Phone, Mail, StickyNote, ShoppingCart, History,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import {
  EmptyState, SearchInput, Badge, Modal, ConfirmDialog, Field, TextInput, TextArea, Pagination,
} from '../components/common/ui';
import { formatMoney } from '../utils/currency';
import { formatDateTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 9;
const BLANK = { name: '', phone: '', email: '', notes: '' };

const saleNet = (s) => Math.max(0, s.total - (s.returnedTotal || 0));

export default function CustomersPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [detail, setDetail] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.customers
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.includes(needle) || (c.email || '').toLowerCase().includes(needle))
      .map((c) => {
        const sales = state.sales.filter((s) => s.customerId === c.id);
        const spend = sales.reduce((a, s) => a + saleNet(s), 0);
        const returns = state.sales.reduce((a, s) => (s.customerId === c.id ? a + (s.returnedTotal || 0) : a), 0);
        return {
          ...c,
          orders: sales.length,
          spend,
          returned: returns,
          avgOrder: sales.length ? Math.round(spend / sales.length) : 0,
          lastPurchase: sales.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.createdAt || null,
        };
      })
      .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
  }, [state, q]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const openAdd = () => { setEditingId(null); setForm(BLANK); setErrors({}); setOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '' });
    setErrors({}); setOpen(true);
  };

  const save = () => {
    const res = editingId ? perform(engine.updateCustomer, editingId, form) : perform(engine.createCustomer, form);
    if (res.fieldErrors) setErrors(res.fieldErrors);
    if (res.ok) setOpen(false);
  };

  const runConfirm = () => {
    const id = confirm?.id;
    setConfirm(null);
    if (id) perform(engine.deleteCustomer, id);
  };

  const exportCsv = () => {
    downloadCSV('stockflow-customers', rows, [
      { label: 'Name', value: 'name' }, { label: 'Phone', value: (r) => r.phone || '' },
      { label: 'Email', value: (r) => r.email || '' }, { label: 'Notes', value: (r) => r.notes || '' },
      { label: 'Orders', value: (r) => r.orders },
      { label: `Lifetime spend (${cur})`, value: (r) => (r.spend / 100).toFixed(2) },
      { label: `Returned (${cur})`, value: (r) => ((r.returned || 0) / 100).toFixed(2) },
      { label: 'Average order', value: (r) => (r.avgOrder / 100).toFixed(2) },
      { label: 'Last purchase', value: (r) => (r.lastPurchase ? formatDateTime(r.lastPurchase, settings.dateFormat) : 'never') },
    ]);
  };

  const err = (k) => errors[k] ? <span className="field-error">{errors[k]}</span> : null;
  const detailPurchases = detail ? state.sales.filter((s) => s.customerId === detail.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8) : [];

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Users size={21} /> Customers</h1>
          <p className="page-sub">Walk-in and wholesale buyers from POS history — lifetime spend, order counts and notes for friendlier service.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="teal">{rows.length} customers</Badge>
            <Badge color="green">{fmt(rows.reduce((a, r) => a + r.spend, 0))} lifetime sales</Badge>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add customer</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name, phone or email…" />
        </div>
      </div>

      <div className="card section">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th><th>Contact</th><th>Notes</th>
                <th className="cell-num">Orders</th>
                <th className="cell-num">Lifetime spend</th>
                <th className="cell-num">Avg order</th>
                <th>Last purchase</th>
                <th style={{ width: 108 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="link row-title" onClick={() => setDetail(c)}>{c.name}</button>
                    {c.isSeeded ? <Badge color="gray">seeded</Badge> : null}
                  </td>
                  <td>
                    <div className="small-text"><span className="mono">{c.phone || '—'}</span></div>
                    <div className="small-text muted">{c.email || ''}</div>
                  </td>
                  <td style={{ maxWidth: 190 }}><span className="small-text">{c.notes || '—'}</span></td>
                  <td className="cell-num">{c.orders === 0 ? <span className="muted">—</span> : c.orders}</td>
                  <td className="cell-num cell-strong">{c.orders ? fmt(c.spend) : '—'}</td>
                  <td className="cell-num">{c.orders ? fmt(c.avgOrder) : '—'}</td>
                  <td className="nowrap" style={{ fontSize: 11.5 }}>{c.lastPurchase ? formatDateTime(c.lastPurchase, settings.dateFormat) : <span className="muted">no purchase yet</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View" onClick={() => setDetail(c)}><ShoppingCart size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(c)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => setConfirm({ id: c.id })}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState icon={Users} title="No customers found" sub="Customers added here can be attached at the POS checkout.">
              <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add customer</button>
            </EmptyState>
          ) : null}
        </div>
        {rows.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={rows.length} label="customers" />
        ) : null}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'Edit customer' : 'Add customer'}
        icon={Users}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={save}>{editingId ? 'Save changes' : 'Add customer'}</button>
          </>
        )}
      >
        <div className="form-grid">
          <Field label="Full name" required error={errors.name}>
            <TextInput value={form.name} invalid={!!errors.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Hamza Ali" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <TextInput value={form.phone} invalid={!!errors.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+92 3xx xxxxxxx" />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput value={form.email} invalid={!!errors.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="optional@example.com" />
          </Field>
          <Field label="Notes" className="span-2">
            <TextArea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Preferences, standing discount, delivery address…" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.name : ''}
        icon={Users}
        size="lg"
        footer={<><span className="spacer" /><button className="btn btn-primary" onClick={() => setDetail(null)}>Done</button></>}
      >
        {detail ? (
          <>
            <div className="detail-grid">
              <div><div className="detail-label">Phone</div><div className="detail-value mono">{detail.phone || '—'}</div></div>
              <div><div className="detail-label">Email</div><div className="detail-value">{detail.email || '—'}</div></div>
              <div><div className="detail-label">Orders</div><div className="detail-value">{rows.find((r) => r.id === detail.id)?.orders || 0}</div></div>
              <div><div className="detail-label">Lifetime spend</div><div className="detail-value" style={{ fontWeight: 800 }}>{fmt(rows.find((r) => r.id === detail.id)?.spend || 0)}</div></div>
              {detail.notes ? <div className="span-2"><div className="detail-label">Notes</div><div className="detail-value"><StickyNote size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--warn-strong)' }} />{detail.notes}</div></div> : null}
            </div>
            <hr className="divider" />
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Recent purchases (this receipt history)</div>
            {detailPurchases.length === 0 ? (
              <p className="small-text">No purchases recorded for this customer yet — attach them at POS checkout from the customer dropdown.</p>
            ) : (
              <div className="mini-list" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                {detailPurchases.map((s) => (
                  <div className="mini-row" key={s.id}>
                    <span className="mr-ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok-strong)' }}><History size={13} /></span>
                    <span className="mr-text">
                      <span className="mr-title mono">{s.receiptNo} · {s.lines.reduce((a, l) => a + l.qty, 0)} units</span>
                      <span className="mr-sub">{s.lines.map((l) => state.products.find((p) => p.id === l.productId)?.name || '—').join(', ').slice(0, 90)}</span>
                    </span>
                    <span className="mr-when" style={{ fontWeight: 750, color: 'var(--ok-strong)' }}>{fmt(saleNet(s))}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title="Delete customer?"
        message="Customers referenced by any sales receipt cannot be removed, protecting history integrity. Others are deleted safely."
        confirmLabel="Delete customer"
        danger
      />
    </>
  );
}
