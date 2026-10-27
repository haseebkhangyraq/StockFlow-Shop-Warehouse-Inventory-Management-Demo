# StockFlow — Shop & Warehouse Inventory Management (Demo)

StockFlow is a browser-only retail & warehouse inventory suite built with **React + Vite**. Sixteen modules
share **one centralized inventory engine** — every page reads the same state and every mutation flows through
the same transactional engine, so stats, stock levels, documents and the activity log always agree with each other.

All data lives in your browser's `localStorage`; there is no backend, no server requirement and no sign-in.
The demo ships with a realistic sample dataset for a Pakistani retail "demo mart" (PKR, three locations).

---

## Modules (16)

| #  | Module              | What it does |
|----|---------------------|--------------|
| 1  | **Dashboard**       | KPI cards (stock on hand, inventory value, low stock, expiry alerts), weekly sales & category mix charts, low stock/expiry hotlists, recent activity. |
| 2  | **Warehouse**       | Master product list per location — on-hand by product, create/edit products, product detail with batch breakdown, stock adjustments. |
| 3  | **Inventory**       | Whole-company stock matrix: on hand vs available (reservations excluded) per location, batch drilldown, filters & CSV export. |
| 4  | **Stock Receiving** | Post supplier receipts against purchase orders/`PO` or direct deliveries; new batches created with expiry, weighted-average cost recalculated. |
| 5  | **Stock Issuance**  | Issue stock out of a location for shop replenishment, branch transfer, internal use or writing off expired goods (FEFO-aware). |
| 6  | **Stock Transfers** | Full **pending → in-transit → received** workflow between locations. Creating *reserves* stock; dispatch moves it out; receiving credits the destination with the original batches; cancellation is safe both before and after dispatch. |
| 7  | **Point of Sale**   | Cart, per-line discounts, payment with change calculation (cash/card/credit), live stock checks, printable thermal-style receipt, expired-stock guard. |
| 8  | **Sales History**   | Searchable/filterable register of all sales with receipt preview, returns, CSV export. |
| 9  | **Suppliers**       | Supplier directory with contact info, linked products, purchase history and delete-protection when products reference a supplier. |
| 10 | **Customers**       | Customer directory with sales engagement stats; delete-protection keeps receipts referencing a customer intact. |
| 11 | **Categories**      | Color-coded product categories with usage stats; delete-protection while assigned to products. |
| 12 | **Expiry Management** | FEFO-oriented expiry dashboard: expired / expiring-soon batches by location with direct **write-off** and replace actions — plus a **Dead stock** tab (batch rows for products with no movement beyond the threshold, editable in Settings), which the dashboard's Dead-stock cards deep-link into. |
| 13 | **Top Selling Products** | Ranking of the best movers for a chosen window (7/30/90 days or all time): units sold net of returns, revenue, catalog share, stock status per product, direct CSV export and Inventory deep-links. |
| 14 | **Reports & Analytics** | Report builder across sales, stock, expiry, supplier & transfer data with preview table and CSV/JSON download. |
| 15 | **Activity Log**    | Every mutation recorded: who, what, when, which product/location/sign — searchable and filterable. |
| 16 | **Settings**        | Store name, operator, currency & date format, low-stock threshold behavior, light/dark theme, notification preferences, demo reset & JSON backup. |

---

## Domain rules baked into the engine

- **Money is stored as integer minor units** (paisa, i.e. `Rs 145.00` = `14500`); floating point is never used for money math.
- **FEFO (First-Expired-First-Out)** batch consumption for sales, issuance and adjustments — the batch expiring soonest leaves first.
- **Expired stock can never be sold**: POS and issuance both refuse expired batches.
- **Transfer reservations**: pending transfers lock quantities at the source (`available = on hand − reserved`); in-transit units are counted at *neither* location; receiving restores the *exact* batches (expiry + cost travel with the goods); cancelling is safe (release reservation before dispatch, return to source batches after dispatch).
- **Weighted-average cost** recalculated on receipts and mixed into the destination on transfers.
- **Referential protection**: suppliers, customers and categories linked to live records cannot be deleted.
- **Full audit trail**: every document (receipt, issue, transfer, adjustment, sale, return) and every edit lands in the activity log with operator, timestamp and quantity delta.

---

## Quick start

