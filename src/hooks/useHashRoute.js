// src/hooks/useHashRoute.js
// Lightweight hash-based router — no external dependency, and every deep link
// works on Vercel without server rewrites (hash is client-side only).

import { useCallback, useEffect, useState } from 'react';

export const ROUTES = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/warehouse', label: 'Warehouse' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/receiving', label: 'Stock Receiving' },
  { path: '/issuance', label: 'Stock Issuance' },
  { path: '/transfers', label: 'Stock Transfers' },
  { path: '/pos', label: 'Point of Sale' },
  { path: '/sales', label: 'Sales History' },
  { path: '/suppliers', label: 'Suppliers' },
  { path: '/customers', label: 'Customers' },
  { path: '/categories', label: 'Product Categories' },
  { path: '/expiry', label: 'Expiry Management' },
  { path: '/top-selling', label: 'Top Selling Products' },
  { path: '/reports', label: 'Reports & Analytics' },
  { path: '/activity', label: 'Activity Log' },
  { path: '/settings', label: 'Settings' },
];

function currentPath() {
  const h = window.location.hash || '#/dashboard';
  const p = h.replace(/^#/, '').split('?')[0];
  return p.startsWith('/') ? p : '/dashboard';
}

export function useHashRoute() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.location.replace('#/dashboard');
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to) => {
    const next = to.startsWith('/') ? to : `/${to}`;
    if (currentPath() === next) {
      setPath(next);
      return;
    }
    window.location.hash = `#${next}`;
  }, []);

  return { path, navigate };
}
