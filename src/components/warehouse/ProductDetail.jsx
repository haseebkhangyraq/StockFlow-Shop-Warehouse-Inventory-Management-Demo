// src/components/warehouse/ProductDetail.jsx
// Read-only product drawer/modal: stock by location, batches, movements, value.

import { useMemo } from 'react';
import { Modal, Badge, EmptyState } from '../common/ui';
import { StockBadge, ExpiryBadge } from '../common/status';
import { useInventory } from '../../context/InventoryContext';
import { onHand, reserved, available, totalOnHand, inTransit, sellableQty, stockStatus, expiryStatus, batchesOf } from '../../services/inventoryEngine';
import { formatMoney } from '../../utils/currency';
import { formatDateTime, formatDate, daysUntil, relativeTime } from '../../utils/dates';
import { batchExpiryStatus } from '../../services/inventoryEngine';

export default function ProductDetail({ productId, onClose, onEdit, onReceive }) {
  const { state, settings } = useInventory();
  const cur = settings.currency;
  const product = state.products.find((p) => p.id === productId);

  const rows = useMemo(() => {
    if (!product) return [];
    return state.locations.map((l) => {
      const onHandQ = onHand(state, product.id, l.id);
      return {
        location: l,
        onHand: onHandQ,
        reserved: reserved(state, product.id, l.id),
        available: available(state, product.id, l.id),
        status: stockStatus(state, product.id, l.id),
      };
    });
  }, [state, product]);

  const batches = useMemo(() => {
    if (!product) return [];
    return batchesOf(state, product.id)
      .map((b) => ({ ...b, status: batchExpiryStatus(state, b), days: b.expDate ? daysUntil(b.expDate) : null }))
      .sort((a, b) => (a.locationId === 'loc_wh' ? -1 : 1) - (b.locationId === 'loc_wh' ? -1 : 1));
  }, [state, product]);

  const movements = useMemo(() => {
    if (!product) return [];
    return state.activity.filter((a) => a.productId === product.id).slice(0, 10);
  }, [state.activity, product]);

  if (!product) return null;

  const units = totalOnHand(state, product.id);
  const transit = inTransit(state, product.id);
  const shopSellable = state.locations.filter((l) => l.type === 'shop')
    .map((l) => `${l.name}: ${sellableQty(state, product.id, l.id)}`).join(' · ');

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product.name}
      icon={undefined}
      size="lg"
      footer={(
        <>
          {onReceive ? <button className="btn btn-success-soft" onClick={() => onReceive(product)}>Receive stock</button> : null}
          {onEdit ? <button className="btn btn-secondary" onClick={() => onEdit(product)}>Edit product</button> : null}
          <span className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <StockBadge status={stockStatus(state, product.id)} />
        <ExpiryBadge status={expiryStatus(state, product.id)} />
        <Badge color={product.status === 'active' ? 'green' : 'gray'}>{product.status}</Badge>
        <Badge color="violet">{state.categories.find((c) => c.id === product.categoryId)?.name || 'No category'}</Badge>
      </div>

      <div className="detail-grid">
        <div><div className="detail-label">SKU</div><div className="detail-value mono">{product.sku}</div></div>
        <div><div className="detail-label">Barcode</div><div className="detail-value mono">{product.barcode || '—'}</div></div>
        <div><div className="detail-label">Unit</div><div className="detail-value">{product.unit}</div></div>
        <div><div className="detail-label">Reorder level</div><div className="detail-value">{product.reorderLevel}</div></div>
        <div><div className="detail-label">Purchase cost (WAC)</div><div className="detail-value">{formatMoney(product.costPrice, cur)}</div></div>
        <div><div className="detail-label">Selling price</div><div className="detail-value" style={{ color: 'var(--ok-strong)', fontWeight: 700 }}>{formatMoney(product.sellPrice, cur)}</div></div>
        <div><div className="detail-label">Preferred supplier</div><div className="detail-value">{state.suppliers.find((s) => s.id === product.supplierId)?.companyName || '—'}</div></div>
        <div><div className="detail-label">Created</div><div className="detail-value">{formatDate(product.createdAt, settings.dateFormat)}</div></div>
        <div><div className="detail-label">Last movement</div><div className="detail-value">{relativeTime(product.lastMovementAt)}</div></div>
        <div>
          <div className="detail-label">Sellable at shops (non-expired)</div>
          <div className="detail-value">{shopSellable || 'None'}</div>
        </div>
        {product.description ? (
          <div className="span-2"><div className="detail-label">Description</div><div className="detail-value">{product.description}</div></div>
        ) : null}
      </div>

      <hr className="divider" />

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Stock by location</div>
      <table className="data loc-stock-table" style={{ minWidth: 480 }}>
        <thead><tr><th>Location</th><th className="cell-num">On hand</th><th className="cell-num">Reserved</th><th className="cell-num">Available</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.location.id}>
              <td>{r.location.name}</td>
              <td className="cell-num">{r.onHand}</td>
              <td className="cell-num">{r.reserved}</td>
              <td className="cell-num">{r.available}</td>
              <td><StockBadge status={r.status} /></td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td className="cell-strong">Totals</td>
            <td className="cell-num">{units}</td>
            <td className="cell-num">—</td>
            <td className="cell-num">{transit > 0 ? `${transit} in transit` : rows.reduce((a, r) => a + r.available, 0)}</td>
            <td>{formatMoney(units * product.costPrice, cur)}</td>
          </tr>
        </tbody>
      </table>

      {product.trackExpiry || product.trackBatch ? (
        <>
          <hr className="divider" />
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Stock batches (FEFO order)</div>
          {batches.length === 0 ? (
            <EmptyState title="No batches in stock" sub="Receive stock to create the first batch." />
          ) : (
            batches.map((b) => (
              <div className="batch-row" key={b.id}>
                <span className="b-no">{b.batchNo}</span>
                <span className="muted">{state.locations.find((l) => l.id === b.locationId)?.name}</span>
                <span>×{b.qty} {product.unit}</span>
                {b.expDate ? (
                  <>
                    <span className="muted">exp {formatDate(b.expDate, settings.dateFormat)}</span>
                    <Badge color={b.status === 'expired' ? 'red' : b.status === 'expiring_today' ? 'red' : b.status === 'expiring_soon' ? 'amber' : 'green'}>
                      {b.days < 0 ? `${-b.days}d overdue` : b.days === 0 ? 'today' : `${b.days}d left`}
                    </Badge>
                  </>
                ) : <Badge color="gray">no expiry</Badge>}
              </div>
            ))
          )}
        </>
      ) : null}

      <hr className="divider" />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Recent movements</div>
      {movements.length === 0 ? (
        <EmptyState title="No movements yet" sub="Receipts, issues, transfers, sales and adjustments will appear here." />
      ) : (
        <div className="mini-list" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
          {movements.map((m) => (
            <div className="mini-row" key={m.id}>
              <span className="mr-text">
                <span className="mr-title">{m.description}</span>
                <span className="mr-sub mono">{m.refId} · {m.isSeeded ? 'seeded history' : 'this session'}</span>
              </span>
              <span className="mr-when">{formatDateTime(m.at, settings.dateFormat)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
