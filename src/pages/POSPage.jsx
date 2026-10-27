// src/pages/POSPage.jsx
import { useMemo, useState, useRef } from 'react';
import {
  ShoppingCart, ScanBarcode, Search, Plus, Minus, Trash2, Banknote, CreditCard, Wallet,
  UserRound, Printer, Check, Percent, CircleAlert, Store, RefreshCw,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EmptyState, Field, TextInput, Select, Badge, Modal, ConfirmDialog,
} from '../components/common/ui';
import {
  sellableQty, activeProducts, onHand,
} from '../services/inventoryEngine';
import * as engine from '../services/inventoryEngine';
import { formatMoney, parseMoneyInput } from '../utils/currency';
import { ReceiptHTML, printReceipt } from '../components/pos/Receipt';

const PAYMENTS = [
  { id: 'cash', label: 'Cash', Icon: Banknote },
  { id: 'card', label: 'Card', Icon: CreditCard },
  { id: 'other', label: 'Other', Icon: Wallet },
];

export default function POSPage() {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);
  const shops = state.locations.filter((l) => l.type === 'shop');
  const [shopId, setShopId] = useState(shops[0]?.id || '');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [showOos, setShowOos] = useState(false);
  const [cart, setCart] = useState([]); // {productId, qty, unitPrice}
  const [discountType, setDiscountType] = useState('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [cartErr, setCartErr] = useState(null);
  const [saleResult, setSaleResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [expoOpen, setExpoOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [custErr, setCustErr] = useState({});
  const barcodeRef = useRef(null);

  const products = activeProducts(state);

  const catalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = products
      .filter((p) => cat === 'all' || p.categoryId === cat)
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle) || (p.barcode || '').toLowerCase().includes(needle))
      .map((p) => {
        const sellable = sellableQty(state, p.id, shopId);
        const expiredUnits = onHand(state, p.id, shopId) - sellable;
        return { p, sellable, expiredUnits };
      })
      .filter((r) => (showOos ? true : r.sellable > 0));
    return rows.sort((a, b) => b.sellable - a.sellable || a.p.name.localeCompare(b.p.name));
  }, [state, q, cat, showOos, shopId, products]);

  const cartRows = cart.map((c) => ({
    ...c,
    product: state.products.find((p) => p.id === c.productId),
    sellable: sellableQty(state, c.productId, shopId),
    lineTotal: c.unitPrice * c.qty,
    expiredUnits: onHand(state, c.productId, shopId) - sellableQty(state, c.productId, shopId),
  }));

  const subtotal = cartRows.reduce((a, r) => a + r.lineTotal, 0);
  const dv = Math.max(0, parseMoneyInput(discountValue) || 0);
  let discount = 0;
  if (discountType === 'pct') discount = Math.round((subtotal * dv) / 100);
  else if (discountType === 'amount') discount = Math.min(dv, subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * (settings.taxRatePct || 0)) / 100);
  const total = taxable + tax;
  const receivedMinor = parseMoneyInput(received) || 0;
  const change = Math.max(0, receivedMinor - total);

  const addToCart = (productId, unitPrice) => {
    const max = sellableQty(state, productId, shopId);
    if (!max) return;
    setCart((carts) => {
      const existing = carts.find((c) => c.productId === productId);
      if (existing) {
        if (existing.qty >= max) return carts;
        return carts.map((c) => (c.productId === productId ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...carts, { productId, qty: 1, unitPrice }];
    });
    setCartErr(null);
  };

  const setQty = (productId, qty) => {
    const max = sellableQty(state, productId, shopId);
    setCart((carts) => carts.map((c) => (c.productId === productId ? { ...c, qty: Math.min(Math.max(1, qty), max) } : c)));
  };

  const onBarcode = (e) => {
    e.preventDefault();
    const code = q.trim();
    if (!code) return;
    const p = products.find((x) => x.sku.toLowerCase() === code.toLowerCase() || (x.barcode || '').toLowerCase() === code.toLowerCase());
    if (p) {
      const sellable = sellableQty(state, p.id, shopId);
      if (sellable > 0) {
        addToCart(p.id, p.sellPrice);
        setQ('');
      } else {
        setCartErr(`${p.name} has no sellable stock at ${state.locations.find((l) => l.id === shopId)?.name}.`);
      }
    } else {
      setCartErr(`No product matches barcode/SKU “${code}”.`);
    }
    barcodeRef.current?.focus();
  };

  const checkout = () => {
    if (submitting) return;
    if (cart.length === 0) return;
    const amountReceived = paymentMethod === 'cash' ? (receivedMinor || total) : total;
    setSubmitting(true);
    const res = perform(engine.completeSale, {
      locationId: shopId,
      lines: cart.map((c) => ({ productId: c.productId, qty: c.qty, unitPrice: c.unitPrice })),
      discountType,
      discountValue: Number(discountValue) || 0,
      customerId: customerId || null,
      paymentMethod,
      amountReceived,
    });
    setSubmitting(false);
    if (res.ok) {
      setSaleResult(res.sale
        ? { ...res.sale, _date: new Date().toISOString(), _products: Object.fromEntries(state.products.map((p) => [p.id, p])) }
        : null);
      setCart([]);
      setDiscountValue('');
      setReceived('');
      setCustomerId('');
      setCartErr(null);
    } else {
      setCartErr(res.error);
    }
  };

  const addCustomer = (payload) => {
    const res = perform(engine.createCustomer, payload);
    if (res.ok) {
      setCustomerId(res.customerId);
      setNewCustOpen(false);
      setCustErr({});
    } else {
      setCustErr(res.fieldErrors || {});
    }
  };

  // prefer the canonical record from state, but keep the _products/_date
  // metadata the temp result carries (the state copy never has them)
  const lastSale = saleResult
    ? {
        ...(state.sales.find((s) => s.id === saleResult.id) || saleResult),
        _date: saleResult._date,
        _products: saleResult._products,
      }
    : null;

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><ShoppingCart size={21} /> Point of Sale</h1>
          <p className="page-sub">Fast counter checkout for shop sales. Uses the same live inventory as the warehouse — expired stock can never be sold.</p>
        </div>
        <div className="page-head-actions">
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Store size={15} className="muted" />
            <select className="select" style={{ width: 200 }} value={shopId} onChange={(e) => { setShopId(e.target.value); setCart([]); }}>
              {shops.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowOos((v) => !v)} title="Toggle showing out-of-stock products">
            <RefreshCw size={14} /> {showOos ? 'Hide sold-out' : 'Show sold-out'}
          </button>
        </div>
      </div>

      <div className="pos-layout">
        {/* -------- catalog -------- */}
        <div className="pos-catalog">
          <div className="pos-toolbar">
            <form className="barcode-input" onSubmit={onBarcode}>
              <ScanBarcode size={16} />
              <input
                ref={barcodeRef}
                placeholder="Scan barcode or type SKU, press Enter…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Barcode / SKU entry"
              />
            </form>
            <div className="search" style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={15} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Or search products…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="pos-cat-chips">
            <button className={`cat-chip${cat === 'all' ? ' active' : ''}`} onClick={() => setCat('all')}>All</button>
            {state.categories.map((c) => (
              <button key={c.id} className={`cat-chip${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
            ))}
          </div>
          <div className="pos-products">
            {catalog.length === 0 ? (
              <EmptyState title="No products available here" sub={`Nothing sellable matches at ${state.locations.find((l) => l.id === shopId)?.name}. Receive or transfer stock to fill the shop.`} />
            ) : catalog.map(({ p, sellable, expiredUnits }) => (
              <button key={p.id} className="pos-card" onClick={() => addToCart(p.id, p.sellPrice)} disabled={sellable <= 0}>
                {expiredUnits > 0 ? <span className="pc-badge badge badge-red">expired {expiredUnits}</span> : null}
                <div>
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-sku">{p.sku}</div>
                </div>
                <div className="muted pc-cat-label">{state.categories.find((c) => c.id === p.categoryId)?.name}</div>
                <div className="pc-bottom">
                  <div>
                    <div className="pc-price">{fmt(p.sellPrice)}</div>
                    <div className="pc-stock">{sellable} {p.unit} available</div>
                  </div>
                  <span className="pc-add"><Plus size={15} /></span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* -------- cart -------- */}
        <div className="pos-cart">
          <div className="pos-cart-head">
            <h3><ShoppingCart size={15} /> Current sale</h3>
            <span className="count-badge">{cart.reduce((a, c) => a + c.qty, 0)}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => { if (cart.length) setClearConfirm(true); }}
              disabled={!cart.length}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>

          <div className="pos-cart-items">
            {cartRows.length === 0 ? (
              <div className="pos-cart-empty">
                <ShoppingCart />
                <strong style={{ color: 'var(--text-2)', fontSize: 13 }}>Cart is empty</strong>
                <span style={{ fontSize: 12 }}>Tap a product card, or scan a barcode to start a sale.</span>
              </div>
            ) : cartRows.map((r) => (
              <div className="pos-cart-item" key={r.productId}>
                <div className="ci-info">
                  <div className="ci-name" title={r.product?.name}>{r.product?.name}</div>
                  <div className="ci-price">{fmt(r.unitPrice)} · {r.sellable} left</div>
                  {r.expiredUnits > 0 ? <span className="ci-alloc-warn">{r.expiredUnits} expired unit(s) can’t be sold</span> : null}
                  {r.qty >= r.sellable ? <span className="ci-alloc-warn">at the max sellable quantity</span> : null}
                </div>
                <div className="qty-stepper">
                  <button onClick={() => setQty(r.productId, r.qty - 1)} disabled={r.qty <= 1} aria-label="Decrease quantity"><Minus size={12} /></button>
                  <input
                    type="number"
                    min="1"
                    max={r.sellable}
                    value={r.qty}
                    onChange={(e) => setQty(r.productId, Number(e.target.value))}
                    aria-label={`Quantity for ${r.product?.name}`}
                  />
                  <button onClick={() => setQty(r.productId, r.qty + 1)} disabled={r.qty >= r.sellable} aria-label="Increase quantity"><Plus size={12} /></button>
                </div>
                <div className="ci-line-total">{fmt(r.lineTotal)}</div>
                <button className="ci-remove" onClick={() => setCart((cs) => cs.filter((c) => c.productId !== r.productId))} aria-label="Remove item"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          <div className="pos-cart-foot">
            <div className="pos-discount-row">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} aria-label="Discount type">
                <option value="amount">Discount ({cur})</option>
                <option value="pct">Discount (%)</option>
              </select>
              <input
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'pct' ? 'e.g. 5' : 'e.g. 50.00'}
                disabled={!cart.length}
              />
              <Percent size={13} className="muted" style={{ display: discountType === 'pct' ? undefined : 'none' }} />
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 7 }}>
                <UserRound size={15} className="muted" style={{ marginTop: 8 }} />
                <select className="select" style={{ flex: 1 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Walk-in customer</option>
                  {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn btn-secondary btn-sm" style={{ height: 36 }} onClick={() => { setNewCustOpen(true); setCustErr({}); }}><Plus size={13} /> New</button>
              </div>
            </div>

            <div className="pos-totals">
              <div className="pos-total-row"><span>Subtotal ({cart.reduce((a, c) => a + c.qty, 0)} units)</span><span className="pos-val">{fmt(subtotal)}</span></div>
              {discount > 0 ? <div className="pos-total-row"><span>Discount</span><span className="pos-val" style={{ color: 'var(--danger-strong)' }}>−{fmt(discount)}</span></div> : null}
              <div className="pos-total-row"><span>Tax ({settings.taxRatePct || 0}%)</span><span className="pos-val">{fmt(tax)}</span></div>
              <div className="pos-total-row grand"><span>Grand total</span><span className="pos-val">{fmt(total)}</span></div>
            </div>

            <div className="pos-pay-row">
              {PAYMENTS.map((m) => (
                <button key={m.id} type="button" className={`pay-method${paymentMethod === m.id ? ' selected' : ''}`} onClick={() => setPaymentMethod(m.id)}>
                  <m.Icon /> {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' ? (
              <>
                <div className="pos-tender-row">
                  <input
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="Cash received…"
                    disabled={!cart.length}
                  />
                  <button className="btn btn-secondary" onClick={() => setReceived((total / 100).toFixed(2))} disabled={!cart.length}>Exact</button>
                </div>
                <div className="change-display">
                  <span>Change due</span>
                  <span className="chg-val" style={receivedMinor < total && received !== '' ? { color: 'var(--danger-strong)' } : undefined}>
                    {receivedMinor < total && received !== '' ? '— insufficient' : fmt(change)}
                  </span>
                </div>
              </>
            ) : (
              <div className="change-display"><span>Tendered</span><span className="chg-val">{fmt(total)}</span></div>
            )}

            {cartErr ? (
              <div className="storage-banner" style={{ background: 'var(--danger-soft)', borderColor: 'rgba(220,38,38,0.3)', color: 'var(--danger-strong)', marginBottom: 10 }}>
                <CircleAlert size={15} /> {cartErr}
              </div>
            ) : null}

            <button className="btn btn-ok btn-lg btn-block" onClick={checkout} disabled={!cart.length || submitting || (!!received && receivedMinor < total && paymentMethod === 'cash')}>
              <Check size={17} />
              {submitting ? 'Processing…' : `Complete sale · ${fmt(total)}`}
            </button>
          </div>
        </div>
      </div>

      {/* success + receipt */}
      <Modal
        open={!!lastSale}
        onClose={() => setSaleResult(null)}
        title={lastSale ? `Sale ${lastSale.receiptNo}` : ''}
        icon={ShoppingCart}
        size="lg"
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setSaleResult(null)}>New sale</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={printReceipt}><Printer size={15} /> Print receipt</button>
          </>
        )}
      >
        <div className="sale-success">
          <div className="ss-ic"><Check /></div>
          <h3>Sale completed</h3>
          {lastSale ? (
            <>
              <div className="ss-receipt">{lastSale.receiptNo}</div>
              <div className="ss-change">
                <span className="muted" style={{ fontSize: 12.5 }}>Change due: </span>
                <strong style={{ color: 'var(--ok-strong)' }}>{fmt(lastSale.change || 0)}</strong>
              </div>
              <div className="ss-quick">
                <Badge color="green" icon={Check}>{fmt(lastSale.total)} collected</Badge>
                <Badge color="blue">{lastSale.paymentMethod.toUpperCase()}</Badge>
                <Badge color="gray">{state.locations.find((l) => l.id === lastSale.locationId)?.name}</Badge>
              </div>
            </>
          ) : null}
        </div>
        {lastSale ? (
          <div className="receipt-modal-body">
            <ReceiptHTML
              sale={lastSale}
              settings={settings}
              locations={state.locations}
              customers={state.customers}
            />
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={() => { setClearConfirm(false); setCart([]); setCartErr(null); }}
        title="Clear the cart?"
        message="All scanned items will be removed. Stock stays untouched until a sale is actually completed."
        confirmLabel="Clear cart"
        danger
      />

      <Modal
        open={newCustOpen}
        onClose={() => setNewCustOpen(false)}
        title="Add customer"
        icon={UserRound}
        size="sm"
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setNewCustOpen(false)}>Cancel</button>
            <span className="spacer" />
            <button
              className="btn btn-primary"
              onClick={() => {
                const name = document.getElementById('nc-name')?.value || '';
                addCustomer({ name, phone: document.getElementById('nc-phone')?.value || '', email: '', notes: 'Added at POS' });
              }}
            >Save customer</button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Customer name" required error={custErr.name}>
            <TextInput id="nc-name" placeholder="e.g. Hamza Ali" />
          </Field>
          <Field label="Phone" error={custErr.phone}>
            <TextInput id="nc-phone" placeholder="+92 3xx …" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
