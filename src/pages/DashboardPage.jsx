// src/pages/DashboardPage.jsx
import { useMemo, useState } from 'react';
import {
  Package, Boxes, CircleDollarSign, AlertTriangle, XCircle, CalendarX2, CalendarClock,
  Hourglass, ShoppingCart, ArrowUpRight, Truck, PackagePlus, Warehouse as WarehouseIcon,
  ClipboardList, RefreshCw,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  calculateDashboardMetrics, getStockAlerts, getExpiryAlerts, getDeadStock,
  getReplenishmentList,
} from '../services/inventoryEngine';
import { getSalesSeries, getMovementSeries, getCategoryDistribution, getTopProducts, getHealthBreakdown, buildReport } from '../services/reportingService';
import { SalesAreaChart, ReceivedIssuedBars, CategoryDonut, HealthDonut, TopBars, TrendLineChart } from '../components/charts/Charts';
import { EmptyState, Badge, ConfirmDialog } from '../components/common/ui';
import { formatMoney } from '../utils/currency';
import { dayKey, addDays, eachDayKey, relativeTime, dayKeyLabel } from '../utils/dates';

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom' },
];

function rangeToKeys(range) {
  const today = dayKey(new Date());
  if (!range || range.type === 'today') return { from: today, to: today };
  if (range.type === '7d') { const d = new Date(); d.setDate(d.getDate() - 6); return { from: dayKey(d), to: today }; }
  if (range.type === '30d') { const d = new Date(); d.setDate(d.getDate() - 29); return { from: dayKey(d), to: today }; }
  return { from: range.from || today, to: range.to || today };
}

const ACTION_ICONS = {
  stock_receipt: PackagePlus, stock_issue: ClipboardList, sale: ShoppingCart,
  adjustment: RefreshCw, transfer: Truck, transfer_received: PackagePlus,
  transfer_dispatch: Truck, transfer_created: Truck, transfer_cancelled: XCircle,
  sale_return: RefreshCw, settings_updated: RefreshCw,
  product_created: Package, product_updated: Package, product_archived: Package,
  product_deleted: Package, category_created: Package, category_updated: Package,
  category_deleted: Package, supplier_created: ClipboardList, supplier_updated: ClipboardList,
  customer_created: ClipboardList, customer_updated: ClipboardList, archive_note: ClipboardList,
};

export function consumeActionFlag(name) {
  try {
    const v = sessionStorage.getItem(name);
    if (v) { sessionStorage.removeItem(name); }
    return v || null;
  } catch { return null; }
}

