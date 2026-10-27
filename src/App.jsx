// src/App.jsx
// Application shell: wraps every page in the InventoryProvider and renders the
// page matching the current hash route (#/dashboard …). Unknown routes fall
// back to the dashboard.

import { useEffect } from 'react';
import { InventoryProvider } from './context/InventoryContext';
import { useHashRoute } from './hooks/useHashRoute';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import WarehousePage from './pages/WarehousePage';
import InventoryPage from './pages/InventoryPage';
import ReceivingPage from './pages/ReceivingPage';
import IssuancePage from './pages/IssuancePage';
import TransfersPage from './pages/TransfersPage';
import POSPage from './pages/POSPage';
import SalesHistoryPage from './pages/SalesHistoryPage';
import SuppliersPage from './pages/SuppliersPage';
import CustomersPage from './pages/CustomersPage';
import CategoriesPage from './pages/CategoriesPage';
import ExpiryPage from './pages/ExpiryPage';
import TopSellingPage from './pages/TopSellingPage';
import ReportsPage from './pages/ReportsPage';
import ActivityLogPage from './pages/ActivityLogPage';
import SettingsPage from './pages/SettingsPage';

const PAGES = {
  '/dashboard': DashboardPage,
  '/warehouse': WarehousePage,
  '/inventory': InventoryPage,
  '/receiving': ReceivingPage,
  '/issuance': IssuancePage,
  '/transfers': TransfersPage,
  '/pos': POSPage,
  '/sales': SalesHistoryPage,
  '/suppliers': SuppliersPage,
  '/customers': CustomersPage,
  '/categories': CategoriesPage,
  '/expiry': ExpiryPage,
  '/top-selling': TopSellingPage,
  '/reports': ReportsPage,
  '/activity': ActivityLogPage,
  '/settings': SettingsPage,
};

function Router() {
  const { path, navigate } = useHashRoute();

  /* announce navigation so modules can run follow-up side effects */
  useEffect(() => {
    window.dispatchEvent(new Event('sf:navigated'));
  }, [path]);

  const Page = PAGES[path] || DashboardPage;
  return (
    <AppLayout path={path} navigate={navigate}>
      <Page key={path} navigate={navigate} />
    </AppLayout>
  );
}

export default function App() {
  return (
    <InventoryProvider>
      <Router />
    </InventoryProvider>
  );
}
