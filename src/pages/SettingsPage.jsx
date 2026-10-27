// src/pages/SettingsPage.jsx
// Store profile, display preferences, engine thresholds, POS receipt config,
// appearance and demo data controls — all persisted through the engine.

import { useMemo, useState } from 'react';
import {
  Settings, Save, RotateCcw, Download, Database, Sun, Moon, BadgeDollarSign,
  CalendarDays, ScanLine, ReceiptText, Building2, CheckCircle2, HardDriveDownload, Sparkles,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import { exportBackup, storageAvailable } from '../services/persistenceService';
import {
  Field, TextInput, TextArea, Select, Badge, ConfirmDialog, Switch,
} from '../components/common/ui';
import { CURRENCIES } from '../utils/currency';

const DATE_FORMATS = ['MMM DD, YYYY', 'DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const NEUTRAL_ICON = { width: 15, height: 15, color: 'var(--primary)' };

export default function SettingsPage() {
  const { state, settings, persistence, formatMoney, perform, resetDemo, pushToast } = useInventory();
  const cur = settings.currency;

  const [form, setForm] = useState({
    storeName: settings.storeName,
    contactPhone: settings.contactPhone || '',
    contactEmail: settings.contactEmail || '',
    contactAddress: settings.contactAddress || '',
    currency: settings.currency,
    dateFormat: settings.dateFormat,
    expiryWarningDays: String(settings.expiryWarningDays),
    deadStockDays: String(settings.deadStockDays),
    taxRatePct: String(settings.taxRatePct),
    operator: settings.operator || 'Demo Operator',
    receiptFooter: settings.receiptFooter || '',
    trackExpiryDefault: !!settings.trackExpiryDefault,
    compactReceipt: !!settings.compactReceipt,
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [numErr, setNumErr] = useState({});

  const dirty = useMemo(() => {
    const compare = (k, v, s) => {
      if (typeof v === 'boolean') return !!v !== !!s;
      if (typeof s === 'number') return Number(v) !== s;
      return String(v) !== String(s ?? '');
    };
    return Object.entries(form).some(([k, v]) => compare(k, v, settings[k]));
  }, [form, settings]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setNumErr((e) => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const errs = {};
    const exp = Number(form.expiryWarningDays);
    const dead = Number(form.deadStockDays);
    const tax = Number(form.taxRatePct);
    if (!Number.isFinite(exp) || exp < 1 || exp > 365) errs.expiryWarningDays = '1–365 days';
    if (!Number.isFinite(dead) || dead < 1 || dead > 730) errs.deadStockDays = '1–730 days';
    if (!Number.isFinite(tax) || tax < 0 || tax > 50) errs.taxRatePct = '0–50%';
    if (!String(form.storeName).trim()) errs.storeName = 'Store name is required';
    setNumErr(errs);
    return Object.keys(errs).length === 0;
  };

  const openSave = () => { if (validate()) setSaveOpen(true); };

  const commitSave = () => {
    setSaveOpen(false);
    perform(engine.updateSettings, {
      storeName: String(form.storeName).trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      contactAddress: form.contactAddress.trim(),
      currency: form.currency,
      dateFormat: form.dateFormat,
      expiryWarningDays: Number(form.expiryWarningDays),
      deadStockDays: Number(form.deadStockDays),
      taxRatePct: Number(form.taxRatePct),
      operator: form.operator.trim(),
      receiptFooter: form.receiptFooter,
      trackExpiryDefault: !!form.trackExpiryDefault,
      compactReceipt: !!form.compactReceipt,
    });
  };

  /* appearance + session switches commit immediately (cheap, reversible) */
  const setTheme = (theme) => {
    perform(engine.updateSettings, { theme });
  };

  const downloadBackup = () => {
    try {
      const json = exportBackup(state);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stockflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast('info', 'Backup downloaded', 'This JSON snapshot contains the entire demo dataset.');
    } catch (e) {
      pushToast('warning', 'Backup failed', e?.message || 'Could not create the file.');
    }
  };

  const seededAtText = new Date(state.seededAt).toLocaleString();

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><Settings size={21} /> Settings</h1>
          <p className="page-sub">Company identity, currency, engine thresholds and receipt text. Changes apply across every module the moment you save.</p>
        </div>
        <div className="page-head-actions">
          {dirty ? <Badge color="amber">unsaved changes</Badge> : <Badge color="green"><CheckCircle2 size={11} /> all saved</Badge>}
          <button className="btn btn-primary" onClick={openSave} disabled={!dirty}><Save size={15} /> Save changes</button>
        </div>
      </div>

      <div className="settings-grid section">
        <div className="card card-pad" style={{ gridColumn: '1 / 2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <Building2 style={NEUTRAL_ICON} />
            <strong style={{ fontSize: 13.5 }}>Store profile</strong>
          </div>
          <div className="form-grid">
            <Field label="Store name" required className="span-2" error={numErr.storeName} hint="Printed on receipts and in the top bar.">
              <TextInput value={form.storeName} invalid={!!numErr.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </Field>
            <Field label="Contact phone">
              <TextInput value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="+92 300 5550100" />
            </Field>
            <Field label="Contact email">
              <TextInput value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} placeholder="hello@stockflow-demo.pk" />
            </Field>
            <Field label="Address" className="span-2">
              <TextInput value={form.contactAddress} onChange={(e) => set('contactAddress', e.target.value)} placeholder="12 Central Plaza, Main Boulevard, Gulberg III" />
            </Field>
            <Field label="Operator name" hint="Shown as the cashier on POS receipts.">
              <TextInput value={form.operator} onChange={(e) => set('operator', e.target.value)} />
            </Field>
          </div>

          <hr className="divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <BadgeDollarSign style={NEUTRAL_ICON} />
            <strong style={{ fontSize: 13.5 }}>Numbers &amp; formats</strong>
          </div>
          <div className="form-grid">
            <Field label="Currency" hint={`Money stored in whole minor units; displays use your locale.`}>
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Date format">
              <Select value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
                {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="Expiry warning window (days)" error={numErr.expiryWarningDays} hint="How early a batch should appear in Expiry Management.">
              <TextInput type="number" min="1" max="365" value={form.expiryWarningDays} invalid={!!numErr.expiryWarningDays} onChange={(e) => set('expiryWarningDays', e.target.value)} />
            </Field>
            <Field label="Dead stock threshold (days)" error={numErr.deadStockDays} hint="Idle days before a product counts as dead stock.">
              <TextInput type="number" min="1" max="730" value={form.deadStockDays} invalid={!!numErr.deadStockDays} onChange={(e) => set('deadStockDays', e.target.value)} />
            </Field>
            <Field label="Tax rate on sales (%)" error={numErr.taxRatePct} hint={`Applied at POS checkout. Sample amount: ${formatMoney(100000, cur)} → ${formatMoney(Math.round(100000 * (Number(form.taxRatePct) || 0) / 100), cur)} tax.`}>
              <TextInput type="number" min="0" max="50" step="0.5" value={form.taxRatePct} invalid={!!numErr.taxRatePct} onChange={(e) => set('taxRatePct', e.target.value)} />
            </Field>
          </div>

          <hr className="divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <ReceiptText style={NEUTRAL_ICON} />
            <strong style={{ fontSize: 13.5 }}>POS receipt footer</strong>
          </div>
          <TextArea value={form.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} placeholder="Thank you message printed at the bottom of every receipt." />
        </div>

        <div>
          <div className="card card-pad section-bottom">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <Sparkles style={NEUTRAL_ICON} />
              <strong style={{ fontSize: 13.5 }}>Appearance</strong>
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Color theme</div>
                <div className="sr-hint">Light is the polished default; dark is tuned for dim stockrooms.</div>
              </div>
              <div className="theme-switch" role="group" aria-label="Theme">
                <button className={settings.theme !== 'dark' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={13} /> Light</button>
                <button className={settings.theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={13} /> Dark</button>
              </div>
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Pre-forward expiries on new products</div>
                <div className="sr-hint">Defaults the “track expiry” switch in the product form for perishable-heavy catalogs.</div>
              </div>
              <Switch checked={form.trackExpiryDefault} onChange={(v) => set('trackExpiryDefault', v)} />
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Compact receipts</div>
                <div className="sr-hint">Tightens the printed receipt spacing for small thermal printers.</div>
              </div>
              <Switch checked={form.compactReceipt} onChange={(v) => set('compactReceipt', v)} />
            </div>
          </div>

          <div className="card card-pad section-bottom" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <Database style={NEUTRAL_ICON} />
              <strong style={{ fontSize: 13.5 }}>Demo data &amp; storage</strong>
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Local persistence</div>
                <div className="sr-hint">
                  {persistence === 'ok'
                    ? 'Your demo changes save to this browser’s localStorage automatically.'
                    : 'Browser storage is unavailable — data lives in memory for this session only.'}
                </div>
              </div>
              <Badge color={persistence === 'ok' ? 'green' : 'red'}>
                {persistence === 'ok' ? <CheckCircle2 size={11} /> : <HardDriveDownload size={11} />}
                {persistence === 'ok' ? 'localStorage active' : 'memory only'}
              </Badge>
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Sample dataset seeded</div>
                <div className="sr-hint">
                  {seededAtText} · {state.products.length} products · {state.batches.length} batches ·
                  {' '}{state.sales.length} sales · {state.activity.length} activity records
                </div>
              </div>
              <button className="btn btn-secondary" onClick={downloadBackup}><Download size={14} /> Backup JSON</button>
            </div>
            <div className="setting-row">
              <div className="sr-info">
                <div className="sr-name">Reset demonstration data</div>
                <div className="sr-hint">Wipes everything you changed and rebuilds the original sample dataset (with a fresh seed date). Cannot be undone.</div>
              </div>
              <button className="btn btn-danger-soft" onClick={() => setResetOpen(true)}><RotateCcw size={14} /> Reset demo</button>
            </div>
          </div>

          <div className="storage-banner" style={{ marginTop: 18 }}>
            <HardDriveDownload size={15} />
            <span style={{ fontSize: 11.8 }}>
              This demo stores everything client-side: master data, stock batches and ~{state.sales.length} seeded sales receipts. Server connectivity is never required — that also means clearing your browser data is equivalent to a factory reset.
            </span>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onConfirm={commitSave}
        title="Save settings?"
        message={
          <div>
            Currency “{form.currency}” reformats every value in the app. The expiry window and dead-stock thresholds re-run alert lists for all {state.products.length} products.
          </div>
        }
        confirmLabel="Save settings"
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => { setResetOpen(false); resetDemo(); }}
        title="Reset demonstration data?"
        message="Every session change (products created, sales, receipts, edits) is discarded and the pristine sample dataset returns. This action cannot be undone."
        confirmLabel="Reset demo"
        danger
      />
    </>
  );
}
