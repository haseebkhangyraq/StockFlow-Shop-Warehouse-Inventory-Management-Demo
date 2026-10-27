// src/pages/SalesHistoryPage.jsx
import { useMemo, useState } from 'react';
import {
  History, Download, Search, ShoppingBag, RotateCcw, Printer, Eye, Undo2, CircleAlert,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EmptyState, Badge, SearchInput, Select, Modal, Field, TextInput, ConfirmDialog,
} from '../components/common/ui';
import { formatDateTime, relativeTime } from '../utils/dates';
import { formatMoney } from '../utils/currency';
import { downloadCSV } from '../utils/csv';
import { buildReport } from '../services/reportingService';
import { ReceiptHTML, printReceipt } from '../components/pos/Receipt';
import * as engine from '../services/inventoryEngine';

const PAGE_SIZE = 10;

const enhanceSale = (s, products) => ({ ...s, _date: s.createdAt, _products: Object.fromEntries(products.map((p) => [p.id, p])) });

function statusMeta(s) {
  if (s.status === 'returned') return { label: 'Returned', color: 'red' };
  if (s.status === 'partially_returned') return { label: 'Partly Returned', color: 'amber' };
  return { label: 'Completed', color: 'green' };
}

export default function SalesHistoryPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [locationF, setLocationF] = useState('all');
  const [methodF, setMethodF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [returnModal, setReturnModal] = useState(null); // sale doc
  const [returnQty, setReturnQty] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnErr, setReturnErr] = useState(null);
  const [receiptOnly, setReceiptOnly] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.sales
      .filter((s) => locationF === 'all' || s.locationId === locationF)
      .filter((s) => methodF === 'all' || s.paymentMethod === methodF)
      .filter((s) => statusF === 'all' || s.status === statusF)
      .filter((s) => {
        if (!needle) return true;
        const cust = state.customers.find((c) => c.id === s.customerId)?.name?.toLowerCase() || '';
        const items = s.lines.map((l) => state.products.find((p) => p.id === l.productId)?.name || '').join(' ').toLowerCase();
        return s.ref.toLowerCase().includes(needle) || items.includes(needle) || cust.includes(needle);
      })
      .map((s) => ({
        ...s,
        locationName: state.locations.find((l) => l.id === s.locationId)?.name || '—',
        custName: state.customers.find((c) => c.id === s.customerId)?.name || 'Walk-in',
        status: statusMeta(s),
        returnedQty: s.lines.reduce((a, l) => a + (s.returns || []).reduce((b, r) => b + r.lines.filter((x) => x.productId === l.productId).reduce((y, x) => y + x.qty, 0), 0), 0),
      }));
  }, [state.sales, state.customers, state.products, q, locationF, methodF, statusF]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const exportCsv = () => {
    const rep = buildReport(state, 'sales');
    downloadCSV('stockflow-sales-report', rep.rows, rep.columns);
  };

  const openReturn = (sale) => {
    // start with sold minus already-returned for each line
    const initial = {};
    for (const l of sale.lines) {
      const done = (sale.returns || []).reduce((a, r) => a + r.lines.filter((x) => x.productId === l.productId).reduce((b, x) => b + x.qty, 0), 0);
      initial[l.productId] = Math.max(0, l.qty - done);
    }
    setReturnQty(initial);
    setReturnReason('');
    setReturnNotes('');
    setReturnErr(null);
    setReturnModal(sale);
  };

  const submitReturn = () => {
    const sale = returnModal;
    const lines = Object.entries(returnQty)
      .map(([productId, qty]) => ({ productId, qty: Number(qty) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      setReturnErr('Enter at least one return quantity.');
      return;
    }
    const res = perform(engine.processReturn, { saleId: sale.id, lines, reason: returnReason, notes: returnNotes });
    if (res.ok) setReturnModal(null);
    else setReturnErr(res.error);
  };

  const totals = rows.reduce(
    (a, s) => ({
      net: a.net + Math.max(0, s.total - (s.returnedTotal || 0)),
      returned: a.returned + (s.returnedTotal || 0),
      units: a.units + s.lines.reduce((x, l) => x + l.qty, 0),
    }),
    { net: 0, returned: 0, units: 0 },
  );

  const detailSale = detail ? state.sales.find((s) => s.id === detail.id) || detail : null;
  const returnSale = returnModal ? state.sales.find((s) => s.id === returnModal.id) || returnModal : null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><History size={21} /> Sales History</h1>
          <p className="page-sub">Every completed POS sale with receipts, payments and a safe return workflow. Returns restore eligible batches and reverse the amounts.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="green">{rows.length} receipts</Badge>
            <Badge color="blue">{fmt(totals.net)} net</Badge>
            {totals.returned > 0 ? <Badge color="amber">{fmt(totals.returned)} returned</Badge> : null}
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search receipt no, product, customer…" />
          <select value={locationF} onChange={(e) => setLocationF(e.target.value)}>
            <option value="all">All shops</option>
            {state.locations.filter((l) => l.type === 'shop').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={methodF} onChange={(e) => setMethodF(e.target.value)}>
            <option value="all">All payments</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="partially_returned">Partly returned</option>
            <option value="returned">Returned</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Receipt</th><th>Date & time</th><th>Shop</th><th>Items sold</th><th className="cell-num">Units</th><th className="cell-num">Net total</th><th>Payment</th><th>Status</th><th style={{ width: 128 }}>Actions</th></tr>
            </thead>
            <tbody>
              {view.map((s) => (
                <tr key={s.id}>
                  <td className="cell-strong mono">{s.ref}</td>
                  <td className="nowrap">{formatDateTime(s.createdAt, settings.dateFormat)}</td>
                  <td>{s.locationName}</td>
                  <td>
                    {s.lines.map((l) => (
                      <div key={l.productId} style={{ fontSize: 12.2 }}>
                        {l.qty} × {(state.products.find((p) => p.id === l.productId)?.name || '—').slice(0, 34)}
                      </div>
                    ))}
                  </td>
                  <td className="cell-num">{s.lines.reduce((a, l) => a + l.qty, 0) - s.returnedQty || 0}</td>
                  <td className="cell-num cell-strong">{fmt(Math.max(0, s.total - (s.returnedTotal || 0)))}</td>
                  <td><Badge color={s.paymentMethod === 'cash' ? 'green' : s.paymentMethod === 'card' ? 'blue' : 'gray'}>{s.paymentMethod.toUpperCase()}</Badge></td>
                  <td><Badge color={s.status.color}>{s.status.label}</Badge>{(s.returns || []).length ? <div style={{ marginTop: 3 }}><Badge color="gray">{s.returns.length} return doc</Badge></div> : null}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View receipt" onClick={() => setDetail(s)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Print" onClick={() => { setDetail(s); setReceiptOnly(true); }}><Printer size={14} /></button>
                      {s.status.label !== 'Returned' ? (
                        <button className="btn btn-ghost btn-sm btn-icon" title="Return items" onClick={() => openReturn(s)}><Undo2 size={14} /></button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No sales found" sub="Complete a sale in the Point of Sale, or adjust the filters above." />
          ) : null}
        </div>
        {rows.length > PAGE_SIZE ? (
          <div className="pagination">
            <span className="page-info">{rows.length} receipts · {fmt(totals.net)} net</span>
            <button className="page-btn" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const n = Math.max(1, Math.min(pageSafe - 2, pages - 4)) + i;
              if (n > pages) return null;
              return <button key={n} className={`page-btn${n === pageSafe ? ' active' : ''}`} onClick={() => setPage(n)}>{n}</button>;
            })}
            <button className="page-btn" disabled={pageSafe >= pages} onClick={() => setPage(pageSafe + 1)}>›</button>
          </div>
        ) : null}
      </div>

      {/* receipt detail */}
      <Modal
        open={!!detailSale}
        onClose={() => { setDetail(null); setReceiptOnly(false); }}
        title={receiptOnly ? 'Receipt preview' : detailSale ? `Receipt ${detailSale.ref}` : ''}
        icon={Printer}
        size="lg"
        footer={(
          <>
            {detailSale?.status !== 'returned' && !receiptOnly ? (
              <button className="btn btn-danger-soft" onClick={() => { setReceiptOnly(false); openReturn(detailSale); }}><Undo2 size={14} /> Return items</button>
            ) : null}
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => { printReceipt(); }}><Printer size={15} /> Print</button>
          </>
        )}
      >
        {detailSale ? (
          <>
            {!receiptOnly ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Badge color={detailSale.status.color}>{detailSale.status.label}</Badge>
                  <Badge color={detailSale.paymentMethod === 'cash' ? 'green' : 'blue'}>{detailSale.paymentMethod.toUpperCase()}</Badge>
                  <Badge color="gray">{state.locations.find((l) => l.id === detailSale.locationId)?.name}</Badge>
                  <Badge color="violet">{detailSale.operator || 'Demo Operator'}</Badge>
                  {detailSale.isSeeded ? <Badge color="gray">seeded history</Badge> : <Badge color="green">this session</Badge>}
                </div>
                <table className="data" style={{ minWidth: 420 }}>
                  <thead><tr><th>Item</th><th className="cell-num">Qty</th><th className="cell-num">Unit</th><th className="cell-num">Line total</th></tr></thead>
                  <tbody>
                    {detailSale.lines.map((l) => (
                      <tr key={l.productId}>
                        <td className="cell-strong">{state.products.find((p) => p.id === l.productId)?.name || '—'}</td>
                        <td className="cell-num">{l.qty}</td>
                        <td className="cell-num">{fmt(l.unitPrice)}</td>
                        <td className="cell-num">{fmt(l.qty * l.unitPrice)}</td>
                      </tr>
                    ))}
                    <tr><td className="cell-strong">Subtotal</td><td /><td /><td className="cell-num">{fmt(detailSale.subtotal)}</td></tr>
                    {detailSale.discount > 0 ? <tr><td>Discount</td><td /><td /><td className="cell-num">−{fmt(detailSale.discount)}</td></tr> : null}
                    {detailSale.tax > 0 ? <tr><td>Tax</td><td /><td /><td className="cell-num">{fmt(detailSale.tax)}</td></tr> : null}
                    <tr style={{ fontWeight: 800 }}><td className="cell-strong">Total</td><td /><td /><td className="cell-num">{fmt(detailSale.total)}</td></tr>
                    {detailSale.returnedTotal ? (
                      <tr><td style={{ color: 'var(--danger-strong)', fontWeight: 600 }}>Returned/refunded</td><td /><td /><td className="cell-num" style={{ color: 'var(--danger-strong)' }}>−{fmt(detailSale.returnedTotal)}</td></tr>
                    ) : null}
                  </tbody>
                </table>
                {(detailSale.returns || []).length ? (
                  <div style={{ marginTop: 12 }}>
                    <strong style={{ fontSize: 12.8 }}>Return documents</strong>
                    {(detailSale.returns || []).map((r) => (
                      <div className="batch-row" key={r.id}>
                        <span className="b-no">{r.ref}</span>
                        <span>{r.lines.map((l) => `${l.qty} × ${(state.products.find((p) => p.id === l.productId)?.name || '').slice(0, 24)}`).join(', ')}</span>
                        <span className="muted">{fmt(r.refundTotal)}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{relativeTime(r.at)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <hr className="divider" />
              </>
            ) : null}
            <div className="receipt-modal-body">
              <ReceiptHTML
                sale={enhanceSale(detailSale, state.products)}
                settings={settings}
                locations={state.locations}
                customers={state.customers}
              />
            </div>
          </>
        ) : null}
      </Modal>

      {/* return workflow */}
      {returnSale ? (
        <Modal
          open
          onClose={() => setReturnModal(null)}
          title={`Return against ${returnSale.ref}`}
          icon={RotateCcw}
          footer={(
            <>
              <button className="btn btn-secondary" onClick={() => setReturnModal(null)}>Cancel</button>
              <span className="spacer" />
              <button className="btn btn-danger" onClick={submitReturn}>Process return</button>
            </>
          )}
        >
          <p className="small-text">
            Returns restore the returned units to <strong>{state.locations.find((l) => l.id === returnSale.locationId)?.name}</strong> and credit the proportionate refund.
            The original sale is never deleted — a reversal record is added to the ledger.
          </p>
          <div style={{ marginTop: 12 }}>
            {returnSale.lines.map((l) => {
              const sold = l.qty;
              const done = (returnSale.returns || []).reduce((a, r) => a + r.lines.filter((x) => x.productId === l.productId).reduce((b, x) => b + x.qty, 0), 0);
              const maxReturn = sold - done;
              return (
                <div key={l.productId} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 12.8 }}>{state.products.find((p) => p.id === l.productId)?.name}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>sold {sold} · already returned {done} · refundable {maxReturn}</div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={maxReturn}
                    step="1"
                    disabled={maxReturn <= 0}
                    className="input"
                    style={{ width: 84 }}
                    value={returnQty[l.productId] ?? 0}
                    onChange={(e) => setReturnQty((rq) => ({ ...rq, [l.productId]: Math.min(Math.max(0, Number(e.target.value) || 0), maxReturn) }))}
                    aria-label={`Return quantity for ${l.productId}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label="Return reason">
              <Select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                <option value="">— select reason —</option>
                <option>Damaged in transit</option>
                <option>Wrong item delivered</option>
                <option>Customer changed mind</option>
                <option>Quality complaint</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label="Notes">
              <TextInput value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Optional short note" />
            </Field>
          </div>
          {returnErr ? (
            <div className="storage-banner" style={{ background: 'var(--danger-soft)', borderColor: 'rgba(220,38,38,0.3)', color: 'var(--danger-strong)', marginTop: 10 }}>
              <CircleAlert size={15} /> {returnErr}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
