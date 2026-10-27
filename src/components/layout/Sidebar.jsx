// src/components/layout/Sidebar.jsx
import {
  LayoutDashboard, Warehouse, Boxes, PackagePlus, PackageMinus, Truck, ShoppingCart,
  History, Building2, Users, Tags, CalendarClock, BarChart3, Activity, Settings,
  PanelLeftClose, Sparkles, TrendingUp,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard }],
  },
  {
    title: 'Warehouse Operations',
    items: [
      { path: '/warehouse', label: 'Warehouse', Icon: Warehouse },
      { path: '/receiving', label: 'Stock Receiving', Icon: PackagePlus },
      { path: '/issuance', label: 'Stock Issuance', Icon: PackageMinus },
      { path: '/transfers', label: 'Stock Transfers', Icon: Truck, badgeKey: 'transfers' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { path: '/pos', label: 'Point of Sale', Icon: ShoppingCart },
      { path: '/sales', label: 'Sales History', Icon: History },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { path: '/inventory', label: 'Inventory', Icon: Boxes },
      { path: '/expiry', label: 'Expiry Management', Icon: CalendarClock, badgeKey: 'expiry' },
      { path: '/top-selling', label: 'Top Selling Products', Icon: TrendingUp },
      { path: '/categories', label: 'Product Categories', Icon: Tags },
    ],
  },
  {
    title: 'Directory',
    items: [
      { path: '/suppliers', label: 'Suppliers', Icon: Building2 },
      { path: '/customers', label: 'Customers', Icon: Users },
    ],
  },
  {
    title: 'Insights',
    items: [
      { path: '/reports', label: 'Reports & Analytics', Icon: BarChart3 },
      { path: '/activity', label: 'Activity Log', Icon: Activity },
    ],
  },
  {
    title: 'System',
    items: [{ path: '/settings', label: 'Settings', Icon: Settings }],
  },
];

export default function Sidebar({ path, navigate, collapsed, onToggle, badges }) {
  return (
    <aside className={`sidebar${collapsed ? ' nav-collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Boxes size={19} />
        </div>
        <div>
          <div className="brand-name">StockFlow</div>
          <div className="brand-sub">Inventory Suite</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map(({ path: itemPath, label, Icon, badgeKey }) => (
              <button
                key={itemPath}
                className={`nav-item${path === itemPath ? ' active' : ''}`}
                onClick={() => navigate(itemPath)}
                title={collapsed ? label : undefined}
                aria-current={path === itemPath ? 'page' : undefined}
              >
                <Icon />
                <span className="nav-item-label">{label}</span>
                {badgeKey && badges?.[badgeKey] ? <span className="nav-badge">{badges[badgeKey]}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="demo-pill">
          <Sparkles size={13} />
          DEMO MODE
        </div>
        <div className="sidebar-user">
          <div className="avatar">DO</div>
          <div>
            <div className="sidebar-user-name">Demo Operator</div>
            <div className="sidebar-user-role">Store Manager</div>
          </div>
        </div>
        <button className="collapse-btn" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <PanelLeftClose size={14} style={{ display: collapsed ? 'none' : undefined }} />
          <span className="nav-item-label">{collapsed ? 'Expand' : 'Collapse menu'}</span>
        </button>
      </div>
    </aside>
  );
}
