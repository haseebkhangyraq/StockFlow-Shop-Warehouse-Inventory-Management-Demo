// src/components/layout/Topbar.jsx
import { useState, useMemo } from 'react';
import { Search, Bell, Sun, Moon, Package, Tag, ShoppingBag, ChevronDown, LogOut, Settings2, Menu, Database } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useClickOutside } from '../common/ui';
import * as engine from '../../services/inventoryEngine';
import { formatMoney } from '../../utils/currency';
import { sellableQty } from '../../services/inventoryEngine';

function GlobalSearch({ navigate }) {
  const { state } = useInventory();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  const products = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return state.products
      .filter((p) => p.status === 'active' && (
        p.name.toLowerCase().includes(needle)
        || p.sku.toLowerCase().includes(needle)
        || (p.barcode || '').toLowerCase().includes(needle)
      ))
      .slice(0, 7);
  }, [q, state.products]);

  const onPick = (id) => {
    setOpen(false);
    setQ('');
    navigate('/inventory');
    // notify the Inventory page which product to open
    try { sessionStorage.setItem('sf_focus_product', id); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('sf:focus-product', { detail: id }));
  };

  return (
    <div className="global-search" ref={ref}>
      <Search size={15} className="search-ic" />
      <input
        placeholder="Search products, SKUs, barcodes…"
        value={q}
        aria-label="Global product search"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && q.trim() ? (
        <div className="search-results">
          {products.length === 0 ? (
            <div className="search-empty">No products match “{q}”.</div>
          ) : (
            <>
              <div className="search-cat-label">Products</div>
              {products.map((p) => {
                const shopQty = sellableQty(state, p.id, 'loc_shop1');
                return (
                  <button key={p.id} className="search-result-item" onClick={() => onPick(p.id)}>
                    <span className="sku">{p.sku}</span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {formatMoney(p.sellPrice, state.settings.currency)} · shop {shopQty}
                    </span>
                  </button>
                );
              })}
            </>
          )}
          <div className="search-cat-label">Navigate</div>
          {[
            ['/warehouse', 'Open Warehouse module', Package],
            ['/inventory', 'Full inventory report', Tag],
            ['/pos', 'Open Point of Sale', ShoppingBag],
          ].map(([path, label, Icon]) => (
            <button key={path} className="search-result-item" onClick={() => { setOpen(false); setQ(''); navigate(path); }}>
              <Icon size={15} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 12.6, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileMenu({ navigate }) {
  const { state, perform, pushToast } = useInventory();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const dark = state.settings.theme === 'dark';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
        style={{ width: 'auto', padding: '0 9px', gap: 6, display: 'flex' }}
      >
        <span className="avatar" style={{ width: 26, height: 26, fontSize: 10.5 }}>DO</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <div className="search-results" style={{ left: 'auto', right: 0, width: 262, top: 'calc(100% + 8px)' }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Demo Operator</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{state.settings.storeName}</div>
          </div>
          <button className="search-result-item" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <Settings2 size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12.7, fontWeight: 600 }}>Settings & demo data</span>
          </button>
          <button
            className="search-result-item"
            onClick={() => { setOpen(false); perform(engine.updateSettings, { theme: dark ? 'light' : 'dark' }); }}
          >
            {dark ? <Sun size={15} style={{ color: 'var(--primary)' }} /> : <Moon size={15} style={{ color: 'var(--primary)' }} />}
            <span style={{ fontSize: 12.7, fontWeight: 600 }}>{dark ? 'Switch to light theme' : 'Switch to dark theme'}</span>
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button
            className="search-result-item"
            onClick={() => { setOpen(false); pushToast('info', 'Demo session', 'Sign-out is disabled in this public demo — no accounts are required.'); }}
          >
            <LogOut size={15} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 12.7, fontWeight: 600, color: 'var(--muted)' }}>Sign out (disabled in demo)</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Topbar({ pageLabel, navigate, onOpenNotifications, unreadCount, onOpenMobileNav }) {
  const { state, perform } = useInventory();
  const dark = state.settings.theme === 'dark';

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onOpenMobileNav} aria-label="Open navigation menu" style={{ display: 'grid' }}>
        <Menu size={17} />
      </button>
      <div className="topbar-title">{pageLabel}</div>
      <GlobalSearch navigate={navigate} />
      <div className="topbar-right">
        <button className="icon-btn" onClick={() => perform(engine.updateSettings, { theme: dark ? 'light' : 'dark' })} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="icon-btn" onClick={onOpenNotifications} aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`} title="Notifications">
          <Bell size={16} />
          {unreadCount > 0 ? <span className="dot" /> : null}
        </button>
        <span className="demo-chip" title="This demonstration stores all data locally in your browser.">
          <Database size={11} /> DEMO
        </span>
        <ProfileMenu navigate={navigate} />
      </div>
    </header>
  );
}
