// src/pages/InventoryPage.jsx
// Multi-location stock overview. Reads exclusively from the inventory engine
// selectors so on-hand / reserved / available / in-transit always reconcile.

import { useEffect, useMemo, useState } from 'react';
import {
  Boxes, Warehouse as WarehouseIcon, Eye, Download, CircleDollarSign, TrendingUp,
  Truck, Layers, Store,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import ProductDetail from '../components/warehouse/ProductDetail';
import {
  EmptyState, Pagination, SearchInput, useTableSort, SortTh, Badge,
} from '../components/common/ui';
import { StockBadge, ExpiryBadge } from '../components/common/status';
import {
  activeProducts, onHand, available, reserved, sellableQty, inTransit,
  stockStatus, expiryStatus, calculateInventoryValue, totalOnHand,
} from '../services/inventoryEngine';
import { formatMoney } from '../utils/currency';
import { relativeTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 12;
const LOC_ICON = { warehouse: WarehouseIcon, shop: Store };

export default function InventoryPage() {
  const { state, settings, formatMoney } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [locF, setLocF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const [focusId, setFocusId] = useState(null);

  /* deep-link focus: another module can set sessionStorage 'sf_focus_product'
     before navigating here — we consume it and open the product drawer */
  useEffect(() => {
    const consume = () => {
      let pid = null;
      try { pid = sessionStorage.getItem('sf_focus_product'); } catch { /* ignore */ }
      if (pid) {
        try { sessionStorage.removeItem('sf_focus_product'); } catch { /* ignore */ }
        setFocusId(pid);
        setDetailId(pid);
      }
    };
    consume();
    window.addEventListener('sf:navigated', consume);
    return () => window.removeEventListener('sf:navigated', consume);
  }, []);

  const valuation = useMemo(() => calculateInventoryValue(state), [state]);

  const locSummaries = useMemo(() => state.locations.map((l) => {
    let units = 0, value = 0, retail = 0, skus = 0;
    for (const p of activeProducts(state)) {
      const q = onHand(state, p.id, l.id);
      if (q > 0) {
        units += q; value += q * p.costPrice; retail += q * p.sellPrice; skus += 1;
      }
    }
    return { location: l, units, value, retail, skus };
  }), [state]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activeProducts(state)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle))
      .filter((p) => cat === 'all' || p.categoryId === cat)
      .filter((p) => {
        if (statusF === 'all') return true;
        if (locF === 'all') return stockStatus(state, p.id) === statusF;
        return stockStatus(state, p.id, locF) === statusF;
      })
      .filter((p) => {
        if (!onlyAlerts) return true;
        if (locF === 'all') return ['low', 'out'].includes(stockStatus(state, p.id));
        return available(state, p.id, locF) <= state.products.find((x) => x.id === p.id)?.reorderLevel;
      })
      .map((p) => {
        const perLoc = Object.fromEntries(state.locations.map((l) => [l.id, {
          onHand: onHand(state, p.id, l.id),
          reserved: reserved(state, p.id, l.id),
          available: available(state, p.id, l.id),
          sellable: sellableQty(state, p.id, l.id),
          status: stockStatus(state, p.id, l.id),
        }]));
        const sellableTotal = state.locations.reduce((a, l) => a + perLoc[l.id].sellable, 0);
        const expiredUnits = p.trackExpiry
          ? state.locations.reduce((a, l) => a + Math.max(0, perLoc[l.id].onHand - perLoc[l.id].sellable), 0)
          : 0;
        const units = totalOnHand(state, p.id);
        return {
          ...p,
          categoryName: state.categories.find((c) => c.id === p.categoryId)?.name || '—',
          perLoc, units, sellableTotal, expiredUnits,
          reservedTotal: state.locations.reduce((a, l) => a + perLoc[l.id].reserved, 0),
          availTotal: state.locations.reduce((a, l) => a + perLoc[l.id].available, 0),
          transit: inTransit(state, p.id),
          status: units === 0 ? 'out' : stockStatus(state, p.id),
          expiry: expiryStatus(state, p.id),
          value: units * p.costPrice,
          retail: units * p.sellPrice,
        };
      });
  }, [state, q, cat, locF, statusF, onlyAlerts]);

  const { sorted, toggle, sortKey, dir } = useTableSort(rows, 'name', 'asc');
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const exportCsv = () => {
    if (locF === 'all') {
      downloadCSV('stockflow-inventory-all-locations', rows, [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'name' },
        { label: 'Category', value: 'categoryName' }, { label: 'Unit', value: 'unit' },
        ...state.locations.flatMap((l) => ([
          { label: `${l.name} on hand`, value: (r) => r.perLoc[l.id].onHand },
          { label: `${l.name} available`, value: (r) => r.perLoc[l.id].available },
        ])),
        { label: 'Units on hand', value: (r) => r.units },
        { label: 'Available', value: (r) => r.availTotal },
        { label: 'Reserved', value: (r) => r.reservedTotal },
        { label: 'In transit', value: (r) => r.transit },
        { label: 'Sellable (non-expired)', value: (r) => r.sellableTotal },
        { label: 'Expired on hand', value: (r) => r.expiredUnits },
        { label: `Stock value (${cur})`, value: (r) => (r.value / 100).toFixed(2) },
        { label: `Retail value (${cur})`, value: (r) => (r.retail / 100).toFixed(2) },
        { label: 'Status', value: (r) => r.status },
        { label: 'Expiry', value: (r) => r.expiry },
      ]);
    } else {
      const l = state.locations.find((x) => x.id === locF);
      downloadCSV(`stockflow-inventory-${(l?.name || 'location').toLowerCase().replace(/\s+/g, '-')}`, rows, [
        { label: 'SKU', value: 'sku' }, { label: 'Product', value: 'name' },
        { label: 'Category', value: 'categoryName' }, { label: 'Unit', value: 'unit' },
        { label: 'On hand', value: (r) => r.perLoc[locF].onHand },
        { label: 'Reserved', value: (r) => r.perLoc[locF].reserved },
        { label: 'Available', value: (r) => r.perLoc[locF].available },
        { label: 'Sellable (non-expired)', value: (r) => r.perLoc[locF].sellable },
        { label: 'Expired on hand', value: (r) => r.expiredUnits },
        { label: 'Reorder level', value: 'reorderLevel' },
        { label: `Stock value (${cur})`, value: (r) => (r.perLoc[locF].onHand * r.costPrice / 100).toFixed(2) },
        { label: 'Status', value: (r) => r.perLoc[locF].status },
        { label: 'Expiry', value: (r) => r.expiry },
      ]);
    }
  };

  const stat = [
    { label: 'Units on hand', value: valuation.units.toLocaleString(), icon: Boxes, tone: 'teal', sub: 'across every location' },
    { label: 'Inventory value (WAC)', value: formatMoney(valuation.costValue - valuation.transitValue, cur), icon: CircleDollarSign, tone: 'violet', sub: 'batch records, weighted average cost' },
    { label: 'Retail value', value: formatMoney(valuation.retailValue, cur), icon: TrendingUp, tone: 'green', sub: 'if sold at current prices' },
    { label: 'In transit', value: `${valuation.transitUnits.toLocaleString()} units`, icon: Truck, tone: 'blue', alert: valuation.transitUnits > 0, sub: 'dispatched, not yet received anywhere' },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Layers size={21} /> Inventory</h1>
          <p className="page-sub">One live view of stock across the warehouse and shops — on-hand, reserved for transfers, truly available, and in-transit (counted at neither location).</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="teal">{sorted.length} SKUs</Badge>
            <Badge color="blue">{formatMoney(valuation.costValue, cur)} total</Badge>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
        </div>      </div>

      <div className="stat-grid section">
        {stat.map((c) => (
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

      {/* location summary */}
      <div className="grid-3 section">
        {locSummaries.map((s) => {
          const Icon = LOC_ICON[s.location.type] || WarehouseIcon;
          return (
            <button
              key={s.location.id}
              className={`card card-pad loc-tile${locF === s.location.id ? ' active' : ''}`}
              style={{ textAlign: 'left', cursor: 'pointer', border: locF === s.location.id ? '1.5px solid var(--primary)' : undefined }}
              onClick={() => { setLocF(locF === s.location.id ? 'all' : s.location.id); setPage(1); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span className="stat-ic blue" style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}><Icon size={15} /></span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.location.name}</div>
                  <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.location.type}</div>
                </div>
                {locF === s.location.id ? <Badge color="blue">filtered</Badge> : null}
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div><div className="detail-label">Units</div><div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.units.toLocaleString()}</div></div>
                <div><div className="detail-label">SKUs stocked</div><div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{s.skus}</div></div>
                <div><div className="detail-label">Stock value</div><div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.value)}</div></div>
                <div><div className="detail-label">Retail</div><div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.retail)}</div></div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput
            value={q}
            onChange={(v) => { setQ(v); setPage(1); }}
            placeholder="Search by product name or SKU…"
          />
          <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}>
            <option value="all">All categories</option>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={locF} onChange={(e) => { setLocF(e.target.value); setPage(1); }}>
            <option value="all">All locations</option>
            {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }}>
            <option value="all">All stock states</option>
            <option value="in_stock">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="overstocked">Overstocked</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={() => { setOnlyAlerts((v) => !v); setPage(1); }}>
          {onlyAlerts ? 'Showing alerting SKUs only' : 'Alerting SKUs only'}
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          {locF === 'all' ? (
            <table className="data">
              <thead>
                <tr>
                  <SortTh label="Product" onClick={() => toggle('name')} active={sortKey === 'name'} dir={dir} />
                  <th>Category</th>
                  {state.locations.map((l) => <th key={l.id} className="cell-num" title={l.name}>{shortLoc(l)}</th>)}
                  <SortTh label="On hand" onClick={() => toggle('units')} active={sortKey === 'units'} dir={dir} numeric />
                  <SortTh label="Reserved" onClick={() => toggle('reservedTotal')} active={sortKey === 'reservedTotal'} dir={dir} numeric />
                  <SortTh label="In transit" onClick={() => toggle('transit')} active={sortKey === 'transit'} dir={dir} numeric />
                  <SortTh label="Sellable" onClick={() => toggle('sellableTotal')} active={sortKey === 'sellableTotal'} dir={dir} numeric />
                  <th>Status</th>
                  <th>Expiry</th>
                  <SortTh label="Value" onClick={() => toggle('value')} active={sortKey === 'value'} dir={dir} numeric />
                  <th>Last move</th>
                  <th style={{ width: 46 }} />
                </tr>
              </thead>
              <tbody>
                {view.map((p) => (
                  <tr key={p.id} style={focusId === p.id ? { background: 'var(--primary-soft)' } : undefined}>
                    <td>
                      <button className="link row-title" onClick={() => setDetailId(p.id)}>{p.name}</button>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>{p.sku}</div>
                    </td>
                    <td>{p.categoryName}</td>
                    {state.locations.map((l) => (
                      <td key={l.id} className="cell-num" style={p.perLoc[l.id].status === 'out' && p.perLoc[l.id].onHand === 0 ? { color: 'var(--danger-strong)', fontWeight: 700 } : p.perLoc[l.id].status === 'low' ? { color: 'var(--warn-strong)', fontWeight: 700 } : undefined}>
                        {p.perLoc[l.id].onHand}
                      </td>
                    ))}
                    <td className="cell-num cell-strong">{p.units}</td>
                    <td className="cell-num">{p.reservedTotal > 0 ? p.reservedTotal : '—'}</td>
                    <td className="cell-num">{p.transit > 0 ? p.transit : '—'}</td>
                    <td className="cell-num">
                      {p.sellableTotal}
                      {p.expiredUnits > 0 ? <div style={{ fontSize: 10, color: 'var(--danger-strong)' }}>{p.expiredUnits} expired</div> : null}
                    </td>
                    <td><StockBadge status={p.status} /></td>
                    <td>{p.trackExpiry ? <ExpiryBadge status={p.expiry} /> : <span className="muted" style={{ fontSize: 11 }}>n/a</span>}</td>
                    <td className="cell-num">{fmt(p.value)}</td>
                    <td className="nowrap" style={{ fontSize: 10.8, color: 'var(--muted)' }}>{relativeTime(p.lastMovementAt)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View product" onClick={() => setDetailId(p.id)}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <SortTh label="Product" onClick={() => toggle('name')} active={sortKey === 'name'} dir={dir} />
                  <th>Category</th>
                  <SortTh label="On hand" onClick={() => toggle('units')} active={sortKey === 'units'} dir={dir} numeric />
                  <SortTh label="Reserved" onClick={() => toggle('reservedTotal')} active={sortKey === 'reservedTotal'} dir={dir} numeric />
                  <SortTh label="Available" onClick={() => toggle('availTotal')} active={sortKey === 'availTotal'} dir={dir} numeric />
                  <SortTh label="Sellable" onClick={() => toggle('sellableTotal')} active={sortKey === 'sellableTotal'} dir={dir} numeric />
                  <th>Expired here</th>
                  <th>Status here</th>
                  <th>Reorder at</th>
                  <th>Value here</th>
                  <th style={{ width: 46 }} />
                </tr>
              </thead>
              <tbody>
                {view.map((p) => (
                  <tr key={p.id} style={focusId === p.id ? { background: 'var(--primary-soft)' } : undefined}>
                    <td>
                      <button className="link row-title" onClick={() => setDetailId(p.id)}>{p.name}</button>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>{p.sku}</div>
                    </td>
                    <td>{p.categoryName}</td>
                    <td className="cell-num cell-strong">{p.perLoc[locF].onHand} {p.unit}</td>
                    <td className="cell-num">{p.perLoc[locF].reserved > 0 ? p.perLoc[locF].reserved : '—'}</td>
                    <td className="cell-num">{p.perLoc[locF].available}</td>
                    <td className="cell-num">{p.perLoc[locF].sellable}{p.expiredUnits > 0 ? <div style={{ fontSize: 10, color: 'var(--danger-strong)' }}>{p.expiredUnits} expired</div> : null}</td>
                    <td className="cell-num" style={p.expiredUnits > 0 ? { color: 'var(--danger-strong)' } : undefined}>{p.expiredUnits || '—'}</td>
                    <td><StockBadge status={p.perLoc[locF].status} /></td>
                    <td className="cell-num">{p.reorderLevel}</td>
                    <td className="cell-num">{fmt(p.perLoc[locF].onHand * p.costPrice)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View product" onClick={() => setDetailId(p.id)}><Eye size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {view.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No products match"
              sub="Try clearing the filters or a different location."
            />
          ) : null}
        </div>
        {sorted.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={sorted.length} label="SKUs" />
        ) : null}
      </div>

      {detailId ? (
        <ProductDetail
          productId={detailId}
          onClose={() => { setDetailId(null); setFocusId(null); }}
          onEdit={() => { const pid = detailId; setDetailId(null); sessionStorage.setItem('sf_focus_product', pid); window.location.hash = '#/warehouse'; }}
          onReceive={(p) => { sessionStorage.setItem('sf_receive_preset', p.id); window.location.hash = '#/receiving'; }}
        />
      ) : null}
    </>
  );
}

function shortLoc(l) {
  const words = l.name.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 10);
  return words.slice(0, 2).map((w) => w.slice(0, 6)).join(' ');
}
