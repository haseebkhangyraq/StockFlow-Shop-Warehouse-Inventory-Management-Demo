// src/pages/TopSellingPage.jsx
// Ranking of the best-moving products for a chosen sales window — units sold
// (net of returns), revenue, stock-on-hand context and direct navigation.

import { useMemo, useState } from 'react';
import { TrendingUp, Download, Eye, Medal, PackageSearch } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import { EmptyState, SearchInput, Badge, Pagination } from '../components/common/ui';
import { getTopProducts } from '../services/reportingService';
import { dayKey, addDays } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 12;

/** Sales windows for the ranking. `from` returns a day-key or null for all history. */
const WINDOWS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export default function TopSellingPage() {
  const { state, settings, formatMoney } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [winId, setWinId] = useState('30d');
  const [page, setPage] = useState(1);

  const win = WINDOWS.find((w) => w.id === winId);
  const fromKey = win.days ? dayKey(addDays(new Date(), -(win.days - 1))) : null;
  const range = fromKey ? { from: fromKey, to: dayKey(new Date()) } : null;

  /* units + revenue are computed by the reporting service (net of returns, all locations) */
  const sellers = useMemo(() => (
    getTopProducts(state, range, 500)
      .map((t) => {
        const product = state.products.find((p) => p.id === t.productId);
        if (!product) return null;
        return {
          product,
          qty: t.qty,
          revenue: t.revenue,
          onHand: engine.totalOnHand(state, t.productId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue || a.product.name.localeCompare(b.product.name))
  ), [state, fromKey]);

  const needle = q.trim().toLowerCase();
  const rows = sellers.filter((r) => !needle
    || r.product.name.toLowerCase().includes(needle)
    || r.product.sku.toLowerCase().includes(needle));

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const totalUnits = sellers.reduce((a, r) => a + r.qty, 0);
  const totalRevenue = sellers.reduce((a, r) => a + r.revenue, 0);
  const best = sellers[0];

  const exportCsv = () => {
    downloadCSV(`stockflow-top-sellers-${winId}`, rows.map((r, i) => ({ ...r, rank: i + 1 })), [
      { label: 'Rank', value: (r) => r.rank },
      { label: 'Product', value: (r) => r.product.name },
      { label: 'SKU', value: (r) => r.product.sku },
      { label: 'Category', value: (r) => state.categories.find((c) => c.id === r.product.categoryId)?.name || '' },
      { label: 'Unit', value: (r) => r.product.unit },
      { label: `Units sold (${win.label.toLowerCase()}, net of returns)`, value: (r) => r.qty },
      { label: `Revenue (${cur})`, value: (r) => (r.revenue / 100).toFixed(2) },
      { label: 'On hand (all locations)', value: (r) => r.onHand },
      { label: 'Stock status', value: (r) => engine.stockStatus(state, r.product.id) },
    ]);
  };

  const stats = best ? [
    {
      label: 'Best seller — units',
      value: best.qty.toLocaleString(),
      icon: Medal,
      tone: 'violet',
      sub: `${best.product.name} leads the ${win.label.toLowerCase()}`,
    },
    {
      label: `Units sold · ${win.label.toLowerCase()}`,
      value: totalUnits.toLocaleString(),
      icon: TrendingUp,
      tone: 'teal',
      sub: `${sellers.length} product${sellers.length === 1 ? '' : 's'} moved`,
    },
    {
      label: `Revenue · ${win.label.toLowerCase()}`,
      value: fmt(totalRevenue),
      icon: TrendingUp,
      tone: 'green',
      sub: `across ${state.locations.filter((l) => l.type === 'shop').length} shops`,
    },
    {
      label: 'Catalog coverage',
      value: `${Math.round((sellers.length / Math.max(1, state.products.filter((p) => p.status === 'active').length)) * 100)}%`,
      icon: PackageSearch,
      tone: 'blue',
      sub: `${sellers.length} of ${state.products.filter((p) => p.status === 'active').length} active products sold`,
    },
  ] : [];

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><TrendingUp size={21} /> Top Selling Products</h1>
          <p className="page-sub">
            Ranking of the best movers for the selected window. Units are counted net of returns and grouped
            across both shops — the dictionary of what your stock rotation really looks like.
          </p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}>
            <Download size={15} /> Export CSV
          </button>
          {best ? (
            <span className="muted" style={{ fontSize: 11.5 }}>
              #1: <strong style={{ color: 'var(--text)' }}>{best.product.name}</strong> · {best.qty} {best.product.unit}
            </span>
          ) : null}
        </div>
      </div>

      {stats.length ? (
        <div className="stat-grid section">
          {stats.map((c) => (
            <div className="stat-card" key={c.label}>
              <div className="stat-top">
                <div className={`stat-ic ${c.tone}`}><c.icon /></div>
                <div className="stat-label">{c.label}</div>
              </div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-foot">{c.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card section">
        <div className="toolbar" style={{ boxShadow: 'none', background: 'transparent' }}>
          <div className="toolbar-left">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search product or SKU…" />
            <select value={winId} onChange={(e) => { setWinId(e.target.value); setPage(1); }}>
              {WINDOWS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </div>
          <div className="stat-inline" style={{ marginLeft: 'auto' }}>
            <span className="small-text" style={{ fontWeight: 650 }}>{rows.length} products</span>
            <span className="muted" style={{ fontSize: 11.5 }}>{fromKey ? `${fromKey} → today` : 'full history'}</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Product</th>
                <th>Category</th>
                <th className="cell-num">Units sold</th>
                <th className="cell-num">Revenue</th>
                <th className="cell-num">On hand</th>
                <th>Stock status</th>
                <th style={{ width: 86 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => {
                const rank = (pageSafe - 1) * PAGE_SIZE + i + 1;
                const ss = engine.stockStatus(state, r.product.id);
                const share = totalUnits ? Math.round((r.qty / totalUnits) * 100) : 0;
                return (
                  <tr key={r.product.id}>
                    <td>
                      <span
                        className="cell-strong rank-no"
                        style={{
                          display: 'inline-flex', width: 26, height: 26, borderRadius: 8,
                          alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12,
                          background: rank <= 3 ? 'var(--violet-soft, rgba(124,58,237,0.13))' : 'var(--surface-2)',
                          color: rank <= 3 ? 'var(--violet, #7c3aed)' : 'var(--muted)',
                        }}
                      >{rank}</span>
                    </td>
                    <td>
                      <span className="cell-strong">{r.product.name}</span>
                      {rank === 1 ? <Badge color="violet" >#1 best seller · {share}% of units</Badge> : null}
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
                        {r.product.sku} · {r.product.unit}
                      </div>
                    </td>
                    <td>{state.categories.find((c) => c.id === r.product.categoryId)?.name || '—'}</td>
                    <td className="cell-num cell-strong">{r.qty.toLocaleString()}</td>
                    <td className="cell-num">{fmt(r.revenue)}</td>
                    <td className="cell-num">{r.onHand} {r.product.unit}</td>
                    <td>
                      <Badge color={ss === 'out' ? 'red' : ss === 'low' ? 'amber' : ss === 'overstocked' ? 'blue' : 'green'}>
                        {ss.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="View product in Inventory"
                        onClick={() => {
                          try { sessionStorage.setItem('sf_focus_product', r.product.id); } catch { /* ignore */ }
                          window.location.hash = '#/inventory';
                        }}
                      ><Eye size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={needle ? 'No products match' : 'No sales in this window'}
              sub={needle
                ? 'Try a different product name or SKU.'
                : 'No completed sales in the selected window — sell at the POS or widen the window.'}
            />
          ) : null}
        </div>
        {rows.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={rows.length} label="products" />
        ) : null}
      </div>

      <div className="storage-banner section" role="note">
        <TrendingUp size={15} />
        <span>
          <strong>Ranking rules:</strong> units sold are net of returns and grouped per product across all locations
          for the chosen window (seeded demonstration history counts too). Revenue is list price × units sold, so
          line discounts are not applied — the Reports module carries full revenue views.
        </span>
      </div>
    </>
  );
}
