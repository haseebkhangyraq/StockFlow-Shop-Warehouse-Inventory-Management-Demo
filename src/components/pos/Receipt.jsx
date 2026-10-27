// src/components/pos/Receipt.jsx
// Printable receipt markup — CSS @media print shows ONLY this element.

import { formatDateTime } from '../../utils/dates';

export function ReceiptHTML({ sale, settings, locations, customers }) {
  if (!sale) return null;
  const locName = locations.find((l) => l.id === sale.locationId)?.name || '';
  const cust = customers.find((c) => c.id === sale.customerId);
  const saleDate = sale._date || sale.createdAt;
  return (
    <div className="receipt-print" aria-label="Receipt preview">
      <div className="rc-center">
        <div className="rc-store">{settings.storeName}</div>
        <div className="rc-sub">{settings.contactAddress}</div>
        <div className="rc-sub">{settings.contactPhone} · {settings.contactEmail}</div>
      </div>
      <div className="rc-sep" />
      <div className="rc-row"><span className="grow">Receipt #: {sale.receiptNo}</span><span>{sale.paymentStatus === 'paid' ? 'PAID' : sale.paymentStatus}</span></div>
      <div className="rc-row"><span className="grow">Date: {formatDateTime(saleDate)}</span></div>
      <div className="rc-row"><span className="grow">Location: {locName}</span></div>
      {cust ? <div className="rc-row"><span className="grow">Customer: {cust.name}</span></div> : null}
      <div className="rc-sep" />
      {sale.lines.map((l, i) => {
        const p = sale._products?.[l.productId];
        return (
          <div className="rc-item" key={i}>
            <div className="rc-item-name">{p ? p.name : `Product ${l.productId.slice(0, 6)}`}</div>
            <div className="rc-item-sub rc-row">
              <span className="grow">{l.qty} × {(l.unitPrice / 100).toFixed(2)}</span>
              <span>{(l.qty * l.unitPrice / 100).toFixed(2)}</span>
            </div>
          </div>
        );
      })}
      <div className="rc-sep" />
      <div className="rc-row"><span className="grow">Subtotal</span><span>{(sale.subtotal / 100).toFixed(2)}</span></div>
      {sale.discount > 0 ? (
        <div className="rc-row"><span className="grow">Discount{sale.discountType === 'pct' ? ` (${sale.discountValue}%)` : ''}</span><span>-{(sale.discount / 100).toFixed(2)}</span></div>
      ) : null}
      {sale.tax > 0 ? (
        <div className="rc-row"><span className="grow">Tax ({settings.taxRatePct}%)</span><span>{(sale.tax / 100).toFixed(2)}</span></div>
      ) : null}
      <div className="rc-sep" />
      <div className="rc-total-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span>TOTAL</span><span>{(sale.total / 100).toFixed(2)}</span></div>
      <div className="rc-row"><span className="grow">{sale.paymentMethod.toUpperCase()}</span><span>{(sale.amountReceived / 100).toFixed(2)}</span></div>
      {sale.change > 0 ? <div className="rc-row"><span className="grow">Change due</span><span>{(sale.change / 100).toFixed(2)}</span></div> : null}
      <div className="rc-sep" />
      <div className="rc-row"><span className="grow">Items: {sale.lines.reduce((a, l) => a + l.qty, 0)}</span><span>{sale.operator || 'Demo Operator'}</span></div>
      {sale.returns?.length ? (
        <>
          <div className="rc-sep" />
          <div className="rc-row"><span className="grow">Returned amount on this receipt</span><span>{(sale.returnedTotal / 100).toFixed(2)}</span></div>
        </>
      ) : null}
      <div className="rc-sep" />
      <div className="rc-foot">{settings.receiptFooter}</div>
    </div>
  );
}

export function printReceipt() {
  window.print();
}
