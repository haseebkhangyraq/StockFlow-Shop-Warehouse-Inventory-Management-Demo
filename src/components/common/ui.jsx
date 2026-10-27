// src/components/common/ui.jsx
// Reusable presentational building blocks shared by every page.

import { useEffect, useRef, useState, Fragment } from 'react';
import {
  X, AlertTriangle, Info, CheckCircle2, CircleAlert, ChevronLeft, ChevronRight,
  Search, Inbox, AlertOctagon,
} from 'lucide-react';

/* ------------------------------ Modal ------------------------------ */

export function Modal({ open, onClose, title, icon: Icon, children, footer, size = '', closeOnOverlay = true }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
        <div className="modal-head">
          <h3>{Icon ? <Icon size={17} /> : null}{title}</h3>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      icon={danger ? AlertOctagon : Info}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onConfirm?.(); }}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="small-text" style={{ fontSize: 13 }}>{message}</p>
    </Modal>
  );
}

/* ------------------------------ Badges ------------------------------ */

const COLOR_CLASSES = { green: 'badge-green', amber: 'badge-amber', red: 'badge-red', blue: 'badge-blue', gray: 'badge-gray', violet: 'badge-violet', teal: 'badge-teal' };

export function Badge({ color = 'gray', children, dot = false, icon: Icon }) {
  return (
    <span className={`badge ${COLOR_CLASSES[color] || 'badge-gray'}${dot ? ' dot-badge' : ''}`}>
      {Icon ? <Icon size={11} /> : null}
      {children}
    </span>
  );
}

/* ------------------------------ Fields ------------------------------ */

export function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label ? (
        <label className="field-label">
          {label}{required ? <span className="req">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ invalid, ...props }) {
  return <input className={`input${invalid ? ' invalid' : ''}`} {...props} />;
}

export function Select({ invalid, children, ...props }) {
  return <select className={`select${invalid ? ' invalid' : ''}`} {...props}>{children}</select>;
}

export function TextArea({ invalid, ...props }) {
  return <textarea className={`textarea${invalid ? ' invalid' : ''}`} {...props} />;
}

export function Switch({ checked, onChange, label, sub }) {
  return (
    <label className="checkbox-row" style={{ cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}>
      <span className="switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} />
        <span className="track" />
      </span>
      <span>
        {label ? <span className="checkbox-label-text">{label}</span> : null}
        {sub ? <span className="checkbox-sub">{sub}</span> : null}
      </span>
    </label>
  );
}

/* ------------------------------ Stat card ------------------------------ */

export function StatCard({ label, value, sub, icon: Icon, tone = 'blue', alert = false }) {
  return (
    <div className={`stat-card${alert ? ' stat-alert' : ''}`}>
      <div className="stat-top">
        <div className={`stat-ic ${tone}`}><Icon /></div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value" title={String(value)}>{value}</div>
      {sub ? <div className="stat-foot">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------ Empty state ------------------------------ */

export function EmptyState({ icon: Icon = Inbox, title, sub, children }) {
  return (
    <div className="empty-state">
      <div className="es-ic"><Icon /></div>
      <div className="empty-title">{title}</div>
      {sub ? <div className="empty-sub">{sub}</div> : null}
      {children}
    </div>
  );
}

/* ------------------------------ Pagination ------------------------------ */

export function Pagination({ page, pages, onPage, total, label = 'items' }) {
  if (pages <= 1 && !total) return null;
  const nums = [];
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) nums.push(i);
  return (
    <div className="pagination">
      <span className="page-info">{total != null ? `${total} ${label}` : `Page ${page} of ${pages}`}</span>
      <button className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
      {nums.map((n) => (
        <button key={n} className={`page-btn${n === page ? ' active' : ''}`} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
    </div>
  );
}

/* ------------------------------ Sortable table helper ------------------------------ */

export function useTableSort(rows, initialKey, initialDir = 'asc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [dir, setDir] = useState(initialDir);
  const toggle = (key) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setDir('asc'); }
  };
  const sorted = [...rows].sort((a, b) => {
    const av = typeof sortKey === 'function' ? sortKey(a) : a[sortKey];
    const bv = typeof sortKey === 'function' ? sortKey(b) : b[sortKey];
    const res = av == null ? -1 : bv == null ? 1 : typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv, undefined, { numeric: true }) : av - bv;
    return dir === 'asc' ? res : -res;
  });
  return { sorted, toggle, sortKey, dir };
}

export function SortTh({ label, active, dir, onClick, numeric = false, className = '' }) {
  return (
    <th
      className={`sortable ${numeric ? 'cell-num' : ''} ${className}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span className="sort-ic">{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </th>
  );
}

/* ------------------------------ Money/Q text cell ------------------------------ */

export function QtyText({ value }) {
  return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{value}</span>;
}

/* ------------------------------ Tooltip-ish helper for charts ------------------------------ */

export function ChartTooltip({ active, payload, label, fmtMoney, fmtLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{fmtLabel ? fmtLabel(label) : label}</div>
      {payload.map((p, i) => (
        <div className="tt-row" key={i}>
          <span className="tt-dot" style={{ background: p.color || p.fill || 'var(--primary)' }} />
          <span>{p.name}</span>
          <span className="tt-val">{fmtMoney ? fmtMoney(p.value * 100) : p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ useClickOutside ------------------------------ */

export function useClickOutside(handler) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [handler]);
  return ref;
}

/* ------------------------------ Toasts (rendered in layout) ------------------------------ */

const TOAST_META = {
  success: { cls: 'success', Icon: CheckCircle2 },
  error: { cls: 'error', Icon: CircleAlert },
  warning: { cls: 'warning', Icon: AlertTriangle },
  info: { cls: 'info', Icon: Info },
};

export function ToastHost({ toasts, dismiss }) {
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => {
        const meta = TOAST_META[t.kind] || TOAST_META.info;
        const Icon = meta.Icon;
        return (
          <div key={t.id} className={`toast ${meta.cls}`}>
            <div className="toast-ic"><Icon /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="toast-title">{t.title}</div>
              {t.message ? <div className="toast-msg">{t.message}</div> : null}
            </div>
            <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Search input for toolbars ------------------------------ */

export function SearchInput({ value, onChange, placeholder = 'Search…', style }) {
  return (
    <div className="search" style={style}>
      <Search size={15} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

export { Fragment };
