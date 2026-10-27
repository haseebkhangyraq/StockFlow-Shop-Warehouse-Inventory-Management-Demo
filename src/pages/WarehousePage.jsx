// src/pages/WarehousePage.jsx
import { useEffect, useMemo, useState } from 'react';
import {
  Warehouse as WarehouseIcon, Package, PackagePlus, SlidersHorizontal, Archive,
  Trash2, Eye, Pencil, Download, PanelTop,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as engine from '../services/inventoryEngine';
import ProductForm from '../components/warehouse/ProductForm';
import ProductDetail from '../components/warehouse/ProductDetail';
import AdjustDialog from '../components/warehouse/AdjustDialog';
import {
  EmptyState, Pagination, SearchInput, useTableSort, SortTh, ConfirmDialog, Badge,
} from '../components/common/ui';
import { StockBadge, ExpiryBadge } from '../components/common/status';
import { onHand, available, reserved, stockStatus, expiryStatus, inTransit } from '../services/inventoryEngine';
import { formatMoney } from '../utils/currency';
import { relativeTime } from '../utils/dates';
import { downloadCSV } from '../utils/csv';

const PAGE_SIZE = 12;
const STATUS_OPTS = [
  { id: 'all', label: 'All stock states' },
  { id: 'in_stock', label: 'In stock' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' },
  { id: 'overstocked', label: 'Overstocked' },
];
const EXPIRY_OPTS = [
  { id: 'all', label: 'All expiry states' },
  { id: 'expired', label: 'Expired' },
  { id: 'expiring_soon', label: 'Expiring soon' },
  { id: 'expiring_today', label: 'Expiring today' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'not_tracked', label: 'Not tracked' },
];

export default function WarehousePage({ navigate }) {
  const { state, settings, formatMoney, perform } = useInventory();
  const cur = settings.currency;
  const fmt = (m) => formatMoney(m, cur);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sup, setSup] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [expiryF, setExpiryF] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState({ barcode: true, reserved: true, expiry: true, value: true, lastMove: true, supplier: false });
  const [colOpen, setColOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [adjustId, setAdjustId] = useState(null); // '' = open without preset
  const [confirm, setConfirm] = useState(null); // {type:'archive'|'delete', id}

  useEffect(() => {
    if (sessionStorage.getItem('sf_open_product')) {
      sessionStorage.removeItem('sf_open_product');
      setEditingId(null);
      setFormOpen(true);
    }
  }, []);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const totalOn = (productId) => state.batches.reduce((a, b) => (b.productId === productId ? a + b.qty : a), 0);
    return state.products
      .filter((p) => (showArchived ? true : p.status === 'active'))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle) || (p.barcode || '').includes(needle))
      .filter((p) => cat === 'all' || p.categoryId === cat)
      .filter((p) => sup === 'all' || p.supplierId === sup)
      .filter((p) => {
        if (statusF === 'all') return true;
        return stockStatus(state, p.id) === statusF || (statusF === 'out' && totalOn(p.id) === 0);
      })
      .filter((p) => expiryF === 'all' || expiryStatus(state, p.id) === expiryF)
      .map((p) => {
        const total = state.batches.reduce((a, b) => (b.productId === p.id ? a + b.qty : a), 0);
        return {
          ...p,
          categoryName: state.categories.find((c) => c.id === p.categoryId)?.name || '—',
          supplierName: state.suppliers.find((s) => s.id === p.supplierId)?.companyName || '—',
          units: total,
          reserved: state.locations.reduce((a, l) => a + reserved(state, p.id, l.id), 0),
          avail: state.locations.reduce((a, l) => a + available(state, p.id, l.id), 0),
          transit: inTransit(state, p.id),
          status: total === 0 ? 'out' : stockStatus(state, p.id),
          expiry: expiryStatus(state, p.id),
          value: total * p.costPrice,
          retail: total * p.sellPrice,
        };
      });
  }, [state, q, cat, sup, statusF, expiryF, showArchived]);

  const { sorted, toggle, sortKey, dir } = useTableSort(rows, 'name');
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const view = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const openEdit = (id) => { setEditingId(id); setFormOpen(true); };
  const askArchive = (id) => setConfirm({ type: 'archive', id });
  const askDelete = (id) => setConfirm({ type: 'delete', id });

  const runConfirm = () => {
    const { type, id } = confirm || {};
    setConfirm(null);
    if (!id) return;
    const unitsNow = state.batches.reduce((a, b) => (b.productId === id ? a + b.qty : a), 0);
    if (type === 'archive') perform(engine.archiveProduct, id, { confirmZero: unitsNow === 0 });
    if (type === 'delete') perform(engine.deleteProduct, id);
  };

  const exportCsv = () => {
    downloadCSV('stockflow-warehouse-products', rows, [
      { label: 'SKU', value: 'sku' }, { label: 'Name', value: 'name' },
      { label: 'Category', value: 'categoryName' }, { label: 'Supplier', value: 'supplierName' },
      { label: 'Unit', value: 'unit' }, { label: 'Cost', value: (r) => (r.costPrice / 100).toFixed(2) },
      { label: 'Price', value: (r) => (r.sellPrice / 100).toFixed(2) },
      { label: 'Units', value: (r) => r.units }, { label: 'Reserved', value: (r) => r.reserved },
      { label: 'Available', value: (r) => r.avail }, { label: 'Status', value: (r) => r.status },
      { label: 'Reorder level', value: (r) => r.reorderLevel },
      { label: `Stock value (${cur})`, value: (r) => (r.value / 100).toFixed(2) },
      { label: 'Last movement', value: (r) => relativeTime(r.lastMovementAt) },
    ]);
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1 className="page-title"><WarehouseIcon size={21} /> Warehouse</h1>
          <p className="page-sub">Master catalog and physical stock at the warehouse — add products, keep records accurate, and trigger replenishment when levels dip.</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
          <button className="btn btn-secondary" onClick={() => setAdjustId('')}><SlidersHorizontal size={15} /> Adjust stock</button>
          <button className="btn btn-success-soft" onClick={() => { sessionStorage.setItem('sf_open_receive', '1'); navigate('/receiving'); }}><PackagePlus size={15} /> Receive stock</button>
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setFormOpen(true); }}><Package size={15} /> Add product</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name, SKU or barcode…" />
          <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}>
            <option value="all">All categories</option>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sup} onChange={(e) => { setSup(e.target.value); setPage(1); }}>
            <option value="all">All suppliers</option>
            {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
          </select>
          <select value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }}>
            {STATUS_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={expiryF} onChange={(e) => { setExpiryF(e.target.value); setPage(1); }}>
            {EXPIRY_OPTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowArchived((v) => !v)}>
          <Archive size={14} /> {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-secondary" onClick={() => setColOpen((o) => !o)}><PanelTop size={14} /> Columns</button>
          {colOpen ? (
            <div className="search-results" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 220, zIndex: 30 }}>
              {Object.entries({ barcode: 'Barcode', reserved: 'Reserved', expiry: 'Expiry status', value: 'Stock value', lastMove: 'Last movement', supplier: 'Supplier' }).map(([k, label]) => (
                <label key={k} className="search-result-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={cols[k]} onChange={(e) => setCols((c) => ({ ...c, [k]: e.target.checked }))} />
                  <span style={{ fontSize: 12.6, fontWeight: 600 }}>{label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <SortTh label="Product" onClick={() => toggle('name')} active={sortKey === 'name'} dir={dir} />
                <SortTh label="SKU" onClick={() => toggle('sku')} active={sortKey === 'sku'} dir={dir} />
                {cols.barcode ? <th>Barcode</th> : null}
                <SortTh label="Category" onClick={() => toggle('categoryName')} active={sortKey === 'categoryName'} dir={dir} />
                {cols.supplier ? <th>Supplier</th> : null}
                <SortTh label="On hand" onClick={() => toggle('units')} active={sortKey === 'units'} dir={dir} numeric />
                {cols.reserved ? <th className="cell-num">Reserved</th> : null}
                <SortTh label="Available" onClick={() => toggle('avail')} active={sortKey === 'avail'} dir={dir} numeric />
                <SortTh label="Status" onClick={() => toggle('status')} active={sortKey === 'status'} dir={dir} />
                {cols.expiry ? <th>Expiry</th> : null}
                {cols.value ? <SortTh label="Stock value" onClick={() => toggle('value')} active={sortKey === 'value'} dir={dir} numeric /> : null}
                {cols.lastMove ? <SortTh label="Last movement" onClick={() => toggle('lastMovementAt')} active={sortKey === 'lastMovementAt'} dir={dir} /> : null}
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="link row-title" onClick={() => setDetailId(p.id)}>{p.name}</button>
                    {p.trackExpiry ? <Badge color="violet" icon={PanelTop}>expiry</Badge> : null}
                  </td>
                  <td className="mono">{p.sku}</td>
                  {cols.barcode ? <td className="mono" style={{ fontSize: 11 }}>{p.barcode || '—'}</td> : null}
                  <td>{p.categoryName}</td>
                  {cols.supplier ? <td>{p.supplierName}</td> : null}
                  <td className="cell-num cell-strong">{p.units} {p.unit}</td>
                  {cols.reserved ? <td className="cell-num">{p.reserved > 0 ? `${p.reserved}` : '—'}</td> : null}
                  <td className="cell-num">{p.avail}</td>
                  <td><StockBadge status={p.status} /></td>
                  {cols.expiry ? <td><ExpiryBadge status={p.expiry} /></td> : null}
                  {cols.value ? <td className="cell-num">{fmt(p.value)}</td> : null}
                  {cols.lastMove ? <td className="nowrap" style={{ fontSize: 11 }}>{relativeTime(p.lastMovementAt)}</td> : null}
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" title="View" onClick={() => setDetailId(p.id)}><Eye size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => openEdit(p.id)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Adjust" onClick={() => setAdjustId(p.id)}><SlidersHorizontal size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Archive" onClick={() => askArchive(p.id)}><Archive size={14} /></button>
                      <button className="btn btn-ghost btn-sm btn-icon" title="Delete" onClick={() => askDelete(p.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {view.length === 0 ? (
            <EmptyState
              title="No products match"
              sub="Try clearing filters, or add a new product to the warehouse catalog."
              icon={Package}
            >
              <button className="btn btn-primary" onClick={() => { setEditingId(null); setFormOpen(true); }}><Package size={14} /> Add product</button>
            </EmptyState>
          ) : null}
        </div>
        {sorted.length > PAGE_SIZE ? (
          <Pagination page={pageSafe} pages={pages} onPage={setPage} total={sorted.length} label="products" />
        ) : null}
      </div>

      <ProductForm open={formOpen} onClose={() => setFormOpen(false)} editingId={editingId} />
      {detailId ? (
        <ProductDetail
          productId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(p) => { setDetailId(null); openEdit(p.id); }}
          onReceive={(p) => { sessionStorage.setItem('sf_receive_preset', p.id); navigate('/receiving'); }}
        />
      ) : null}
      {adjustId !== null ? (
        <AdjustDialog open onClose={() => setAdjustId(null)} presetProductId={adjustId || null} />
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.type === 'delete' ? 'Delete product permanently?' : 'Archive product?'}
        message={confirm?.type === 'delete'
          ? 'Products that appear in any historical transaction cannot be deleted and will offer archiving instead. This keeps history intact.'
          : 'Archiving hides the product from operations while preserving all history. Products with stock on hand must be cleared first.'}
        confirmLabel={confirm?.type === 'delete' ? 'Delete' : 'Archive'}
        danger
      />
    </>
  );
}
