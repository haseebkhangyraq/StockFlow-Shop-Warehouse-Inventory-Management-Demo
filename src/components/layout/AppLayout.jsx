// src/components/layout/AppLayout.jsx
import { useMemo, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import NotifPanel from './NotifPanel';
import { ToastHost } from '../common/ui';
import { useInventory } from '../../context/InventoryContext';
import { ROUTES } from '../../hooks/useHashRoute';
import { getExpiryAlerts } from '../../services/inventoryEngine';
import { TriangleAlert, HardDriveDownload } from 'lucide-react';

export default function AppLayout({ path, navigate, children }) {
  const { state, toasts, dismissToast, unreadCount, applyResult, persistence, restoredNotice, dismissRestoredNotice } = useInventory();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const pageLabel = useMemo(() => {
    const r = ROUTES.find((x) => x.path === path);
    return r ? r.label : 'StockFlow';
  }, [path]);

  // close mobile nav on navigation
  useEffect(() => { setMobileNav(false); }, [path]);

  const expiry = useMemo(() => getExpiryAlerts(state), [state]);
  const badges = useMemo(() => ({
    transfers: state.transfers.filter((t) => t.status === 'pending' || t.status === 'in_transit').length,
    expiry: expiry.expired.length + expiry.expiringToday.length + expiry.expiringSoon.length,
  }), [state.transfers, expiry]);

  const markAll = () => applyResult(engineMarkAllRead(state));
  const clearAll = () => applyResult(engineClearNotifs(state));

  return (
    <div className="app">
      {/* desktop sidebar */}
      <div style={{ display: collapsed ? 'block' : undefined, position: 'relative' }} className="desktop-sidebar">
        <Sidebar path={path} navigate={navigate} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} badges={badges} />
      </div>

      {/* mobile nav drawer */}
      {mobileNav ? (
        <>
          <div className="drawer-overlay" onClick={() => setMobileNav(false)} />
          <div
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: 270, zIndex: 86,
              boxShadow: 'var(--shadow-lg)',
            }}
            aria-label="Mobile navigation"
          >
            <Sidebar path={path} navigate={navigate} collapsed={false} onToggle={() => setMobileNav(false)} badges={badges} />
          </div>
        </>
      ) : null}

      <div className="app-main">
        <Topbar
          pageLabel={pageLabel}
          navigate={navigate}
          onOpenNotifications={() => setNotifOpen(true)}
          unreadCount={unreadCount}
          onOpenMobileNav={() => setMobileNav(true)}
        />

        <main className="app-content page-enter" id="page-content">
          {restoredNotice === 'corrupt' ? (
            <div className="storage-banner">
              <TriangleAlert size={15} />
              <span>Saved demo data looked damaged, so the original sample dataset was restored.</span>
              <button className="btn btn-ghost btn-sm" onClick={dismissRestoredNotice} style={{ marginLeft: 'auto' }}>Dismiss</button>
            </div>
          ) : null}
          {persistence === 'unavailable' ? (
            <div className="storage-banner">
              <HardDriveDownload size={15} />
              <span>Browser storage is unavailable — the demo runs with sample data for this session only and keeps everything in memory.</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <NotifPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={state.notifications}
        onMarkAll={markAll}
        onClear={clearAll}
        demoNotice={!state.notifications.length ? 'Tip: alerts and results of your demo actions will appear here. All data lives in your browser only.' : null}
      />

      <ToastHost toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

/* local engine bridges (kept tiny to avoid circular imports) */
function engineMarkAllRead(s) {
  return { ok: true, state: { ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }, message: 'All notifications marked as read.' };
}
function engineClearNotifs(s) {
  return { ok: true, state: { ...s, notifications: [] }, message: 'Notifications cleared.' };
}