export default function DashboardPage({ navigate }) {
  const { state, settings, formatMoney, resetDemo } = useInventory();
  const [rangeId, setRangeId] = useState('7d');
  const [custom, setCustom] = useState({ from: dayKey(addDays(new Date(), -13)), to: dayKey(new Date()) });
  const [resetOpen, setResetOpen] = useState(false);

  const range = rangeId === 'custom' ? { type: 'custom', ...custom } : { type: rangeId };
  const keys = rangeToKeys(range);

  const metrics = useMemo(() => calculateDashboardMetrics(state, keys), [state, keys]);
  const alerts = useMemo(() => getStockAlerts(state), [state]);
  const expiry = useMemo(() => getExpiryAlerts(state), [state]);
  const dead = useMemo(() => getDeadStock(state).slice(0, 5), [state]);
  const replenish = useMemo(() => getReplenishmentList(state).slice(0, 6), [state]);
  const pendingTransfers = useMemo(() => state.transfers.filter((t) => t.status === 'pending' || t.status === 'in_transit'), [state.transfers]);

  /* open Expiry Management with the "Dead stock" segment preselected */
  const goDeadStockView = () => {
    try { sessionStorage.setItem('sf_expiry_tab', 'dead_stock'); } catch { /* noop */ }
    navigate('/expiry');
  };

  const salesSeries = useMemo(() => getSalesSeries(state, keys), [state, keys]);
  const movementSeries = useMemo(() => getMovementSeries(state, keys), [state, keys]);
  const categories = useMemo(() => getCategoryDistribution(state), [state]);
  const top = useMemo(() => getTopProducts(state, keys, 6), [state, keys]);
  const health = useMemo(() => getHealthBreakdown(state), [state]);
  const recentActivity = useMemo(() => state.activity.slice(0, 7), [state.activity]);
  const latestSales = useMemo(() => state.sales.slice(0, 6), [state.sales]);

  const cur = settings.currency;
  const salesLabel = rangeId === 'today' ? 'Sales — Today' : rangeId === '7d' ? 'Sales — Last 7 Days' : rangeId === '30d' ? 'Sales — Last 30 Days' : 'Sales — Custom Range';

  const statCards = [
    { label: 'Products', value: metrics.totalProducts, icon: Package, tone: 'blue', sub: `${categories.length ? categories.reduce((a, c) => a + c.products, 0) : metrics.totalProducts} active in catalog` },
    { label: 'Total Stock Units', value: metrics.totalUnits.toLocaleString(), icon: Boxes, tone: 'teal', sub: metrics.transitUnits ? `${metrics.transitUnits.toLocaleString()} units in transit` : 'across all locations' },
    { label: 'Inventory Value', value: formatMoney(metrics.inventoryCostValue, cur), icon: CircleDollarSign, tone: 'violet', sub: `Retail ${formatMoney(metrics.retailValue, cur)}` },
    { label: 'Low Stock Items', value: metrics.lowStockCount, icon: AlertTriangle, tone: 'amber', alert: metrics.lowStockCount > 0, sub: 'at or below reorder level' },
    { label: 'Out of Stock', value: metrics.outOfStockCount, icon: XCircle, tone: 'red', alert: metrics.outOfStockCount > 0, sub: 'no stock in any location' },
    { label: 'Expired Products', value: metrics.expiredProductsCount, icon: CalendarX2, tone: 'red', alert: metrics.expiredProductsCount > 0, sub: 'batches past expiry on shelf' },
    { label: 'Expiring Soon', value: metrics.nearExpiryProductsCount, icon: CalendarClock, tone: 'amber', alert: metrics.nearExpiryProductsCount > 0, sub: `within ${settings.expiryWarningDays} days` },
    { label: 'Dead Stock', value: metrics.deadStockCount, icon: Hourglass, tone: 'gray', sub: `${settings.deadStockDays}+ days without movement` },
    { label: salesLabel, value: formatMoney(metrics.salesTotal, cur), icon: ShoppingCart, tone: 'green', sub: `${metrics.salesCount} orders · ${metrics.unitsSold.toLocaleString()} units` },
    { label: 'Units Sold Today', value: metrics.todayUnits.toLocaleString(), icon: ArrowUpRight, tone: 'green', sub: `today ${formatMoney(metrics.todaySalesTotal, cur)} so far` },
    { label: 'Pending Transfers', value: metrics.pendingTransfers, icon: Truck, tone: 'blue', alert: metrics.pendingTransfers > 0, sub: 'awaiting dispatch or receipt' },
    { label: 'Receipts (7 days)', value: metrics.recentReceipts, icon: PackagePlus, tone: 'teal', sub: 'stock received this week' },
  ];

  return (
    <>
      <div className="dash-greet">
        <div>
          <h1>Good day, Demo Operator</h1>
          <p>Here’s what’s happening across StockFlow Demo Mart right now — warehouse, shops and sales in one view.</p>
        </div>
        <div className="range-filter" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.id} className={rangeId === r.id ? 'active' : ''} onClick={() => setRangeId(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>

      {rangeId === 'custom' ? (
        <div className="card card-pad" style={{ marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small-text" style={{ fontWeight: 700 }}>Custom range:</span>
          <label className="field" style={{ maxWidth: 180 }}>
            <input type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </label>
          <span className="muted">to</span>
          <label className="field" style={{ maxWidth: 180 }}>
            <input type="date" className="input" value={custom.to} min={custom.from} max={dayKey(new Date())} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </label>
          <Badge color="blue">{eachDayKey(custom.from, custom.to).length} days sampled</Badge>
        </div>
      ) : null}

      {/* stat cards */}
      <div className="stat-grid section">
        {statCards.map((c) => (
          <div
            key={c.label}
            role="button"
            tabIndex={0}
            className="stat-card"
            style={{ cursor: 'pointer' }}
            onClick={statNav(c.label, navigate)}
            onKeyDown={(e) => { if (e.key === 'Enter') statNav(c.label, navigate); }}
            aria-label={`${c.label}: ${c.value}`}
          >
            <div className="stat-top">
              <div className={`stat-ic ${c.tone}`}><c.icon /></div>
              <div className="stat-label">{c.label}</div>
            </div>
            <div className="stat-value">{c.value}</div>
            <div className="stat-foot">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* charts row 1 */}
      <div className="grid-2-1 section">
        <div className="card">
          <div className="card-head">
            <h3><ShoppingCart size={14} style={{ color: 'var(--primary)' }} /> Sales over time</h3>
            <span className="head-sub">{dayKeyLabel(keys.from)} → {dayKeyLabel(keys.to)}</span>
          </div>
          <div className="chart-body tall"><SalesAreaChart data={salesSeries} /></div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Inventory by category</h3>
            <span className="head-sub">by stock value</span>
          </div>
          <div className="chart-body"><CategoryDonut data={categories} fmtMoney={(m) => formatMoney(m, cur)} /></div>
          <div className="chart-legend" style={{ flexDirection: 'column', gap: 6 }}>
            {categories.slice(0, 6).map((c) => (
              <div className="cl-item" key={c.id}>
                <span className="cl-dot" style={{ background: c.color }} />
                {c.name}
                <span style={{ color: 'var(--faint)', marginLeft: 'auto', fontWeight: 600 }}>{formatMoney(c.value * 100, cur)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* charts row 2 */}
      <div className="grid-2-1 section">
        <div className="card">
          <div className="card-head">
            <h3>Stock received vs issued vs sold</h3>
            <span className="head-sub">units per day</span>
          </div>
          <div className="chart-body tall"><ReceivedIssuedBars data={movementSeries} /></div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Inventory health</h3>
            <span className="head-sub">{metrics.totalProducts} active products</span>
          </div>
          <div className="chart-body"><HealthDonut data={health} /></div>
          <div className="chart-legend" style={{ flexDirection: 'column', gap: 6 }}>
            {health.map((h) => (
              <div className="cl-item" key={h.name}>
                <span className="cl-dot" style={{ background: h.color }} />
                {h.name}
                <span style={{ color: 'var(--faint)', marginLeft: 'auto', fontWeight: 700 }}>{h.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* top products + movement trend */}
      <div className="grid-2-1 section">
        <div className="card">
          <div className="card-head">
            <h3>Top-selling products</h3>
            <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
              <button className="link" onClick={() => navigate('/top-selling')}>Top sellers →</button>
              <button className="link" onClick={() => navigate('/reports')}>Sales report →</button>
            </span>
          </div>
          {top.length ? <TopBars rows={top} fmtMoney={(m) => formatMoney(m, cur)} /> : (
            <EmptyState title="No sales in this range" sub="Completed sales for the selected period will rank here." />
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Stock movement trend</h3>
            <span className="head-sub">net units</span>
          </div>
          <div className="chart-body"><MovementTrend data={movementSeries} /></div>
          <div style={{ padding: '0 18px 12px', fontSize: 11.2, color: 'var(--muted)' }}>
            Trend shows daily net movement (received + transfers in − issued − sold). Dips below zero mean stock left the shelves faster than it arrived.
          </div>
        </div>
      </div>

      {/* quick actions */}
      <div className="card section">
        <div className="card-head"><h3>Quick actions</h3></div>
        <div className="card-pad quick-actions">
          <button className="quick-action" onClick={() => { sessionStorage.setItem('sf_open_product', '1'); navigate('/warehouse'); }}>
            <span className="qa-ic"><Package /></span> Add a product
          </button>
          <button className="quick-action ok-ic" onClick={() => { sessionStorage.setItem('sf_open_receive', '1'); navigate('/receiving'); }}>
            <span className="qa-ic"><PackagePlus /></span> Receive stock
          </button>
          <button className="quick-action alert-ic" onClick={() => { sessionStorage.setItem('sf_open_issue', '1'); navigate('/issuance'); }}>
            <span className="qa-ic"><ClipboardList /></span> Issue stock
          </button>
          <button className="quick-action violet-ic" onClick={() => { sessionStorage.setItem('sf_open_transfer', '1'); navigate('/transfers'); }}>
            <span className="qa-ic"><Truck /></span> Transfer stock
          </button>
          <button className="quick-action" onClick={() => navigate('/pos')}>
            <span className="qa-ic"><ShoppingCart /></span> Open POS
          </button>
          <button className="quick-action" onClick={() => navigate('/reports')}>
            <span className="qa-ic"><RefreshCw /></span> View reports
          </button>
        </div>
      </div>

      {/* alerts + lists */}
      <div className="grid-2 section">
        <div className="card">
          <div className="card-head">
            <h3>Critical stock alerts</h3>
            <div className="card-head-right"><Badge color="red">{alerts.out.length + alerts.low.length} active</Badge></div>
          </div>
          <div className="alert-list">
            {alerts.out.length === 0 && alerts.low.length === 0 ? (
              <EmptyState title="Everything stocked" sub="No product is at or below its reorder level right now." />
            ) : (
              [...alerts.out.slice(0, 5), ...alerts.low.slice(0, 5)].slice(0, 8).map((a, i) => (
                <button key={i} className="alert-row" onClick={() => navigate('/inventory')} style={{ borderWidth: 0, borderBottomWidth: 1, borderColor: 'var(--border)', background: 'none', textAlign: 'left' }}>
                  <span className={`ar-ic ${a.avail === 0 ? 'red' : 'amber'}`}>
                    {a.avail === 0 ? <XCircle size={15} /> : <AlertTriangle size={15} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ar-title" style={{ display: 'block' }}>{a.product.name}</span>
                    <span className="ar-sub">{a.location ? a.location.name : 'All locations'} · reorder at {a.product.reorderLevel}</span>
                  </span>
                  <span className="ar-right">
                    <span className="ar-qty">{a.avail === 0 ? '0' : a.avail} {a.product.unit}</span>
                    <div style={{ marginTop: 3 }}><Badge color={a.avail === 0 ? 'red' : 'amber'}>{a.avail === 0 ? 'Out of stock' : 'Low'}</Badge></div>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Expiry alerts</h3>
            <div className="card-head-right"><button className="link" onClick={() => navigate('/expiry')}>Expiry module →</button></div>
          </div>
          <div className="alert-list">
            {[...expiry.expired, ...expiry.expiringToday, ...expiry.expiringSoon].length === 0 ? (
              <EmptyState title="No expiring stock" sub={`Nothing expires within your ${settings.expiryWarningDays}-day warning window.`} />
            ) : (
              [...expiry.expired.slice(0, 3), ...expiry.expiringToday.slice(0, 2), ...expiry.expiringSoon.slice(0, 3)].slice(0, 7).map((r, i) => (
                <button key={i} className="alert-row" onClick={() => navigate('/expiry')} style={{ borderWidth: 0, borderBottomWidth: 1, borderColor: 'var(--border)', background: 'none', textAlign: 'left' }}>
                  <span className={`ar-ic ${r.days < 0 ? 'red' : 'amber'}`}>{r.days < 0 ? <CalendarX2 size={15} /> : <CalendarClock size={15} />}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ar-title" style={{ display: 'block' }}>{r.product.name}</span>
                    <span className="ar-sub">Batch {r.batch.batchNo} · {r.location?.name} · {r.days < 0 ? `expired ${-r.days}d ago` : r.days === 0 ? 'expires today' : `expires in ${r.days}d`}</span>
                  </span>
                  <span className="ar-right"><span className="ar-qty">{r.batch.qty} {r.product.unit}</span>
                    <div style={{ marginTop: 3 }}><Badge color={r.days < 0 ? 'red' : r.days === 0 ? 'red' : 'amber'}>{r.days < 0 ? 'Expired' : r.days === 0 ? 'Today' : `In ${r.days}d`}</Badge></div>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card">
          <div className="card-head"><h3>Recent transactions</h3><button className="link" onClick={() => navigate('/activity')}>Full log →</button></div>
          <div className="mini-list">
            {recentActivity.map((a) => {
              const Icon = ACTION_ICONS[a.action] || ClipboardList;
              return (
                <div className="mini-row" key={a.id}>
                  <span className="mr-ic" style={{ background: 'var(--primary-soft)', color: 'var(--primary-strong)' }}><Icon size={13} /></span>
                  <span className="mr-text">
                    <span className="mr-title">{a.description}</span>
                    <span className="mr-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ color: 'var(--primary)' }}>{a.refId}</span>
                      {a.isSeeded ? <Badge color="gray">seeded</Badge> : null}
                    </span>
                  </span>
                  <span className="mr-when">{relativeTime(a.at)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Latest sales</h3><button className="link" onClick={() => navigate('/sales')}>Sales history →</button></div>
          <div className="mini-list">
            {latestSales.length === 0 ? (
              <EmptyState title="No sales recorded yet" sub="Open the Point of Sale to make the first sale — it will appear here instantly." />
            ) : latestSales.map((s) => (
              <button key={s.id} className="mini-row" onClick={() => navigate('/sales')} style={{ borderWidth: 0, borderBottomWidth: 1, borderColor: 'var(--border)', background: 'none', textAlign: 'left', width: '100%' }}>
                <span className="mr-ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok-strong)' }}><ShoppingCart size={13} /></span>
                <span className="mr-text">
                  <span className="mr-title">{s.receiptNo} · {s.lines.length} item line(s)</span>
                  <span className="mr-sub">{s.paymentMethod.toUpperCase()} · {s.locationId === 'loc_wh' ? 'Warehouse' : state.locations.find((l) => l.id === s.locationId)?.name}{s.isSeeded ? ' · seeded' : ''}</span>
                </span>
                <span className="mr-when" style={{ fontWeight: 700, color: 'var(--ok-strong)' }}>{formatMoney(Math.max(0, s.total - (s.returnedTotal || 0)), cur)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-3 section">
        <div className="card">
          <div className="card-head">
            <h3>Replenishment needed</h3>
            <button className="link" onClick={() => { sessionStorage.setItem('sf_open_receive', '1'); navigate('/receiving'); }}>Receive →</button>
          </div>
          <div className="alert-list">
            {replenish.length === 0 ? (
              <EmptyState title="Nothing to replenish" sub="All products are above their reorder levels." />
            ) : replenish.map((r, i) => (
              <div className="alert-row" key={i}>
                <span className="ar-ic amber"><AlertTriangle size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ar-title" style={{ display: 'block' }}>{r.product.name}</span>
                  <span className="ar-sub">{r.location.name} · reorder level {r.reorderLevel}</span>
                </span>
                <span className="ar-qty">{r.avail}/{r.reorderLevel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>No movement (dead stock)</h3>
            <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
              <Badge color="gray">{settings.deadStockDays}d threshold</Badge>
              <button className="link" onClick={goDeadStockView}>Dead stock →</button>
            </span>
          </div>
          <div className="alert-list">
            {dead.length === 0 ? (
              <EmptyState title="No dead stock" sub={`No product has been idle for ${settings.deadStockDays}+ days right now.`} />
            ) : dead.map((r) => (
              <button
                key={r.product.id}
                className="alert-row"
                onClick={goDeadStockView}
                style={{ borderWidth: 0, borderBottomWidth: 1, borderColor: 'var(--border)', background: 'none', textAlign: 'left' }}
              >
                <span className="ar-ic gray" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}><Hourglass size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ar-title" style={{ display: 'block' }}>{r.product.name}</span>
                  <span className="ar-sub">last movement {relativeTime(r.lastMovementAt)}</span>
                </span>
                <span className="ar-qty">{r.units} {r.product.unit}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Pending transfers</h3>
            <button className="link" onClick={() => navigate('/transfers')}>Transfers →</button>
          </div>
          <div className="alert-list">
            {pendingTransfers.length === 0 ? (
              <EmptyState title="No open transfers" sub="All stock transfers have been completed." />
            ) : pendingTransfers.map((t) => (
              <button key={t.id} className="alert-row" onClick={() => navigate('/transfers')} style={{ borderWidth: 0, borderBottomWidth: 1, borderColor: 'var(--border)', background: 'none', textAlign: 'left' }}>
                <span className={`ar-ic ${t.status === 'pending' ? 'amber' : 'blue'}`}><Truck size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ar-title">{t.ref} · {t.lines.reduce((a, l) => a + l.qty, 0)} units</span>
                  <span className="ar-sub">{state.locations.find((l) => l.id === t.sourceLocationId)?.name} → {state.locations.find((l) => l.id === t.destinationLocationId)?.name}</span>
                </span>
                <Badge color={t.status === 'pending' ? 'amber' : 'blue'}>{t.status.replace('_', ' ')}</Badge>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad section" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <strong style={{ fontSize: 13.5 }}>Demonstration data note</strong>
          <p className="small-text" style={{ marginTop: 3 }}>
            History before {relativeTime(state.seededAt)} was seeded as realistic sample records (marked “seeded”).
            Everything you do in this session is stored only in this browser. Sales shown occurred as seeded demonstration
            history or during your session — this demo does not fabricate new history each time you open the dashboard.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => setResetOpen(true)}>
          <RefreshCw size={14} /> Reset demo data
        </button>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => { setResetOpen(false); resetDemo(); }}
        title="Reset demonstration data?"
        message="This clears every change you made in this session and restores the original sample dataset (products, stock, history, settings). The action cannot be undone."
        confirmLabel="Reset demo"
        danger
      />
    </>
  );
}

function MovementTrend({ data }) {
  const rows = data.map((d) => ({ ...d, net: d.received - d.issued - d.sold }));
  const colors = { net: '#7c3aed' };
  return <TrendLineChart data={rows} keys={[{ key: 'net', name: 'Net movement' }]} colors={colors} />;
}

function statNav(label, navigate) {
  const map = {
    'Low Stock Items': '/inventory',
    'Out of Stock': '/inventory',
    'Expired Products': '/expiry',
    'Expiring Soon': '/expiry',
    'Dead Stock': '/expiry',
    'Pending Transfers': '/transfers',
    'Receipts (7 days)': '/receiving',
  };
  return () => {
    /* the dead-stock card opens Expiry Management preselected on the "Dead stock" tab */
    if (label === 'Dead Stock') {
      try { sessionStorage.setItem('sf_expiry_tab', 'dead_stock'); } catch { /* noop */ }
    }
    if (map[label]) navigate(map[label]);
  };
}
