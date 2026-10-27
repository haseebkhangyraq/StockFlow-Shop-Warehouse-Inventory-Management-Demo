// src/pages/ExpiryPage.jsx
// Batch-level expiry control: expired stock (never sellable), expiring-today,
// expiring-soon queue and quick write-off via the issuance engine — plus a
// "dead stock" segment listing batch rows for products with no recent movement.

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CalendarX2, Hourglass, Download, Trash2, Eye, ShieldAlert, PackageMinus,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import {
  EmptyState, SearchInput, Badge, ConfirmDialog, Pagination,
} from '../components/common/ui';import {
  getExpiryAlerts, getDeadStock, batchExpiryBucket, onHand,
} from '../services/inventoryEngine';
import { formatDate, daysUntil, relativeTime } from '../utils/dates';
import { formatMoney } from '../utils/currency';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 12;
const SEG_IDS = ['expired', 'expiring_today', 'expiring_soon', 'dead_stock', 'healthy', 'all'];

export default function ExpiryPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [locF, setLocF] = useState('all');
  const [page, setPage] = useState(1);
  const [segment, setSegment] = useState(() => {
    /* another module can deep-link into a segment via a flag (e.g. dashboard dead-stock card) */
    try {
      const v = sessionStorage.getItem('sf_expiry_tab');
      return SEG_IDS.includes(v) ? v : 'expired';
    } catch { /* private mode */ return 'expired'; }
  });
  const [writeOff, setWriteOff] = useState(null); // {batch, product, location}

  /* consume the deep-link flag after mount (sessionStorage may be unavailable in private mode) */
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('sf_expiry_tab');
      if (!v) return;
      sessionStorage.removeItem('sf_expiry_tab');
      if (SEG_IDS.includes(v) && v !== segment) setSegment(v);
    } catch { /* noop */ }
  }, []);

  const alerts = useMemo(() => getExpiryAlerts(state), [state]);

  const allTracked = useMemo(() => {
    const rows = [];
    for (const b of state.batches) {
      if (b.qty <= 0 || !b.expDate) continue;
      const product = state.products.find((p) => p.id === b.productId);
      if (!product || product.status !== 'active') continue;
      const bucket = batchExpiryBucket(b, settings.expiryWarningDays);
      rows.push({
        batch: b, product, location: state.locations.find((l) => l.id === b.locationId),
        days: daysUntil(b.expDate), bucket,
      });
    }
    return rows.sort((a, b) => a.days - b.days);
  }, [state, settings.expiryWarningDays]);

  /* dead stock: products with no movement for ≥ deadStockDays, expanded to batch-level rows
     (movement is tracked per product in this engine, so idle days are product-level) */
  const deadProducts = useMemo(() => getDeadStock(state), [state]);
  const deadRows = useMemo(() => {
    const rows = [];
    for (const d of deadProducts) {
      for (const b of state.batches) {
        if (b.qty <= 0 || b.productId !== d.product.id) continue;
        rows.push({
          batch: b, product: d.product,
          location: state.locations.find((l) => l.id === b.locationId),
          days: d.ageDays, bucket: 'dead_stock', lastMovementAt: d.lastMovementAt,
        });
      }
    }
    return rows.sort((a, b) => b.days - a.days || String(a.batch.batchNo).localeCompare(String(b.batch.batchNo)));
  }, [deadProducts, state.batches, state.locations]);

  const buckets = {
    expired: alerts.expired,
    expiring_today: alerts.expiringToday,
    expiring_soon: alerts.expiringSoon,
    dead_stock: deadRows,
    healthy: allTracked.filter((r) => r.bucket === 'healthy'),
    all: allTracked,
  };
  const isDead = segment === 'dead_stock';
  const SEGMENTS = [
    { id: 'expired', label: 'Expired', count: alerts.expired.length, tone: 'danger' },
    { id: 'expiring_today', label: 'Expiring today', count: alerts.expiringToday.length, tone: 'danger' },
    { id: 'expiring_soon', label: `Expiring ≤ ${settings.expiryWarningDays}d`, count: alerts.expiringSoon.length, tone: 'warn' },
    { id: 'dead_stock', label: `Dead stock ${settings.deadStockDays}d+`, count: deadRows.length, tone: 'neutral' },
    { id: 'healthy', label: 'Healthy stock', count: buckets.healthy.length, tone: 'ok' },
    { id: 'all', label: 'All dated batches', count: allTracked.length, tone: 'neutral' },
  ];

  const needle = q.trim().toLowerCase();
  const rows = buckets[segment]
    .filter((r) => locF === 'all' || r.batch.locationId === locF)
    .filter((r) => !needle || r.product.name.toLowerCase().includes(needle) || r.product.sku.toLowerCase().includes(needle) || String(r.batch.batchNo).toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const segmentValue = rows.reduce((a, r) => a + r.batch.qty * r.batch.cost, 0);
  const expiredValue = alerts.expired.reduce((a, r) => a + r.batch.qty * r.batch.cost, 0);
  const expiredAtRiskValue = [...alerts.expiringToday, ...alerts.expiringSoon].reduce((a, r) => a + r.batch.qty * r.batch.cost, 0);

  const askWriteOff = (r) => setWriteOff({ batch: r.batch, product: r.product, location: r.location });
  const runWriteOff = () => {
    if (!writeOff) return setWriteOff(null);
    const { batch, product, location } = writeOff;
    setWriteOff(null);
    perform(engine.issueStock, {
      sourceLocationId: batch.locationId,
      reason: 'expired_stock',
      destination: 'Expired stock disposal',
      lines: [{ productId: product.id, qty: batch.qty }],
      reference: `Batch ${batch.batchNo} exp ${formatDate(batch.expDate, settings.dateFormat)}`,
      notes: `Write-off of expired batch ${batch.batchNo} from ${location?.name}.`,
    });
  };

  const exportCsv = () => {
    if (isDead) {
      downloadCSV('stockflow-dead-stock', rows, [
        { label: 'Product', value: (r) => r.product.name }, { label: 'SKU', value: (r) => r.product.sku },
        { label: 'Category', value: (r) => state.categories.find((c) => c.id === r.product.categoryId)?.name || '' },
        { label: 'Location', value: (r) => r.location?.name || '' },
        { label: 'Batch', value: (r) => r.batch.batchNo },
        { label: 'Qty', value: (r) => r.batch.qty },
        { label: 'Unit cost', value: (r) => (r.batch.cost / 100).toFixed(2) },
        { label: `Stock value (${cur})`, value: (r) => (r.batch.qty * r.batch.cost / 100).toFixed(2) },
        { label: 'Last movement', value: (r) => formatDate(r.lastMovementAt, settings.dateFormat) },
        { label: `Idle days (threshold ${settings.deadStockDays})`, value: (r) => r.days },
      ]);
      return;
    }
    downloadCSV(`stockflow-expiry-${segment}`, rows, [
      { label: 'Product', value: (r) => r.product.name }, { label: 'SKU', value: (r) => r.product.sku },
      { label: 'Category', value: (r) => state.categories.find((c) => c.id === r.product.categoryId)?.name || '' },
      { label: 'Location', value: (r) => r.location?.name || '' },
      { label: 'Batch', value: (r) => r.batch.batchNo },
      { label: 'Expiry date', value: (r) => formatDate(r.batch.expDate, settings.dateFormat) },
      { label: 'Days relative', value: (r) => r.days },
      { label: 'Bucket', value: (r) => r.bucket },
      { label: 'Qty', value: (r) => r.batch.qty },
      { label: 'Unit cost', value: (r) => (r.batch.cost / 100).toFixed(2) },
      { label: `Stock value (${cur})`, value: (r) => (r.batch.qty * r.batch.cost / 100).toFixed(2) },
    ]);
  };

  const stats = [
    { label: 'Expired batches', value: alerts.expired.length, icon: CalendarX2, tone: 'red', alert: alerts.expired.length > 0, sub: `${fmt(expiredValue)} sunk cost — never sellable` },
    { label: 'Expiring today', value: alerts.expiringToday.length, icon: Hourglass, tone: 'amber', alert: alerts.expiringToday.length > 0, sub: 'run a push sale or write off tomorrow' },
    { label: 'Expiring soon', value: alerts.expiringSoon.length, icon: CalendarClock, tone: 'yellow', alert: alerts.expiringSoon.length > 0, sub: `within the ${settings.expiryWarningDays}-day window · ${fmt(expiredAtRiskValue)}` },
    { label: 'Dated batches tracked', value: allTracked.length.toLocaleString(), icon: ShieldAlert, tone: 'blue', sub: 'every batch with an expiry date' },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><CalendarClock size={21} /> Expiry Management</h1>
          <p className="page-sub">Batch-level visibility into shelf life and stock rotation. Expired units are blocked at the POS automatically — clear them with a documented write-off, and surface no-movement (dead) stock before capital gets stuck.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="red">{alerts.expired.length} expired</Badge>
            <Badge color="amber">{alerts.expiringSoon.length + alerts.expiringToday.length} at risk</Badge>
            {deadProducts.length ? <Badge color="gray">{deadProducts.length} dead products</Badge> : null}
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <span className="muted" style={{ fontSize: 11.5 }}>warning window: <strong style={{ color: 'var(--text)' }}>{settings.expiryWarningDays} days</strong></span>
        </div>
      </div>

      <div className="stat-grid section">
        {stats.map((c) => (
          <div className="stat-card" key={c.label}>
            <div className="stat-top">
              <div className={`stat-ic ${c.tone === 'yellow' ? 'amber' : c.tone}`}><c.icon /></div>
              <div className="stat-label">{c.label}</div>
            </div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-foot">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="card section">
        <div style={{ padding: '13px 16px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} role="tablist" aria-label="Expiry and dead-stock segments">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={segment === s.id}
              className={`seg-tab${segment === s.id ? ' active' : ''}`}
              onClick={() => { setSegment(s.id); setPage(1); }}
            >
              {s.label}
              <span className={`seg-count ${s.tone}`}>{s.count}</span>
            </button>
          ))}
        </div>
        <div className="toolbar" style={{ borderTop: '1px solid var(--border)', marginTop: 12, padding: '12px 16px', background: 'transparent', boxShadow: 'none' }}>
          <div className="toolbar-left">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search product, SKU or batch…" />
            <select value={locF} onChange={(e) => { setLocF(e.target.value); setPage(1); }}>
              <option value="all">All locations</option>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="stat-inline" style={{ marginLeft: 'auto' }}>
            <span className="small-text" style={{ fontWeight: 650 }}>{isDead ? 'batch rows' : 'batches'} · {rows.length}</span>
            <Badge color="violet">{fmt(segmentValue)}</Badge>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th><th>Location</th><th>Batch</th>
                <th className="cell-num">Qty</th>
                {isDead ? <th>Last movement</th> : <th>Expiry date</th>}
                <th className="cell-num">{isDead ? 'Idle days' : 'Days'}</th>
                <th>Status</th>
                <th className="cell-num">Value</th><th style={{ width: 108 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr key={`${r.batch.id}-${i}`}>
                  <td>
                    <span className="cell-strong">{r.product.name}</span>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>{r.product.sku}</div>
                  </td>
                  <td>{r.location?.name || '—'}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{String(r.batch.batchNo)}</td>
                  <td className="cell-num cell-strong">{r.batch.qty} {r.product.unit}</td>
                  {isDead ? (
                    <td className="nowrap">
                      {formatDate(r.lastMovementAt, settings.dateFormat)}
                      {(() => {
                        const rel = relativeTime(r.lastMovementAt, settings.dateFormat);
                        return rel !== formatDate(r.lastMovementAt, settings.dateFormat)
                          ? <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>{rel}</span>
                          : null;
                      })()}
                    </td>
                  ) : (
                    <td className="nowrap">{formatDate(r.batch.expDate, settings.dateFormat)}</td>
                  )}
                  <td
                    className="cell-num"
                    style={isDead
                      ? { color: 'var(--muted)', fontWeight: 700 }
                      : { color: r.days < 0 ? 'var(--danger-strong)' : r.days <= 7 ? 'var(--warn-strong)' : 'var(--text-2)', fontWeight: 700 }}
                  >
                    {isDead ? r.days : r.days < 0 ? `−${-r.days}` : r.days}
                  </td>
                  <td>
                    <Badge color={r.bucket === 'expired' || r.bucket === 'expiring_today' ? 'red' : r.bucket === 'expiring_soon' ? 'amber' : r.bucket === 'dead_stock' ? 'gray' : 'green'}>
                      {isDead ? 'no movement' : r.bucket.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="cell-num">{fmt(r.batch.qty * r.batch.cost)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {r.bucket === 'expired' ? (
                        <button className="btn btn-ghost btn-sm btn-icon" title="Write off expired units" onClick={() => askWriteOff(r)}><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>
                      ) : null}
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="View product in Inventory"
                        onClick={() => {
                          try { sessionStorage.setItem('sf_focus_product', r.product.id); } catch { /* ignore */ }
                          window.location.hash = '#/inventory';
                        }}
                      ><Eye size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState
              icon={segment === 'expired' ? CalendarX2 : segment === 'dead_stock' ? Hourglass : PackageMinus}
              title={segment === 'expired' ? 'No expired stock' : segment === 'dead_stock' ? 'No dead stock' : 'Nothing in this bucket'}
              sub={segment === 'expired'
                ? 'Shelves are clean — expired batches would appear here for disposal.'
                : segment === 'dead_stock'
                  ? `Every active product moved within the last ${settings.deadStockDays} days — nothing is idle.`
                  : 'Adjust the filters or switch tabs above.'}
            />
          ) : null}
        </div>
        {rows.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={rows.length} label={isDead ? 'batch rows' : 'batches'} />
        ) : null}
      </div>

      <div className="storage-banner section" role="note">
        <ShieldAlert size={15} />
        <span>
          <strong>Sell-blocking:</strong> expired units are excluded from the POS sellable count automatically. Writing off uses a stock issuance (reason
          “expired stock write-off”), consuming the earliest-expiring batches first per FEFO — every action is logged to history.
          The <strong>Dead stock</strong> tab lists batch-level rows for products with no movement for the
          {' '}{settings.deadStockDays}-day threshold (editable in Settings) — it is informational and nothing is deleted automatically.
        </span>
      </div>

      <ConfirmDialog
        open={!!writeOff}
        onClose={() => setWriteOff(null)}
        onConfirm={runWriteOff}
        title={`Write off ${writeOff?.batch.qty} × ${writeOff?.product.name}?`}
        message={
          <>
            <div>
              This creates an issuance document that removes the expired units from{' '}
              <strong>{writeOff?.location?.name}</strong> (batch <span className="mono">{String(writeOff?.batch.batchNo)}</span>,
              value <strong>{writeOff ? fmt(writeOff.batch.qty * writeOff.batch.cost) : ''}</strong>).
            </div>
            <div style={{ marginTop: 6 }}>The destination is “Expired stock disposal”; history keeps the full audit trail.</div>
          </>
        }
        confirmLabel="Write off expired stock"
        danger
      />
    </>
  );
}
