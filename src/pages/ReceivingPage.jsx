// src/pages/ReceivingPage.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  PackagePlus, History, Building2, Download, Trash2, CircleCheck, ScanLine, User, Phone, Mail, MapPin,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EmptyState, Field, TextInput, Select, TextArea, Badge, ConfirmDialog, SearchInput,
} from '../components/common/ui';
import * as engine from '../services/inventoryEngine';
import { buildReport } from '../services/reportingService';
import { formatMoney, parseMoneyInput, minorToInput } from '../utils/currency';
import { dayKey, toDateInputValue, formatDateTime, relativeTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

export default function ReceivingPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);
  const activeProducts = state.products.filter((p) => p.status === 'active');

  const today = dayKey(new Date());
  const [supplierId, setSupplierId] = useState(state.suppliers[0]?.id || '');
  const [locationId, setLocationId] = useState(state.locations.find((l) => l.type === 'warehouse')?.id || '');
  const [date, setDate] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', qty: '', unitCost: '', batchNo: '', expDate: '', mfgDate: '' }]);
  const [lineErrors, setLineErrors] = useState([]);
  const [confirmPost, setConfirmPost] = useState(false);

  useEffect(() => {
    try {
      const preset = sessionStorage.getItem('sf_receive_preset');
      if (preset) {
        sessionStorage.removeItem('sf_receive_preset');
        setLines([{ productId: preset, qty: '', unitCost: minorToInput(state.products.find((p) => p.id === preset)?.costPrice || 0), batchNo: '', expDate: '', mfgDate: '' }]);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (i === j ? { ...l, ...patch } : l)));

  const onProductChange = (i, productId) => {
    const p = state.products.find((x) => x.id === productId);
    setLine(i, {
      productId,
      unitCost: p ? minorToInput(p.costPrice) : '',
      batchNo: '',
      expDate: '',
      mfgDate: '',
    });
  };

  const extended = lines.map((l) => {
    const p = state.products.find((x) => x.id === l.productId);
    const qtyNum = Number(l.qty);
    const unitCostNum = parseMoneyInput(l.unitCost);
    const track = {
      expiry: !!p?.trackExpiry,
      batch: !!p?.trackBatch,
    };
    // keep the raw editable strings (l.qty / l.unitCost) for the inputs;
    // numeric conversions live on *Num keys so inputs never receive NaN
    return { ...l, product: p, qtyNum, unitCostNum, hasQty: Number.isInteger(qtyNum) && qtyNum > 0, hasCost: Number.isFinite(unitCostNum) && unitCostNum >= 0, track };
  }).map((l) => ({ ...l, lineTotal: l.hasQty && l.hasCost ? l.qtyNum * l.unitCostNum : 0 }));

  const canPost = lines.length > 0 && extended.every((l) => l.product && l.hasQty && l.hasCost) && !!supplierId && !!locationId;

  const post = () => {
    setConfirmPost(false);
    const payload = {
      supplierId, locationId, date, invoiceNo, notes,
      lines: extended
        .filter((l) => l.product && l.hasQty && l.hasCost)
        .map((l) => ({
          productId: l.productId,
          qty: l.qtyNum,
          unitCost: l.unitCostNum,
          batchNo: l.track.batch ? String(l.batchNo).trim() : '',
          expDate: l.track.expiry ? l.expDate || null : null,
          mfgDate: l.track.expiry ? l.mfgDate || null : null,
        })),
    };
    const res = perform(engine.receiveStock, payload);
    if (res.ok) {
      setInvoiceNo('');
      setNotes('');
      setLines([{ productId: '', qty: '', unitCost: '', batchNo: '', expDate: '', mfgDate: '' }]);
      setLineErrors([]);
    }
  };

  const history = useMemo(() => [...state.receipts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [state.receipts]);
  const [hq, setHq] = useState('');
  const filteredHistory = useMemo(() => {
    const n = hq.trim().toLowerCase();
    if (!n) return history;
    return history.filter((r) => r.ref.toLowerCase().includes(n) || (r.invoiceNo || '').toLowerCase().includes(n) || state.suppliers.find((s) => s.id === r.supplierId)?.companyName.toLowerCase().includes(n));
  }, [history, hq, state.suppliers]);

  const exportCsv = () => {
    const rep = buildReport(state, 'receiving');
    downloadCSV('stockflow-receiving-log', rep.rows, rep.columns);
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><PackagePlus size={21} /> Stock Receiving</h1>
          <p className="page-sub">Record goods arriving from suppliers into a warehouse location. Stock, valuation and alerts update only after you confirm the receipt.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export log</button>
        </div>
      </div>

      <div className="grid-2-1 section" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3><ScanLine size={15} /> New receiving document</h3><Badge color="blue">preview before posting</Badge></div>
          <div className="card-pad">
            <div className="form-grid">
              <Field label="Supplier" required>
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                </Select>
              </Field>
              <Field label="Destination warehouse" required>
                <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  {state.locations.filter((l) => l.type === 'warehouse').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Receiving date" required>
                <TextInput type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Invoice / reference no.">
                <TextInput value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2041" />
              </Field>
            </div>

            <hr className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <strong style={{ fontSize: 13.2 }}>Goods received</strong>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setLines((ls) => [...ls, { productId: '', qty: '', unitCost: '', batchNo: '', expDate: '', mfgDate: '' }])}
              >+ Add line</button>
            </div>

            {extended.map((l, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 2.2fr) 84px 110px auto auto 32px',
                  gap: 8,
                  alignItems: 'start',
                  padding: '10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  marginBottom: 9,
                }}
              >
                <Field label={i === 0 ? 'Product' : undefined} error={lineErrors[i]?.productId}>
                  <Select value={l.productId} onChange={(e) => onProductChange(i, e.target.value)}>
                    <option value="">Select product…</option>
                    {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </Select>
                  {l.product ? (
                    <span className="field-hint">
                      Supplier: {state.suppliers.find((s) => s.id === l.product.supplierId)?.companyName || '—'}
                      {l.track.expiry ? ' · expiry tracked' : ''}{l.track.batch ? ' · batch tracked' : ''}
                    </span>
                  ) : null}
                  {l.product && l.track.expiry && !l.expDate ? <span className="field-error">Expiry date required for this product</span> : null}
                  {l.product && l.track.batch && !l.batchNo ? <span className="field-error">Batch number required for this product</span> : null}
                </Field>
                <Field label={i === 0 ? 'Qty' : undefined}>
                  <TextInput type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="0" />
                  {l.qty !== '' && !l.hasQty ? <span className="field-error">≥ 1</span> : null}
                </Field>
                <Field label={i === 0 ? `Unit cost (${cur})` : undefined}>
                  <TextInput inputMode="decimal" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} placeholder="0.00" />
                  {l.unitCost !== '' && !l.hasCost ? <span className="field-error">≥ 0</span> : null}
                </Field>
                <Field label={i === 0 ? 'Batch no.' : undefined}>
                  {l.track.batch ? (
                    <TextInput value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} placeholder="LOT-.." style={{ minWidth: 100 }} />
                  ) : <span className="muted" style={{ fontSize: 12 }}>n/a</span>}
                </Field>
                <Field label={i === 0 ? 'Expiry' : undefined}>
                  {l.track.expiry ? (
                    <TextInput type="date" min={date} value={l.expDate} onChange={(e) => setLine(i, { expDate: e.target.value })} />
                  ) : <span className="muted" style={{ fontSize: 12 }}>n/a</span>}
                </Field>
                <div style={{ paddingTop: i === 0 ? 22 : 2 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" title="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} disabled={lines.length === 1}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <Field label="Notes" className="span-2" >
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition notes, discrepancies, delivery details…" />
            </Field>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 6 }}>
              <span>
                <span className="detail-label">Total received value</span>
                <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(extended.reduce((a, l) => a + l.lineTotal, 0))}</div>
              </span>
              <button className="btn btn-primary btn-lg" disabled={!canPost} onClick={() => setConfirmPost(true)}>
                <CircleCheck size={16} /> Confirm receipt
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="card card-pad section-bottom">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
              <Building2 size={17} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: 13.5 }}>Receiving policy</strong>
            </div>
            <ul className="small-text" style={{ paddingLeft: 18, display: 'grid', gap: 6, margin: '8px 0 0' }}>
              <li>Stock is added only after you confirm the receipt.</li>
              <li>Expiry-tracked products require an expiry date and become batch records consumed FEFO.</li>
              <li>Unit cost refreshes the product’s weighted average cost — inventory value follows automatically.</li>
              <li>Receipts cannot be edited afterwards; corrections happen via stock adjustments.</li>
            </ul>
          </div>
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <strong style={{ fontSize: 13.2 }}>Selected supplier</strong>
            {(() => {
              const s = state.suppliers.find((x) => x.id === supplierId);
              if (!s) return <p className="small-text">—</p>;
              return (
                <div className="small-text" style={{ marginTop: 7, display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>{s.companyName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><User size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /> <span>{s.contactPerson || '—'} · {s.phone || '—'}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /> <span>{s.phone || '—'}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /> <span>{s.email || '—'}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} /> <span>{s.address || '—'}</span></div>
                  {s.notes ? <div style={{ color: 'var(--muted)' }}>{s.notes}</div> : null}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3><History size={15} /> Receiving history</h3>
          <div className="card-head-right" style={{ minWidth: 240 }}>
            <SearchInput value={hq} onChange={setHq} placeholder="Search receipts…" />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Receipt</th><th>Date</th><th>Supplier</th><th>Destination</th><th>Items</th><th className="cell-num">Value</th><th>Source</th></tr>
            </thead>
            <tbody>
              {filteredHistory.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong mono">{r.ref}</td>
                  <td className="nowrap">{formatDateTime(r.createdAt, settings.dateFormat)}</td>
                  <td>{state.suppliers.find((s) => s.id === r.supplierId)?.companyName || '—'}</td>
                  <td>{state.locations.find((l) => l.id === r.locationId)?.name}</td>
                  <td>{r.lines.map((l) => `${l.qty} × ${state.products.find((p) => p.id === l.productId)?.name || '—'}`).join(', ')}</td>
                  <td className="cell-num">{fmt(r.lines.reduce((a, l) => a + l.qty * l.unitCost, 0))}</td>
                  <td><Badge color={r.isSeeded ? 'gray' : 'green'}>{r.isSeeded ? 'seeded history' : 'this session'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredHistory.length === 0 ? <EmptyState title="No receipts found" sub="Post your first receiving document above — new receipts appear here instantly." /> : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={post}
        title={`Post receipt of ${extended.reduce((a, l) => a + (l.hasQty ? l.qtyNum : 0), 0)} units?`}
        message={
          <>
            <p>This will add stock to <strong>{state.locations.find((l) => l.id === locationId)?.name}</strong> and update valuation, alerts and the activity log.</p>
            <div style={{ marginTop: 8 }}>
              {extended.filter((l) => l.product && l.hasQty && l.hasCost).map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 12.5 }}>
                  <span>{l.qtyNum} × {l.product.name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{fmt(l.lineTotal)}</span>
                </div>
              ))}
            </div>
          </>
        }
        confirmLabel="Post receipt"
      />
    </>
  );
}
