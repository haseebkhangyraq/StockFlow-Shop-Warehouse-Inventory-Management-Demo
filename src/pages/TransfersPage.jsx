// src/pages/TransfersPage.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Truck, Download, Send, Trash2, PackageCheck, Ban, CircleAlert, Plus, ClipboardCheck,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EmptyState, Field, TextInput, Select, Badge, TextArea, ConfirmDialog, SearchInput, Modal,
} from '../components/common/ui';
import { TransferBadge } from '../components/common/status';
import * as engine from '../services/inventoryEngine';
import { available, onHand, inTransit } from '../services/inventoryEngine';
import { buildReport } from '../services/reportingService';
import { formatDateTime, relativeTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

export default function TransfersPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);
  const activeProducts = state.products.filter((p) => p.status === 'active');
  const warehouses = state.locations.filter((l) => l.type === 'warehouse');
  const shops = state.locations.filter((l) => l.type === 'shop');

  const [sourceLocationId, setSourceLocationId] = useState(warehouses[0]?.id || '');
  const [destinationLocationId, setDestinationLocationId] = useState(shops[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', qty: '' }]);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // {kind:'dispatch'|'receive'|'cancel', id, ref}
  const [cancelReason, setCancelReason] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    try { if (sessionStorage.getItem('sf_open_transfer')) sessionStorage.removeItem('sf_open_transfer'); } catch { /* noop */ }
  }, []);

  const transfers = useMemo(() => [...state.transfers].sort((a, b) => {
    const pending = (t) => (t.status === 'pending' ? 0 : t.status === 'in_transit' ? 1 : 2);
    return pending(a) - pending(b) || (a.createdAt < b.createdAt ? 1 : -1);
  }), [state.transfers]);

  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return transfers.filter((t) => (statusF === 'all' ? true : t.status === statusF))
      .filter((t) => !n || t.ref.toLowerCase().includes(n) || t.lines.some((l) => state.products.find((p) => p.id === l.productId)?.name.toLowerCase().includes(n)));
  }, [transfers, q, statusF, state.products]);

  const transitUnits = inTransit(state);

  const create = () => {
    const payload = {
      sourceLocationId, destinationLocationId, notes,
      lines: lines
        .map((l) => ({ productId: l.productId, qty: Number(l.qty) }))
        .filter((l) => state.products.some((p) => p.id === l.productId) && Number.isInteger(l.qty) && l.qty > 0),
    };
    const res = perform(engine.createTransfer, payload);
    if (res.ok) {
      setCreateOpen(false);
      setNotes('');
      setLines([{ productId: '', qty: '' }]);
    }
  };

  const runAction = () => {
    const a = confirmAction;
    setConfirmAction(null);
    if (!a) return;
    if (a.kind === 'dispatch') perform(engine.dispatchTransfer, a.id);
    if (a.kind === 'receive') perform(engine.receiveTransfer, a.id);
    if (a.kind === 'cancel') perform(engine.cancelTransfer, a.id, cancelReason);
    setCancelReason('');
  };

  const canCreate = lines.some((l) => state.products.some((p) => p.id === l.productId) && Number.isInteger(Number(l.qty)) && Number(l.qty) > 0);

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Truck size={21} /> Stock Transfers</h1>
          <p className="page-sub">
            Move stock between locations with a full pending → in-transit → received workflow.
            {transitUnits > 0 ? ` Currently ${transitUnits} units are in transit (counted at neither location).` : ''}
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={() => { const rep = buildReport(state, 'transfers'); downloadCSV('stockflow-transfer-register', rep.rows, rep.columns); }}>
            <Download size={15} /> Export register
          </button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> New transfer</button>
        </div>
      </div>

      <div className="stat-grid section">
        {(() => {
          const pendingT = transfers.filter((t) => t.status === 'pending').length;
          const transitT = transfers.filter((t) => t.status === 'in_transit').length;
          const receivedT = transfers.filter((t) => t.status === 'received').length;
          const cancelledT = transfers.filter((t) => t.status === 'cancelled').length;
          const cards = [
            { label: 'Pending dispatch', v: pendingT, tone: 'amber' },
            { label: 'In transit', v: transitT, tone: 'blue' },
            { label: 'Completed', v: receivedT, tone: 'green' },
            { label: 'Cancelled', v: cancelledT, tone: 'gray' },
          ];
          return cards.map((c) => (
            <div className="stat-card" key={c.label}>
              <div className="stat-top">
                <div className={`stat-ic ${c.tone}`}><Truck /></div>
                <div className="stat-label">{c.label}</div>
              </div>
              <div className="stat-value">{c.v}</div>
              <div className="stat-foot">transfers</div>
            </div>
          ));
        })()}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={setQ} placeholder="Search transfers or products…" />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In transit</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="card section">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Transfer</th><th>Created</th><th>Route</th><th>Items</th>
                <th className="cell-num">Units</th><th>Status</th><th>Age</th><th style={{ width: 210 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button className="link row-title" onClick={() => setDetail(t)}>{t.ref}</button>
                  </td>
                  <td className="nowrap">{formatDateTime(t.createdAt, settings.dateFormat)}</td>
                  <td>
                    <span className="cell-strong">{state.locations.find((l) => l.id === t.sourceLocationId)?.name}</span>
                    {' → '}
                    {state.locations.find((l) => l.id === t.destinationLocationId)?.name}
                  </td>
                  <td>
                    {t.lines.map((l) => (
                      <div key={l.productId} style={{ fontSize: 12.3 }}>{l.qty} × {state.products.find((p) => p.id === l.productId)?.name || '—'}</div>
                    ))}
                  </td>
                  <td className="cell-num cell-strong">{t.lines.reduce((a, l) => a + l.qty, 0)}</td>
                  <td><TransferBadge status={t.status} /></td>
                  <td className="nowrap" style={{ fontSize: 11 }}>{relativeTime(t.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {t.status === 'pending' ? (
                        <>
                          <button className="btn btn-ok btn-sm" onClick={() => setConfirmAction({ kind: 'dispatch', id: t.id, ref: t.ref })}><Send size={13} /> Dispatch</button>
                          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirmAction({ kind: 'cancel', id: t.id, ref: t.ref })}><Ban size={13} /> Cancel</button>
                        </>
                      ) : null}
                      {t.status === 'in_transit' ? (
                        <>
                          <button className="btn btn-ok btn-sm" onClick={() => setConfirmAction({ kind: 'receive', id: t.id, ref: t.ref })}><PackageCheck size={13} /> Receive</button>
                          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirmAction({ kind: 'cancel', id: t.id, ref: t.ref })}><Ban size={13} /> Cancel</button>
                        </>
                      ) : null}
                      {t.status === 'received' || t.status === 'cancelled' ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setDetail(t)}>View</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <EmptyState icon={Truck} title="No transfers found" sub="Create a transfer to move stock between the warehouse and shops with reserved-then-dispatched accounting.">
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> New transfer</button>
            </EmptyState>
          ) : null}
        </div>
      </div>

      <div className="card card-pad" style={{ display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>Transfer accounting rules</strong>
        <p className="small-text">
          Creating a transfer <strong>reserves</strong> stock at the source (it stays visible on hand but can no longer be issued or sold).
          Dispatching removes it from the source and holds it <strong>in transit</strong> — counted at neither location.
          Receiving credits the destination with the exact batches (expiry dates preserved) and updates weighted-average cost.
          Cancelling a pending transfer releases the reservation; cancelling in-transit stock returns it to the exact source batches.
          Received transfers are final — they stay in history and can be referenced if stock needs to move back.
        </p>
      </div>

      {/* create dialog */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New stock transfer"
        icon={Truck}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={create} disabled={!canCreate}>Create (reserve stock)</button>
          </>
        )}
      >
        <div className="form-grid">
          <Field label="Source location" required>
            <Select value={sourceLocationId} onChange={(e) => { setSourceLocationId(e.target.value); setLines([{ productId: '', qty: '' }]); }}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Destination location" required>
            <Select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}>
              {state.locations.filter((l) => l.id !== sourceLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <hr className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 13.2 }}>Items</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, { productId: '', qty: '' }])}>+ Add line</button>
        </div>
        {lines.map((l, i) => {
          const product = state.products.find((x) => x.id === l.productId);
          const avail = product ? available(state, product.id, sourceLocationId) : 0;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2.4fr) 120px 32px', gap: 8, alignItems: 'start', padding: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 11, marginBottom: 9 }}>
              <Field label={i === 0 ? 'Product' : undefined}>
                <Select value={l.productId} onChange={(e) => setLines((ls) => ls.map((x, j) => (i === j ? { ...x, productId: e.target.value, qty: '' } : x)))}>
                  <option value="">Select product…</option>
                  {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </Select>
                {product ? <span className="field-hint">Available: <strong style={{ color: 'var(--ok-strong)' }}>{avail}</strong> {product.unit} (pending reservations excluded)</span> : null}
              </Field>
              <Field label={i === 0 ? 'Quantity' : undefined}>
                <TextInput type="number" min="1" step="1" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (i === j ? { ...x, qty: e.target.value } : x)))} placeholder="0" />
                {l.qty !== '' && product && Number(l.qty) > avail ? <span className="field-error">Exceeds available ({avail})</span> : null}
              </Field>
              <div style={{ paddingTop: 22 }}>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))} disabled={lines.length === 1}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery notes, driver, vehicle…" />
        </Field>
      </Modal>

      {/* dispatch / receive confirm */}
      <ConfirmDialog
        open={!!confirmAction && confirmAction.kind !== 'cancel'}
        onClose={() => setConfirmAction(null)}
        onConfirm={runAction}
        title={confirmAction?.kind === 'dispatch' ? `Dispatch ${confirmAction?.ref}?` : `Confirm receipt of ${confirmAction?.ref}?`}
        message={
          confirmAction?.kind === 'dispatch'
            ? 'Reserved stock will leave the source location and enter "in transit" (counted at neither location). Batch expiry travels with the goods.'
            : 'The in-transit units will be added to the destination location as batches with their original expiry dates and weights refreshed for valuation.'
        }
        confirmLabel={confirmAction?.kind === 'dispatch' ? 'Dispatch transfer' : 'Confirm receipt'}
      />

      {confirmAction?.kind === 'cancel' ? (
        <Modal
          open
          onClose={() => { setConfirmAction(null); setCancelReason(''); }}
          title={`Cancel transfer ${confirmAction.ref}`}
          icon={CircleAlert}
          size="sm"
          footer={(
            <>
              <button className="btn btn-secondary" onClick={() => { setConfirmAction(null); setCancelReason(''); }}>Keep transfer</button>
              <span className="spacer" />
              <button className="btn btn-danger" onClick={runAction}>Cancel transfer</button>
            </>
          )}
        >
          <p className="small-text">
            A pending transfer simply releases its reservation. An in-transit transfer safely returns the goods to the exact source batches.
            <strong> Received transfers cannot be cancelled.</strong>
          </p>
          <Field label="Reason for cancellation" required>
            <TextArea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. destination changed, vehicle breakdown…" />
          </Field>
        </Modal>
      ) : null}

      {/* detail modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Transfer ${detail.ref}` : ''}
        icon={Truck}
        footer={<><span className="spacer" /><button className="btn btn-primary" onClick={() => setDetail(null)}>Done</button></>}
      >
        {detail ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <TransferBadge status={detail.status} />
              {detail.isSeeded ? <Badge color="gray">seeded history</Badge> : null}
            </div>
            <div className="detail-grid">
              <div><div className="detail-label">From</div><div className="detail-value">{state.locations.find((l) => l.id === detail.sourceLocationId)?.name}</div></div>
              <div><div className="detail-label">To</div><div className="detail-value">{state.locations.find((l) => l.id === detail.destinationLocationId)?.name}</div></div>
              <div><div className="detail-label">Created</div><div className="detail-value">{formatDateTime(detail.createdAt, settings.dateFormat)}</div></div>
              <div><div className="detail-label">Dispatched</div><div className="detail-value">{detail.dispatchedAt ? formatDateTime(detail.dispatchedAt, settings.dateFormat) : '—'}</div></div>
              {detail.receivedAt ? <div><div className="detail-label">Received</div><div className="detail-value">{formatDateTime(detail.receivedAt, settings.dateFormat)}</div></div> : null}
              {detail.cancelledAt ? <div><div className="detail-label">Cancelled</div><div className="detail-value">{formatDateTime(detail.cancelledAt, settings.dateFormat)}</div></div> : null}
              {detail.notes ? <div className="span-2"><div className="detail-label">Notes</div><div className="detail-value">{detail.notes}</div></div> : null}
            </div>
            <div style={{ marginTop: 14 }}>
              <strong style={{ fontSize: 13 }}>Items ({detail.lines.reduce((a, l) => a + l.qty, 0)} units)</strong>
              <div style={{ marginTop: 8 }}>
                {detail.lines.map((l) => (
                  <div className="batch-row" key={l.productId}>
                    <span className="b-no">{l.qty}×</span>
                    <span>{state.products.find((p) => p.id === l.productId)?.name}</span>
                    {l.batchAllocations?.length && detail.status !== 'pending' ? (
                      <span className="muted" style={{ fontSize: 11.5 }}>{l.batchAllocations.map((a2) => `${a2.qty}× ${a2.batchNo}`).join(', ')}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <strong style={{ fontSize: 13 }}>Status history</strong>
              <div className="mini-list" style={{ border: '1px solid var(--border)', borderRadius: 10, marginTop: 8 }}>
                {detail.history.map((h, i) => (
                  <div className="mini-row" key={i}>
                    <span className="mr-text"><TransferBadge status={h.status} /></span>
                    <span className="mr-when">{formatDateTime(h.at, settings.dateFormat)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
