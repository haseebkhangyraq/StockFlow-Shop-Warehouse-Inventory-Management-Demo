// src/context/InventoryContext.jsx
// React context wiring the app to the inventory engine + persistence service.
// Every mutation goes through `perform()` which runs an engine action, commits
// the new state, saves to localStorage and surfaces a toast.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as engine from '../services/inventoryEngine';
import { loadState, saveState, storageAvailable, resetState as storageReset } from '../services/persistenceService';
import { formatMoney } from '../utils/currency';

const InventoryContext = createContext(null);

/* ---------------- toasts ---------------- */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind, title, message) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-4), { id, kind, title, message }]);
    setTimeout(() => dismiss(id), 4600);
  }, [dismiss]);
  return { toasts, push, dismiss };
}

export function InventoryProvider({ children }) {
  const initial = useMemo(() => loadState(), []);
  const [state, setState] = useState(initial.state);
  const [persistence, setPersistence] = useState(initial.persistence); // 'ok' | 'unavailable'
  const [restoredNotice, setRestoredNotice] = useState(initial.restored); // false | 'corrupt'
  const { toasts, push, dismiss } = useToasts();
  const stateRef = useRef(state);
  stateRef.current = state;

  /* apply an engine action result */
  const applyResult = useCallback((result, { successMsg = null } = {}) => {
    if (result && result.ok) {
      const { message, state: nextState, ...extra } = result;
      setState(nextState);
      const saveStatus = saveState(nextState);
      setPersistence(saveStatus === 'unavailable' ? 'unavailable' : 'ok');
      if (saveStatus === 'error') {
        push('warning', 'Storage limit reached', 'Changes are shown but could not be saved locally. Reset the demo to restore sample data.');
      }
      push('success', successMsg || 'Saved', message);
      return { ok: true, ...extra, message };
    }
    push('error', 'Action failed', result?.error || 'Something went wrong.');
    return { ok: false, error: result?.error, fieldErrors: result?.fieldErrors ?? null };
  }, [push]);

  /** Run an engine mutation: perform(engine.createProduct, payload) */
  const perform = useCallback((action, ...args) => {
    try {
      const result = action(stateRef.current, ...args);
      return applyResult(result);
    } catch (e) {
      // safety net: never crash the app on a logic error
      push('error', 'Unexpected error', e?.message || 'Operation failed.');
      return { ok: false, error: e?.message };
    }
  }, [applyResult, push]);

  const resetDemo = useCallback(() => {
    try {
      const state = storageReset();
      setState(state);
      saveState(state);
      setPersistence(storageAvailable() ? 'ok' : 'unavailable');
      push('success', 'Demo reset', 'Original sample dataset restored.');
      return true;
    } catch (e) {
      push('error', 'Reset failed', e?.message || 'Could not reset.');
      return false;
    }
  }, [push]);

  /* apply theme from settings */
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme || 'light';
  }, [state.settings.theme]);

  /* storage warnings */
  useEffect(() => {
    if (!storageAvailable()) setPersistence('unavailable');
  }, []);

  /* derived helpers */
  const helpers = useMemo(() => ({
    formatMoney: (minor) => formatMoney(minor, state.settings.currency),
    locationById: (id) => state.locations.find((l) => l.id === id),
    productById: (id) => state.products.find((p) => p.id === id),
    supplierById: (id) => state.suppliers.find((s) => s.id === id),
    categoryById: (id) => state.categories.find((c) => c.id === id),
    customerById: (id) => state.customers.find((c) => c.id === id),
  }), [state]);

  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const value = {
    state,
    settings: state.settings,
    persistence,
    restoredNotice,
    dismissRestoredNotice: () => setRestoredNotice(false),
    perform,
    applyResult,
    resetDemo,
    toasts,
    pushToast: push,
    dismissToast: dismiss,
    unreadCount,
    ...helpers,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used inside InventoryProvider');
  return ctx;
}