```bash
npm install
npm run dev        # start the dev server (Vite, default http://localhost:5173)
```

Other scripts:

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm run lint       # ESLint over the project
```

---

## Deploying to Vercel

The app uses **hash routing** (`/#/dashboard`), so no SPA rewrites are required — any static host works:

1. Push this folder to a git repo.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Framework preset **Vite** (or *Other/Static*); build command `npm run build`, output directory `dist`.
4. Deploy. Your URL opens straight into the dashboard with seeded demo data in the visitor's browser.

No environment variables are needed. Note that `localStorage` is per-browser — each visitor gets their own
independent dataset, and server-side redirects are unnecessary thanks to hash routing.

---

## Demo data

First launch writes a generated sample dataset to `localStorage` under the key `stockflow_demo_state_v1`.
An in-memory fallback keeps the app running in private-mode browsers where storage is unavailable.

**Deterministic master data** — 34 products across 9 categories, 7 suppliers, 5 customers, 2 shops +
1 warehouse, 71 seeded stock batches with expiry dates, 18 supplier receipts, 6 transfers, 7 issues,
3 adjustments and seeded notification history.

**Randomized history** — around 100 sales receipts spread over the last ~76 days (1–4 per day, wholesale
and retail mix), which also feeds the activity log. Every *Reset Demo* therefore produces the **same master
data but a freshly randomized sales history**, so counts of receipts/sales/activity differ slightly between
resets. This is intentional: the demo should look like a plausible month at a Pakistani mart, not a fixed recording.

**Demo-mode operator** — the seeded data and sessions run as “Demo Operator” at the “StockFlow Demo Mart”,
and mutating actions you perform are recorded under your operator name.

### Resetting

- **In-app reset:** Settings → *Reset demo* discards all session changes and restores the sample dataset.
- **Browser reset:** clearing site data / local storage has the same effect (equivalent to a factory reset).

A JSON backup of the complete state can be copied from Settings at any time.

---

## Project structure

```
src/
├── App.jsx                     # app shell + hash router
├── main.jsx
├── components/
│   ├── charts/                 # recharts wrappers (sales trend, category mix)
│   ├── common/                 # shared UI: modals, fields, badges, confirm dialogs
│   ├── layout/                 # sidebar, topbar, notification panel
│   ├── pos/Receipt.jsx         # printable POS receipt
│   └── warehouse/              # product form, product detail, adjust dialog
├── context/InventoryContext.jsx  # React context: perform(action) → commit → save → toast
├── data/demoData.js            # synthetic demo dataset builder
├── hooks/useHashRoute.js       # tiny hash-based router (no dependency)
├── pages/                      # one module per page (16 files)
├── services/
│   ├── inventoryEngine.js      # THE single source of truth — all domain transactions
│   ├── persistenceService.js   # localStorage load/save/reset/backup
│   └── reportingService.js     # tabular report builders (sales, stock, expiry …)
├── styles/                     # hand-written CSS (light/dark themes, no UI framework)
└── utils/                      # currency, dates, validation, CSV, ids, constants
```

Key implementation notes:

- React **19**, plain JavaScript (no TypeScript), hand-written CSS with CSS variables for theming,
  `lucide-react` icons and `recharts` charts. No UI framework, no router dependency.
- **One engine, one state tree**: pages never mutate state directly — they call
  `perform(engine.someAction, payload)` and the context commits the returned state, persists to
  `localStorage` and surfaces a toast. Failed validations return structured `{ ok: false, error }`
  results, shown inline or as toasts.

---

## Known demo limitations

- Single-user, client-only; no real multi-user, authentication or server sync (operator name is a setting, not a login).
- Partial/upfront payments are not modeled — sales are fully paid in one of cash/card/credit at checkout.
- Product, supplier, customer and category deletion is guarded rather than cascaded: linked documents must stay intact.
- The production bundle is a single ~946 kB JS chunk (≈263 kB gzipped) because charting (recharts) is imported statically; lazy-loading routes would split it.
- Report previews are capped for on-screen rendering (the CSV/JSON downloads always export the full dataset).
- Local storage keeps only a fresh seed-building session's data per browser; sharing datasets between machines isn't supported.

---

*StockFlow is a demonstration project: realistic enough to shop-test inventory workflows end-to-end, disposable by design.*
