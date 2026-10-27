// src/pages/ReportsPage.jsx
// Trading reports over the live data + CSV export. Reports that depend on a
// date range honour the selector; point-in-time reports note it.

import { useMemo, useState } from 'react';
import {
  BarChart3, Download, Boxes, ArrowLeftRight, PackagePlus,
  PackageMinus, Truck, ShoppingCart, AlertTriangle, CalendarClock, Hourglass,
  CircleDollarSign, Award, PieChart, Info,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { REPORT_LIST, buildReport } from '../services/reportingService';
import { EmptyState, Badge, ConfirmDialog } from '../components/common/ui';
import { formatMoney } from '../utils/currency';
import { dayKey, dayKeyLabel, addDays } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const RANGES = [
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

const REPORT_ICONS = {
  Boxes, ArrowLeftRight, PackagePlus, PackageMinus, Truck, ShoppingCart,
  AlertTriangle, CalendarClock, Hourglass, CircleDollarSign, Award, PieChart,
};

/* for the money summary: one of the totals keys is money */
const MONEY_KEYS = new Set(['value', 'retail', 'gross', 'revenue', 'transitValue', 'deadValue']);

export default function ReportsPage() {
  const { state, settings, formatMoney } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [reportId, setReportId] = useState(REPORT_LIST[0].id);
  const [rangeId, setRangeId] = useState('30d');
  const [custom, setCustom] = useState({ from: dayKey(addDays(new Date(), -29)), to: dayKey(new Date()) });
  const [previewOpen, setPreviewOpen] = useState(false);

  const report = REPORT_LIST.find((r) => r.id === reportId) || REPORT_LIST[0];

  const range = useMemo(() => {
    if (rangeId === 'all') return null;
    if (rangeId === '30d') {
      const d = new Date(); d.setDate(d.getDate() - 29);
      return { from: dayKey(d), to: dayKey(new Date()) };
    }
    if (rangeId === '90d') {
      const d = new Date(); d.setDate(d.getDate() - 89);
      return { from: dayKey(d), to: dayKey(new Date()) };
    }
    return { from: custom.from, to: custom.to };
  }, [rangeId, custom]);

  const built = useMemo(() => buildReport(state, reportId, { range }), [state, reportId, range]);
  const rows = built.rows.slice(0, 300);
  const showRange = built.dateRangeSensitive;

  const exportCsv = () => {
    const full = buildReport(state, reportId, { range });
    downloadCSV(`stockflow-${reportId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report`, full.rows, full.columns);
  };

  const exportAllCsv = () => {
    /* bundle: one file per report — the browser allows a couple of rapid downloads */
    for (const r of REPORT_LIST) {
      const rep = buildReport(state, r.id, { range });
      if (rep.rows.length) downloadCSV(`stockflow-${r.id}-report`, rep.rows, rep.columns);
    }
  };

  /* (totals render inline with money handling below) */

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><BarChart3 size={21} /> Reports &amp; Analytics</h1>
          <p className="page-sub">Twelve trading reports computed live from current inventory, POS and warehouse records — preview on screen, one-click CSV for Excel.</p>
        </div>
        <div className="page-head-actions">
          <Badge color="teal">{REPORT_LIST.length} reports</Badge>
          <button className="btn btn-secondary" onClick={() => setPreviewOpen(true)}><Boxes size={15} /> Export all</button>
          <button className="btn btn-primary" onClick={exportCsv} disabled={!built.rows.length}><Download size={15} /> Export this report</button>
        </div>
      </div>

      <div className="reports-layout section" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ position: 'sticky', top: 'calc(var(--topbar-h) + 16px)' }}>
          <div className="card-head" style={{ padding: '13px 16px 4px' }}><h3>Report library</h3></div>
          <div style={{ padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {REPORT_LIST.map((r) => {
              const Icon = REPORT_ICONS[r.icon] || BarChart3;
              return (
                <button
                  key={r.id}
                  className={`reports-nav-item${reportId === r.id ? ' active' : ''}`}
                  onClick={() => setReportId(r.id)}
                >
                  <Icon size={14} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          {/* report header + range */}
          <div className="card card-pad section-bottom" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ fontSize: 16.5, fontWeight: 750 }}>{report.label}</h2>
                <p className="small-text" style={{ marginTop: 2 }}>
                  {showRange
                    ? <>Period: <strong>{range ? `${dayKeyLabel(range.from)} → ${dayKeyLabel(range.to)}` : 'all time'}</strong></>
                    : <>Current stock position — date filter not applicable to this report.</>}
                  {' '}· {built.rows.length} rows
                </p>
              </div>
              {showRange ? (
                <div className="range-filter" role="group" aria-label="Report period">
                  {RANGES.map((r) => (
                    <button key={r.id} className={rangeId === r.id ? 'active' : ''} onClick={() => setRangeId(r.id)}>{r.label}</button>
                  ))}
                </div>
              ) : null}
            </div>
            {rangeId === 'custom' && showRange ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <label className="field" style={{ maxWidth: 180 }}>
                  <input type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                </label>
                <span className="muted">to</span>
                <label className="field" style={{ maxWidth: 180 }}>
                  <input type="date" className="input" value={custom.to} min={custom.from} max={dayKey(new Date())} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                </label>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {Object.entries(built.totals || {}).map(([k, v]) => {
                if (!Number.isFinite(v)) return null;
                const money = MONEY_KEYS.has(k);
                return (
                  <span key={k} className="small-text" style={{ fontWeight: 650, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 11px' }}>
                    {k.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase())}:{' '}
                    <span style={{ color: 'var(--text)' }}>{money ? fmt(v) : v.toLocaleString()}</span>
                  </span>
                );
              })}
            </div>
            {built.note ? (
              <div className="storage-banner" style={{ background: 'var(--primary-softer)', cursor: 'help' }}>
                <Info size={15} />
                <span style={{ fontSize: 11.8 }}>{built.note}</span>
              </div>
            ) : null}
          </div>

          {/* table */}
          <div className="card">
            <div className="table-wrap">
              {rows.length ? (
                <table className="data">
                  <thead>
                    <tr>{built.columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        {built.columns.map((c) => {
                          const v = typeof c.value === 'function' ? c.value(row, i) : row[c.value];
                          const numeric = /units|qty|value|total|revenue|cost|price|level|days|rank|wac|share|orders/i.test(c.label);
                          return <td key={c.label} className={numeric ? 'cell-num' : ''}>{v === null || v === undefined || v === '' ? '—' : String(v)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  icon={reportId === 'low_stock' ? AlertTriangle : BarChart3}
                  title="No rows for this report"
                  sub="Nothing matches this report in the selected period. Try “All time” or another period."
                />
              )}
            </div>
            {built.rows.length > rows.length ? (
              <div className="pagination">
                <span className="page-info">Showing first {rows.length} of {built.rows.length} rows — the CSV export always contains every row.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => { setPreviewOpen(false); exportAllCsv(); }}
        title="Export all reports as CSV?"
        message={
          <div>
            Each report with rows will download as its own CSV file ({REPORT_LIST.length} reports max).<br />
            If your browser asks permission to download multiple files, click “Allow”.
          </div>
        }
        confirmLabel="Export all"
      />
    </>
  );
}
