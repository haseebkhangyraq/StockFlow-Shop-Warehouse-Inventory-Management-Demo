// src/pages/ActivityLogPage.jsx
// Read-only audit ledger. Every engine mutation writes here automatically —
// including the seeded demonstration history, clearly labelled.

import { useMemo, useState } from 'react';
import { Activity, Download, CircleAlert, ArrowDownRight, ArrowUpRight,
  PackagePlus, PackageMinus, Truck, ShoppingCart, RefreshCw, SlidersHorizontal, XCircle,
  Package, Building2, Users, Tags, History, ClipboardList,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { EmptyState, SearchInput, Badge, Pagination } from '../components/common/ui';
import { formatDateTime, dayKey, addDays } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 40;

const ACTION_ICONS = {
  stock_receipt: PackagePlus, stock_issue: PackageMinus, sale: ShoppingCart,
  sale_return: RefreshCw, adjustment: SlidersHorizontal,
  transfer: Truck, transfer_created: Truck, transfer_dispatch: Truck, transfer_received: PackagePlus, transfer_cancelled: XCircle,
  product_created: Package, product_updated: Package, product_archived: Package, product_deleted: Package,
  category_created: Tags, category_updated: Tags, category_deleted: Tags,
  supplier_created: Building2, supplier_updated: Building2, supplier_deleted: Building2,
  customer_created: Users, customer_updated: Users, customer_deleted: Users,
  settings_updated: SlidersHorizontal, archive_note: History,
};
const ACTION_STYLES = {
  stock_receipt: { bg: 'var(--ok-soft)', color: 'var(--ok-strong)' },
  transfer_received: { bg: 'var(--ok-soft)', color: 'var(--ok-strong)' },
  stock_issue: { bg: 'var(--warn-soft)', color: 'var(--warn-strong)' },
  sale: { bg: 'var(--primary-soft)', color: 'var(--primary-strong)' },
  sale_return: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
  adjustment: { bg: 'var(--violet-soft)', color: 'var(--violet)' },
  transfer: { bg: 'var(--info-soft)', color: 'var(--info)' },
  transfer_dispatch: { bg: 'var(--info-soft)', color: 'var(--info)' },
  transfer_created: { bg: 'var(--info-soft)', color: 'var(--info)' },
  transfer_cancelled: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
  product_deleted: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
  category_deleted: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
  supplier_deleted: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
  customer_deleted: { bg: 'var(--danger-soft)', color: 'var(--danger-strong)' },
};

export default function ActivityLogPage() {
  const { state, settings } = useInventory();

  const [q, setQ] = useState('');
  const [actionF, setActionF] = useState('all');
  const [sourceF, setSourceF] = useState('all');
  const [periodF, setPeriodF] = useState('all');
  const [page, setPage] = useState(1);

  const actions = useMemo(() => {
    const set = [...new Set(state.activity.map((a) => a.action))];
    return set.sort();
  }, [state.activity]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromKey = periodF === '7d' ? dayKey(addDays(new Date(), -6)) : periodF === '30d' ? dayKey(addDays(new Date(), -29)) : null;
    return state.activity
      .filter((a) => actionF === 'all' || a.action === actionF)
      .filter((a) => sourceF === 'all' || (sourceF === 'seeded' ? !!a.isSeeded : !a.isSeeded))
      .filter((a) => {
        if (!fromKey) return true;
        return dayKey(a.at) >= fromKey;
      })
      .filter((a) => {
        if (!needle) return true;
        return (a.description || '').toLowerCase().includes(needle)
          || (a.refId || '').toLowerCase().includes(needle)
          || a.action.replace(/_/g, ' ').includes(needle);
      });
  }, [state.activity, q, actionF, sourceF, periodF]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const exportCsv = () => {
    const data = rows.map((a) => ({
      date: formatDateTime(a.at, settings.dateFormat),
      action: a.action,
      reference: a.refId || '',
      product: state.products.find((p) => p.id === a.productId)?.name || '',
      location: state.locations.find((l) => l.id === a.locationId)?.name || '',
      change: a.qtyDelta == null ? '' : (a.qtyDelta > 0 ? `+${a.qtyDelta}` : String(a.qtyDelta)),
      description: a.description || '',
      source: a.isSeeded ? 'seeded history' : 'this session',
    }));
    downloadCSV('stockflow-activity-log', data, [
      { label: 'Date', value: 'date' }, { label: 'Action', value: 'action' },
      { label: 'Reference', value: 'reference' }, { label: 'Product', value: 'product' },
      { label: 'Location', value: 'location' }, { label: 'Qty change', value: 'change' },
      { label: 'Description', value: 'description' }, { label: 'Source', value: 'source' },
    ]);
  };

  const inflow = rows.filter((r) => r.qtyDelta > 0).reduce((a, r) => a + r.qtyDelta, 0);
  const outflow = rows.filter((r) => r.qtyDelta < 0).reduce((a, r) => a - r.qtyDelta, 0);

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Activity size={21} /> Activity Log</h1>
          <p className="page-sub">A tamper-proof ledger of everything the system recorded — receipts, issues, transfers, sales, returns, adjustments and master-data edits. Records here can never be edited or deleted.</p>
        </div>
        <div className="page-head-actions">
          <div className="stat-inline">
            <Badge color="green">+{inflow.toLocaleString()} units in</Badge>
            <Badge color="red">−{outflow.toLocaleString()} units out</Badge>
            <Badge color="teal">{rows.length} events</Badge>
          </div>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search descriptions and references…" />
          <select value={actionF} onChange={(e) => { setActionF(e.target.value); setPage(1); }} aria-label="Filter by action">
            <option value="all">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={sourceF} onChange={(e) => { setSourceF(e.target.value); setPage(1); }} aria-label="Filter by source">
            <option value="all">All records</option>
            <option value="seeded">Seeded demo history</option>
            <option value="session">My session only</option>
          </select>
          <select value={periodF} onChange={(e) => { setPeriodF(e.target.value); setPage(1); }} aria-label="Filter by period">
            <option value="all">All periods</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      <div className="card section">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th style={{ width: 150 }}>When</th><th style={{ width: 150 }}>Event</th><th>What happened</th><th className="cell-num" style={{ width: 96 }}>Qty</th><th style={{ width: 120 }}>Source</th></tr>
            </thead>
            <tbody>
              {view.map((a) => {
                const Icon = ACTION_ICONS[a.action] || ClipboardList;
                const style = ACTION_STYLES[a.action] || { bg: 'var(--surface-3)', color: 'var(--muted)' };
                return (
                  <tr key={a.id}>
                    <td className="nowrap" style={{ fontSize: 11.5 }}>{formatDateTime(a.at, settings.dateFormat)}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: style.bg, color: style.color, flexShrink: 0 }}>
                          <Icon size={13} />
                        </span>
                        <span style={{ fontSize: 12.2, fontWeight: 650 }}>{a.action.replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>{a.description}</div>
                      {a.refId ? <span className="mono" style={{ fontSize: 10.5, color: 'var(--primary)' }}>{a.refId}</span> : null}
                    </td>
                    <td className="cell-num" style={{ color: a.qtyDelta > 0 ? 'var(--ok-strong)' : a.qtyDelta < 0 ? 'var(--danger-strong)' : 'var(--faint)', fontWeight: 700 }}>
                      {a.qtyDelta == null
                        ? '·'
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                            {a.qtyDelta > 0 ? <ArrowUpRight size={12} /> : a.qtyDelta < 0 ? <ArrowDownRight size={12} /> : null}
                            {a.qtyDelta > 0 ? `+${a.qtyDelta}` : a.qtyDelta === 0 ? '0' : a.qtyDelta}
                          </span>}
                    </td>
                    <td><Badge color={a.isSeeded ? 'gray' : 'green'}>{a.isSeeded ? 'seeded history' : 'this session'}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity matches"
              sub="The log records itself automatically — widen the filters to see more."
            />
          ) : null}
        </div>
        {rows.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={rows.length} label="events" />
        ) : null}
      </div>

      <div className="storage-banner" role="note">
        <CircleAlert size={15} />
        <span>This page is read-only by design: an audit trail that could be edited would not be an audit trail. Use <strong>Reports</strong> for exports or the module pages to make corrections through proper documents.</span>
      </div>
    </>
  );
}
