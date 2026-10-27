// src/services/persistenceService.js
// localStorage-backed persistence for the demo state, with graceful handling of
// quota errors, private-mode access errors, and corrupted stored payloads.

import { buildSeedState } from '../data/demoData';

export const STORAGE_KEY = 'stockflow_demo_state_v1';
export const SCHEMA_VERSION = 1;

let lastWriteError = null;

export function storageAvailable() {
  try {
    const probe = '__stockflow_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Create a pristine seed state. */
export function freshState() {
  return buildSeedState();
}

function isValidShape(state) {
  return !!state
    && typeof state === 'object'
    && state.schemaVersion === SCHEMA_VERSION
    && Array.isArray(state.products)
    && Array.isArray(state.batches)
    && Array.isArray(state.sales)
    && Array.isArray(state.transfers)
    && !!state.settings
    && typeof state.settings === 'object';
}

/** Load persisted state; fall back to seed data when missing/corrupt. */
export function loadState() {
  if (!storageAvailable()) {
    return { state: freshState(), persistence: 'unavailable', restored: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const state = freshState();
      saveState(state);
      return { state, persistence: 'ok', restored: false };
    }
    const parsed = JSON.parse(raw);
    if (!isValidShape(parsed)) {
      const state = freshState();
      saveState(state);
      return { state, persistence: 'ok', restored: 'corrupt' };
    }
    // shallow-normalize any arrays that might be missing from an older version
    parsed.activity ||= [];
    parsed.notifications ||= [];
    parsed.batches ||= [];
    parsed.receipts ||= [];
    parsed.issues ||= [];
    parsed.transfers ||= [];
    parsed.sales ||= [];
    parsed.adjustments ||= [];
    parsed.counters ||= { rcv: 0, iss: 0, trf: 0, sal: 0, adj: 0, ret: 0 };
    parsed.settings = { ...freshState().settings, ...parsed.settings };
    return { state: parsed, persistence: 'ok', restored: false };
  } catch {
    const state = freshState();
    try { saveState(state); } catch { /* ignore */ }
    return { state, persistence: 'ok', restored: 'corrupt' };
  }
}

/** Persist the state; returns 'ok' | 'unavailable' | 'error'. */
export function saveState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    lastWriteError = null;
    return 'ok';
  } catch (e) {
    lastWriteError = e?.name || 'Error';
    return storageAvailable() ? 'error' : 'unavailable';
  }
}

export function getLastWriteError() {
  return lastWriteError;
}

/** Wipe stored state and restore the original sample dataset. */
export function resetState() {
  const state = freshState();
  if (storageAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* out of quota — demo still runs in memory */ }
  }
  return state;
}

export function exportBackup(state) {
  return JSON.stringify(state, null, 2);
}
