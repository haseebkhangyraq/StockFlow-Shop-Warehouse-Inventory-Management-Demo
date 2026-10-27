// src/components/layout/NotifPanel.jsx
import { X, CheckCheck, Trash2, Bell, Package, PackagePlus, Truck, ShoppingCart, AlertTriangle, XCircle, CalendarClock, CalendarX2, Settings2, Undo2, PackageMinus } from 'lucide-react';
import { Modal } from '../common/ui';
import { relativeTime } from '../../utils/dates';
import { useEffect } from 'react';

const TYPE_META = {
  receipt: { Icon: PackagePlus, tone: 'green' },
  sale: { Icon: ShoppingCart, tone: 'blue' },
  low_stock: { Icon: AlertTriangle, tone: 'amber' },
  out_of_stock: { Icon: XCircle, tone: 'red' },
  near_expiry: { Icon: CalendarClock, tone: 'amber' },
  expired: { Icon: CalendarX2, tone: 'red' },
  transfer: { Icon: Truck, tone: 'violet' },
  adjustment: { Icon: Settings2, tone: 'teal' },
  issue: { Icon: PackageMinus, tone: 'amber' },
  return: { Icon: Undo2, tone: 'blue' },
};

export default function NotifPanel({ open, onClose, notifications, onMarkAll, onClear, onPick, demoNotice }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Notifications" icon={Bell} size="lg">
      {demoNotice ? (
        <div className="storage-banner" style={{ marginBottom: 12 }}>
          <CalendarX2 size={15} />
          {demoNotice}
        </div>
      ) : null}
      <div style={{ maxHeight: 'min(58vh, 520px)', overflowY: 'auto', margin: '0 -20px', padding: '0 20px' }}>
        {notifications.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 16px' }}>
            <div className="es-ic"><Bell /></div>
            <div className="empty-title">You’re all caught up</div>
            <div className="empty-sub">New alerts (low stock, expiring batches, completed operations) will appear here as they happen.</div>
          </div>
        ) : (
          notifications.map((n) => {
            const meta = TYPE_META[n.type] || { Icon: Bell, tone: 'blue' };
            return (
              <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => onPick?.(n)} role="button" tabIndex={0}>
                <div className={`n-ic ${meta.tone}`}><meta.Icon /></div>
                <div className="n-body">
                  <div className="n-title">
                    {n.title}
                    {n.isSeeded ? <span title="Seed entry">·</span> : null}
                  </div>
                  <div className="n-msg">{n.message}</div>
                  <div className="n-time">{relativeTime(n.at)}{n.isSeeded ? ' · seeded history' : ''}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="modal-foot" style={{ position: 'sticky', bottom: -20 }}>
        <button className="btn btn-secondary btn-sm" onClick={onMarkAll}><CheckCheck size={14} /> Mark all read</button>
        <button className="btn btn-ghost btn-sm" onClick={onClear}><Trash2 size={14} /> Clear all</button>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
