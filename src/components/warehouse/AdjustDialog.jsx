// src/components/warehouse/AdjustDialog.jsx
import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, Select, TextArea, TextInput, Badge } from '../common/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import * as engine from '../../services/inventoryEngine';
import { ADJUSTMENT_REASONS } from '../../utils/constants';
import { onHand, available } from '../../services/inventoryEngine';

/** A correction workflow: operator counts physical stock, engine records the
 *  difference explicitly (never silently changes quantities). */
export default function AdjustDialog({ open, onClose, presetProductId = null }) {
  const { state, perform } = useInventory();
  const active = state.products.filter((p) => p.status === 'active');
  const [productId, setProductId] = useState(presetProductId || active[0]?.id || '');
  const [locationId, setLocationId] = useState(state.locations[0]?.id || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('stock_count');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState({});

  useEffect(() => {
    if (open) {
      setProductId(presetProductId || active[0]?.id || '');
      setLocationId(state.locations[0]?.id || '');
      setQty(''); setReason('stock_count'); setNotes(''); setErr({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetProductId]);

  const current = useMemo(() => {
    if (!productId || !locationId) return null;
    return {
      onHand: onHand(state, productId, locationId),
      available: available(state, productId, locationId),
      reserved: state.transfers.filter((t) => t.status === 'pending' && t.sourceLocationId === locationId).reduce((a, t) => a + t.lines.reduce((s, l) => (l.productId === productId ? s + l.qty : s), 0), 0),
    };
  }, [state, productId, locationId]);

  const submit = () => {
    const adjustedQty = Number(qty);
    const result = perform(engine.adjustStock, {
      productId, locationId, adjustedQty, reason, notes,
    });
    if (result.ok) onClose();
    else setErr({ adjustedQty: result.error });
  };

  const loc = state.locations.find((l) => l.id === locationId);
  const product = state.products.find((p) => p.id === productId);
  const diff = current && qty !== '' ? (Number(qty) - current.onHand) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Stock adjustment"
      icon={SlidersHorizontal}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={submit}>Record adjustment</button>
        </>
      )}
    >
      {active.length === 0 ? (
        <p className="small-text">No products available yet — create a product first.</p>
      ) : (
        <div className="form-grid">
          <Field label="Product" required>
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setQty(''); }}>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
          </Field>
          <Field label="Location" required>
            <Select value={locationId} onChange={(e) => { setLocationId(e.target.value); setQty(''); }}>
              {state.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <div className="span-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span><span className="detail-label">On record</span><div style={{ fontWeight: 750, fontSize: 16 }}>{current?.onHand ?? '—'} {product?.unit}</div></span>
            <span><span className="detail-label">Available</span><div style={{ fontWeight: 650 }}>{current?.available ?? '—'} <span className="muted" style={{ fontSize: 10.5 }}>(+{current?.reserved ?? 0} reserved by pending transfers)</span></div></span>
            {diff !== null && Number.isFinite(diff) ? (
              <span><span className="detail-label">Difference</span>
                <div style={{ fontWeight: 750, color: diff === 0 ? 'var(--muted)' : diff > 0 ? 'var(--ok-strong)' : 'var(--danger-strong)' }}>
                  {diff > 0 ? `+${diff}` : diff}
                </div>
              </span>
            ) : null}
          </div>
          <Field label={`Counted physical quantity (${product?.unit || 'units'})`} required error={err.adjustedQty ? undefined : undefined} hint="Enter what is physically counted on the shelf.">
            <TextInput
              type="number"
              min="0"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={String(current?.onHand ?? 0)}
            />
            {err.adjustedQty ? <span className="field-error">{err.adjustedQty}</span> : null}
          </Field>
          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Notes" className="span-2">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain what was found during the count…" />
          </Field>
          <div className="span-2 small-text" style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <Badge color="teal">audited</Badge>
            Adjustments are recorded with previous quantity, counted quantity, difference, reason, timestamp ({state.settings.operator}) and notes — then logged to the activity ledger.
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--muted)' }}>
        Location: {loc?.name}. Note: adjustments correct discrepancies; for routine damage disposal use Stock Issuance.
      </div>
    </Modal>
  );
}
