// src/pages/IssuancePage.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  PackageMinus, History, Download, Trash2, CircleCheck, ShieldAlert, Truck,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EmptyState, Field, TextInput, Select, TextArea, Badge, ConfirmDialog, SearchInput, Modal,
} from '../components/common/ui';
import * as engine from '../services/inventoryEngine';
import { buildReport } from '../services/reportingService';
import { ISSUE_REASONS } from '../utils/constants';
import { available } from '../services/inventoryEngine';
import { formatDateTime, relativeTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

export default function IssuancePage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);
  const activeProducts = state.products.filter((p) => p.status === 'active');
  const shopLocations = state.locations.filter((l) => l.type === 'shop');

  const [sourceLocationId, setSourceLocationId] = useState(state.locations.find((l) => l.type === 'warehouse')?.id || '');
  const [reason, setReason] = useState('shop_replenishment');
  const [destinationLocationId, setDestinationLocationId] = useState(shopLocations[0]?.id || '');
  const [destination, setDestination] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', qty: '' }]);
  const [error, setError] = useState(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    try { if (sessionStorage.getItem('sf_open_issue')) sessionStorage.removeItem('sf_open_issue'); } catch { /* noop */ }
  }, []);

  const reasonDef = ISSUE_REASONS.find((r) => r.id === reason);
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (i === j ? { ...l, ...patch } : l)));

  const extended = lines.map((l) => {
    const product = state.products.find((x) => x.id === l.productId);
    const qtyNum = Number(l.qty);
    const avail = product && sourceLocationId ? available(state, product.id, sourceLocationId) : 0;
    // keep the raw editable string (l.qty) for the input; numeric on qtyNum
    return { ...l, product, qtyNum, avail, ok: !!product && Number.isInteger(qtyNum) && qtyNum > 0 && qtyNum <= avail };
  });

  const canPost = extended.length > 0 && extended.every((l) => l.ok);

  const post = () => {
    setConfirmPost(false);
    setPosting(true);
    const payload = {
      sourceLocationId, reason,
      destinationLocationId: reasonDef?.needsShopDest ? destinationLocationId : null,
      destination: reasonDef?.needsShopDest ? undefined : destination,
      reference, notes,
      lines: extended.filter((l) => l.ok).map((l) => ({ productId: l.productId, qty: l.qtyNum })),
    };
    const res = perform(engine.issueStock, payload);
    setPosting(false);
    if (res.ok) {
      setReference(''); setNotes('');
      setLines([{ productId: '', qty: '' }]);
      setError(null);
    } else {
      setError(res.error);
    }
  };

  const history = useMemo(() => [...state.issues].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [state.issues]);
  const [hq, setHq] = useState('');
  const filtered = useMemo(() => {
    const n = hq.trim().toLowerCase();
    if (!n) return history;
    return history.filter((r) => r.ref.toLowerCase().includes(n) || (r.destination || '').toLowerCase().includes(n) || (r.notes || '').toLowerCase().includes(n));
  }, [history, hq]);

  const exportCsv = () => {
    const rep = buildReport(state, 'issuance');
    downloadCSV('stockflow-issues-log', rep.rows, rep.columns);
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><PackageMinus size={21} /> Stock Issuance</h1>
          <p className="page-sub">Take stock out of a location for replenishment, internal use, write-offs or branch transfers. Availability is validated and reserved stock is excluded.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export log</button>
        </div>
      </div>

      <div className="grid-2-1 section" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>New issuance</h3><Badge color="amber">confirm before commit</Badge></div>
          <div className="card-pad">
            <div className="form-grid">
              <Field label="Source location" required>
                <Select value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}>
                  {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Reason" required>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {ISSUE_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </Field>
              {reasonDef?.needsShopDest ? (
                <Field label="Destination shop" required>
                  <Select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}>
                    {shopLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field label={reasonDef?.needsDest === 'text' ? 'Destination / description' : 'Destination'} required={reasonDef?.needsDest}>
                  <TextInput value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={reasonDef?.id === 'damaged_stock' || reasonDef?.id === 'expired_stock' ? 'e.g. Disposal at back yard' : 'Where is the stock going?'} />
                </Field>
              )}
              <Field label="Reference no.">
                <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. GOT-2026-06" />
              </Field>
            </div>

            <hr className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <strong style={{ fontSize: 13.2 }}>Items being issued</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, { productId: '', qty: '' }])}>+ Add line</button>
            </div>

            {extended.map((l, i) => (
              <div key={i} className="line-row" data-first={i === 0} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.4fr) 120px auto 32px', gap: 8, alignItems: 'start', padding: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 11, marginBottom: 9 }}>
                <Field label={'Product'}>
                  <Select value={l.productId} onChange={(e) => { setLine(i, { productId: e.target.value, qty: '' }); }}>
                    <option value="">Select product…</option>
                    {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </Select>
                  {l.product ? (
                    <span className="field-hint">Available at source: <strong style={{ color: 'var(--ok-strong)' }}>{l.avail}</strong> {l.product.unit}</span>
                  ) : null}
                </Field>
                <Field label={'Quantity'}>
                  <TextInput type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder="0" />
                  {l.qty !== '' && l.product && (!Number.isInteger(l.qtyNum) || l.qtyNum < 1) ? <span className="field-error">Whole number ≥ 1</span> : null}
                  {l.qty !== '' && l.product && l.qtyNum > l.avail ? <span className="field-error">Exceeds availability ({l.avail})</span> : null}
                </Field>
                <div style={{ paddingTop: 22 }}>
                  <Badge color={l.ok ? 'green' : 'gray'}>{l.ok ? 'OK' : '—'}</Badge>
                </div>
                <div style={{ paddingTop: 22 }}>
                  <button className="btn btn-ghost btn-sm btn-icon" title="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} disabled={lines.length === 1}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <Field label="Notes" className="span-2">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Approval names, delivery conditions…" />
            </Field>

            {error ? (
              <div className="storage-banner" style={{ background: 'var(--danger-soft)', borderColor: 'rgba(220,38,38,0.3)', color: 'var(--danger-strong)' }}>
                <ShieldAlert size={15} /> {error}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn btn-primary btn-lg" disabled={!canPost} onClick={() => setConfirmPost(true)}>
                <CircleCheck size={16} /> Confirm issuance
              </button>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <Truck size={17} style={{ color: 'var(--primary)' }} />
            <strong style={{ fontSize: 13.5 }}>How issuance works</strong>
          </div>
          <ul className="small-text" style={{ paddingLeft: 18, display: 'grid', gap: 6, margin: '8px 0 0' }}>
            <li>“Shop replenishment” moves stock into the selected shop — it is <strong>not</strong> treated as a sale and never affects sales reports.</li>
            <li>For transfers needing a pending → in-transit → received workflow, use the <strong>Stock Transfers</strong> module instead.</li>
            <li>Damaged / expired write-offs consume the oldest (FEFO) batches first for the correct shelf-life accounting.</li>
            <li>Reserved stock (pending transfers) can never be issued twice.</li>
          </ul>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <h3><History size={15} /> Issuance history</h3>
          <div className="card-head-right" style={{ minWidth: 240 }}>
            <SearchInput value={hq} onChange={setHq} placeholder="Search issues…" />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Issue</th><th>Date</th><th>Source</th><th>Reason</th><th>Destination</th><th>Items</th><th>Source</th></tr>
            </thead>
            <tbody>
              {filtered.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong mono">{r.ref}</td>
                  <td className="nowrap">{formatDateTime(r.createdAt, settings.dateFormat)}</td>
                  <td>{state.locations.find((l) => l.id === r.sourceLocationId)?.name}</td>
                  <td>{ISSUE_REASONS.find((x) => x.id === r.reason)?.label || r.reason}</td>
                  <td>{r.destination || '—'}</td>
                  <td>{r.lines.map((l) => `${l.qty} × ${state.products.find((p) => p.id === l.productId)?.name || '—'}`).join(', ')}</td>
                  <td><Badge color={r.isSeeded ? 'gray' : 'green'}>{r.isSeeded ? 'seeded history' : 'this session'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <EmptyState title="No issuance records" sub="Confirmed issuances will appear here." /> : null}
        </div>
      </div>

      <Modal
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        title="Confirm stock issuance"
        icon={PackageMinus}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmPost(false)}>Back</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={post} disabled={posting}>Confirm issuance</button>
          </>
        )}
      >
        <p className="small-text">
          Removing <strong>{extended.reduce((a, l) => a + (l.ok ? l.qtyNum : 0), 0)} units</strong> from{' '}
          <strong>{state.locations.find((l) => l.id === sourceLocationId)?.name}</strong> — reason:{' '}
          <strong>{reasonDef?.label}</strong>
          {reasonDef?.needsShopDest ? <>→ <strong>{state.locations.find((l) => l.id === destinationLocationId)?.name}</strong></> : destination ? <> → <strong>{destination}</strong></> : null}.
        </p>
        {reasonDef?.id === 'shop_replenishment' ? (
          <p className="small-text" style={{ marginTop: 8 }}>Shop replenishment is an internal stock movement, not a sale — sales statistics stay untouched.</p>
        ) : null}
        <div style={{ marginTop: 10 }}>
          {extended.filter((l) => l.ok).map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 12.5 }}>
              <span>{l.qtyNum} × {l.product.name}</span>
              <span className="muted">avail {l.avail} → {l.avail - l.qtyNum}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
