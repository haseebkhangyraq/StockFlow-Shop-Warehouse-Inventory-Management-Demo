// src/data/demoData.js
// Builds the original demonstration dataset. Runs ONCE on first launch (or on
// "Reset Demo"), then everything the user does lives in localStorage state.
//
// Consistency notes:
// - Stock exists ONLY as batch records; product/location totals are derived from
//   batches in the inventory engine, so all sums agree by construction.
// - Seeded historical documents (receipts, issues, transfers, sales) are clearly
//   marked `isSeeded: true`, created once, and never re-generated on app open.

import { newId, padNum } from '../utils/identifiers';
import { dayKey } from '../utils/dates';

/* ------------------------------------------------------------------ */
/* Deterministic PRNG so every reset produces the same dataset.        */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260210);
const ri = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/** ISO timestamp "daysAgo" days in the past, at a demo-friendly hour. */
function ago(daysAgo, hh = ri(9, 18), mm = ri(0, 59)) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hh, mm, ri(0, 59), 0);
  return d.toISOString();
}
const todayKey = () => dayKey(new Date());
const dayKeyOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const dayKeyToIso = (key, hh = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hh, 0, 0).toISOString();
};

/* ------------------------------------------------------------------ */
/* Master data                                                         */
/* ------------------------------------------------------------------ */

const LOCATIONS = [
  { id: 'loc_wh', name: 'Main Warehouse', type: 'warehouse', address: 'Plot 14, Industrial Area Sector B' },
  { id: 'loc_shop1', name: 'Main Shop', type: 'shop', address: 'Shop 4, Central Plaza, Main Boulevard' },
  { id: 'loc_shop2', name: 'Secondary Shop', type: 'shop', address: 'Unit 9, Riverside Market' },
];

const CATEGORIES = [
  { id: 'cat_food', name: 'Food & Grocery', color: '#e07a3f' },
  { id: 'cat_bev', name: 'Beverages', color: '#3f7fe0' },
  { id: 'cat_toys', name: 'Toys', color: '#e03f8f' },
  { id: 'cat_stuffed', name: 'Stuffed Toys', color: '#b03fe0' },
  { id: 'cat_stationery', name: 'Stationery', color: '#3fae7a' },
  { id: 'cat_household', name: 'Household Items', color: '#3fb5e0' },
  { id: 'cat_personal', name: 'Personal Care', color: '#7a6ff0' },
  { id: 'cat_electronics', name: 'Electronics', color: '#5b6472' },
  { id: 'cat_other', name: 'Other Products', color: '#96a0ae' },
];

const SUPPLIERS_DEF = [
  { id: 'sup_freshfarm', companyName: 'FreshFarm Foods Ltd.', contactPerson: 'Imran Sheikh', phone: '+92 300 5551201', email: 'orders@freshfarm-demo.pk', address: 'Cold Store 6, Sabzi Mandi Road', notes: 'Bulk grocery supplier. Net 30 payment terms.' },
  { id: 'sup_dairy', companyName: 'EverFresh Beverages & Dairy', contactPerson: 'Rabia Noor', phone: '+92 301 5558844', email: 'sales@everfresh-demo.pk', address: 'Factory 2, Hyeri Chowk', notes: 'Delivers Mon/Thu. Chilled goods.' },
  { id: 'sup_playworld', companyName: 'PlayWorld Toys Co.', contactPerson: 'Daniyal Akram', phone: '+92 321 5557712', email: 'daniyal@playworld-demo.pk', address: 'Warehouse 11, Toy Market Lane', notes: 'Toy import partner; seasonal catalog.' },
  { id: 'sup_softkids', companyName: 'SoftKids Plush Works', contactPerson: 'Maria Yousaf', phone: '+92 333 5559810', email: 'maria@softkids-demo.pk', address: 'Unit 3, Cottage Industry Road', notes: 'Handmade plush; custom embroidery available.' },
  { id: 'sup_creative', companyName: 'Creative Kids & Office Supplies', contactPerson: 'Zeeshan Tariq', phone: '+92 345 5552211', email: 'zeeshan@creativekids-demo.pk', address: 'Shop 22, Stationery Bazaar', notes: '5% discount on full-carton ream orders.' },
  { id: 'sup_home', companyName: 'HomeEssence Trading', contactPerson: 'Sadia Kamran', phone: '+92 302 5556678', email: 'sadia@homeessence-demo.pk', address: 'Godown 5, Industrial Estate', notes: 'Household + personal care distributor.' },
  { id: 'sup_bright', companyName: 'BrightTech Electronics', contactPerson: 'Omar Farooq', phone: '+92 300 5550931', email: 'omar@brighttech-demo.pk', address: 'Hall 1, Electronics Market Tower', notes: 'Defective returns accepted within 7 days.' },
];

const P = (id, sku, name, cat, unit, cost, sell, reorder, sup, opts = {}) => ({
  id, sku, name, categoryId: cat, unit, costPrice: cost, sellPrice: sell,
  reorderLevel: reorder, supplierId: sup, ...opts,
});

const PRODUCTS_DEF = [
  // ---- Food & Grocery -------------------------------------------------
  P('prd_rice',     'FG-001', 'Basmati Rice 5kg Pack',       'cat_food', 'pack',   1850_00, 2350_00, 20, 'sup_freshfarm', { trackExpiry: true,  trackBatch: true, description: 'Premium aged basmati, 5kg retail pack.' }),
  P('prd_oil',      'FG-002', 'Sunflower Cooking Oil 3L',    'cat_food', 'carton', 1450_00, 1820_00, 18, 'sup_freshfarm', { trackExpiry: true,  description: 'Cooking oil can, 3 litre.' }),
  P('prd_sugar',    'FG-003', 'White Sugar 2kg',             'cat_food', 'pack',    225_00,  280_00, 25, 'sup_freshfarm', { trackExpiry: true,  trackBatch: true, description: 'Refined white sugar, 2kg poly pack.' }),
  P('prd_flour',    'FG-004', 'Wheat Flour 10kg',            'cat_food', 'bag',     980_00, 1180_00, 15, 'sup_freshfarm', { trackExpiry: true,  description: 'Fine chakki atta, 10kg bag.' }),
  P('prd_lentils',  'FG-005', 'Red Lentils 1kg',             'cat_food', 'pack',    245_00,  310_00, 30, 'sup_freshfarm', { trackExpiry: true,  description: 'Sorted masoor daal.' }),
  P('prd_salt',     'FG-006', 'Iodized Table Salt 800g',     'cat_food', 'pack',     52_00,   75_00, 40, 'sup_freshfarm', { description: 'Iodized refined salt.' }),
  // ---- Beverages -------------------------------------------------------
  P('prd_water',    'BV-001', 'Mineral Water 1.5L',          'cat_bev',  'pcs',      42_00,   60_00, 60, 'sup_dairy', { trackExpiry: true, description: 'Bottled drinking water, 1.5 litre.' }),
  P('prd_cola',     'BV-002', 'Cola Soft Drink 330ml ×24',   'cat_bev',  'box',    1180_00, 1440_00, 12, 'sup_dairy', { trackExpiry: true,  trackBatch: true, description: 'Canned cola, case of 24.' }),
  P('prd_coffee',   'BV-003', 'Instant Coffee Jar 100g',     'cat_bev',  'pcs',     525_00,  660_00, 20, 'sup_dairy', { trackExpiry: true, description: 'Freeze-dried instant coffee.' }),
  P('prd_greentea', 'BV-004', 'Green Tea 50 Tea Bags',       'cat_bev',  'box',     430_00,  540_00, 30, 'sup_dairy', { trackExpiry: true, description: 'Green tea, box of 50 bags.' }),
  // ---- Toys -------------------------------------------------------------
  P('prd_blocks',   'TY-001', 'Building Blocks Set 120pcs',  'cat_toys', 'set',     680_00,  990_00, 15, 'sup_playworld', { description: 'Colourful interlocking blocks, age 3+.' }),
  P('prd_rccar',    'TY-002', 'RC Racing Car 1:14',          'cat_toys', 'pcs',    1720_00, 2280_00,  8, 'sup_playworld', { description: 'Remote-control car incl. rechargeable pack.' }),
  P('prd_puzzle',   'TY-003', 'Wooden Puzzle Set 4pc',       'cat_toys', 'set',     390_00,  580_00, 12, 'sup_playworld', { description: 'Wooden peg puzzles in a gift box.' }),
  // ---- Stuffed toys -----------------------------------------------------
  P('prd_teddy',    'ST-001', 'Teddy Bear 45cm',             'cat_stuffed', 'pcs',  615_00,  890_00, 12, 'sup_softkids', { description: 'Super-soft brown teddy bear.' }),
  P('prd_bunny',    'ST-002', 'Plush Bunny 30cm',            'cat_stuffed', 'pcs',  420_00,  640_00, 15, 'sup_softkids', { description: 'White bunny with ribbon.' }),
  P('prd_dino',     'ST-003', 'Dinosaur Plush Toy',          'cat_stuffed', 'pcs',  550_00,  790_00, 10, 'sup_softkids', { description: 'Green T-rex figure 35cm.' }),
  // ---- Stationery -------------------------------------------------------
  P('prd_paper',    'SN-001', 'A4 Copier Paper Ream 500',    'cat_stationery', 'ream', 610_00, 740_00, 30, 'sup_creative', { description: '70gsm bright white A4 ream.' }),
  P('prd_pens',     'SN-002', 'Ballpoint Pens 10-pack',      'cat_stationery', 'pack',  95_00, 145_00, 60, 'sup_creative', { description: 'Smooth blue ink pens, box of 10.' }),
  P('prd_notebook', 'SN-003', 'Hardcover Notebook 200pg',    'cat_stationery', 'pcs',  285_00, 410_00, 40, 'sup_creative', { description: 'A5 hardbound ruled notebook.' }),
  P('prd_pencils',  'SN-004', 'HB Pencils 12-pack',          'cat_stationery', 'pack', 110_00, 175_00, 50, 'sup_creative', { description: 'Pre-sharpened HB pencils, eraser tips.' }),
  // ---- Household --------------------------------------------------------
  P('prd_dishwash', 'HH-001', 'Dishwash Liquid 1L',          'cat_household', 'pcs',   395_00, 560_00, 25, 'sup_home', { trackExpiry: true,  trackBatch: true, description: 'Lemon dishwashing liquid.' }),
  P('prd_floor',    'HH-002', 'Floor Cleaner 2L',            'cat_household', 'pcs',   560_00, 760_00, 20, 'sup_home', { trackExpiry: true, description: 'Pine-fresh disinfectant floor cleaner.' }),
  P('prd_deterg',   'HH-003', 'Laundry Detergent 5kg',       'cat_household', 'pack', 1020_00, 1290_00, 15, 'sup_home', { trackExpiry: true,  trackBatch: true, description: 'Machine-wash detergent powder.' }),
  P('prd_airf',     'HH-004', 'Air Freshener Spray 300ml',   'cat_household', 'pcs',   340_00, 480_00, 24, 'sup_home', { trackExpiry: true, description: 'Aerosol freshener, floral.' }),
  // ---- Personal care ----------------------------------------------------
  P('prd_shampoo',  'PC-001', 'Herbal Shampoo 500ml',        'cat_personal', 'pcs',    475_00, 650_00, 24, 'sup_home', { trackExpiry: true, description: 'Anti-hairfall herbal shampoo.' }),
  P('prd_soap',     'PC-002', 'Moisturizing Soap 4-pack',    'cat_personal', 'pack',   310_00, 430_00, 40, 'sup_home', { trackExpiry: true, description: 'Cream soap bars, pack of 4.' }),
  P('prd_toothp',   'PC-003', 'Toothpaste 150g',             'cat_personal', 'pcs',    215_00, 300_00, 40, 'sup_home', { trackExpiry: true, description: 'Cavity-protection toothpaste.' }),
  P('prd_sani',     'PC-004', 'Hand Sanitizer 500ml',        'cat_personal', 'pcs',    270_00, 380_00, 30, 'sup_home', { trackExpiry: true, description: 'Gel sanitizer, 70% alcohol.' }),
  // ---- Electronics ------------------------------------------------------
  P('prd_bulb',     'EL-001', 'LED Bulb 12W',                'cat_electronics', 'pcs', 245_00, 380_00, 50, 'sup_bright', { description: 'Energy-saving warm white bulb.' }),
  P('prd_power',    'EL-002', 'Power Bank 10000mAh',         'cat_electronics', 'pcs', 1560_00, 2150_00, 10, 'sup_bright', { description: 'Dual-USB fast-charge power bank.' }),
  P('prd_cable',    'EL-003', 'USB-C Cable 1m',              'cat_electronics', 'pcs', 180_00, 320_00, 40, 'sup_bright', { description: 'Braided 60W USB-C charging cable.' }),
  P('prd_mouse',    'EL-004', 'Wireless Mouse',              'cat_electronics', 'pcs', 680_00, 960_00, 15, 'sup_bright', { description: '2.4GHz silent-click mouse.' }),
  // ---- Other ------------------------------------------------------------
  P('prd_giftwrap', 'OTH-001', 'Gift Wrapping Paper Roll',   'cat_other', 'roll',   145_00, 235_00, 20, 'sup_creative', { description: '2m printed gift wrap roll.' }),
  P('prd_tote',     'OTH-002', 'Canvas Tote Bag',            'cat_other', 'pcs',    350_00, 550_00, 15, 'sup_creative', { description: 'Reusable cotton tote bag.' }),
];

/*
 * Net stock per location — declared as CURRENT batch state.
 * Story targets: 3 out-of-stock products, ~5 low, 3 expired batches,
 * ~5 near-expiry batches, 2 overstocked, 3 dead-stock products.
 */
const STOCK_DEF = {
  prd_rice:     { loc_wh: [{ q: 16, exp: 210 }] },                                            // 16 < reorder 20 → LOW
  prd_oil:      { loc_wh: [{ q: 22, exp: 300 }], loc_shop1: [{ q: 9, exp: 210 }], loc_shop2: [{ q: 5, exp: 180 }] },
  prd_sugar:    { loc_wh: [{ q: 30, exp: 290 }], loc_shop1: [{ q: 25, exp: 12, b: 'SG-0912' }], loc_shop2: [{ q: 18, exp: 240 }] },
  prd_flour:    { loc_wh: [{ q: 26, exp: 150 }], loc_shop1: [{ q: 14, exp: 95 }] },
  prd_lentils:  { loc_wh: [{ q: 34, exp: 330 }], loc_shop2: [{ q: 12, exp: 270 }] },
  prd_salt:     { loc_wh: [{ q: 60 }], loc_shop1: [{ q: 35 }], loc_shop2: [{ q: 22 }] },
  prd_water:    { loc_wh: [{ q: 90, exp: 150 }, { q: 40, exp: 75 }], loc_shop1: [{ q: 55, exp: 9, b: 'WTR-771' }, { q: 20, exp: 130 }], loc_shop2: [{ q: 30, exp: 160 }] },
  prd_cola:     { loc_wh: [{ q: 20, exp: -5, b: 'CL-3307' }, { q: 14, exp: 320, b: 'CL-3402' }], loc_shop1: [{ q: 18, exp: 300 }] },   // expired batch
  prd_coffee:   { loc_wh: [{ q: 8, exp: -2, b: 'CF-1189' }, { q: 17, exp: 380, b: 'CF-1204' }], loc_shop2: [{ q: 6, exp: 350 }] },     // expired batch
  prd_greentea: { loc_wh: [{ q: 24, exp: 25, b: 'GT-0523' }, { q: 6, exp: 410 }] },           // LOW + near expiry
  prd_blocks:   { loc_wh: [{ q: 21 }], loc_shop1: [{ q: 11 }], loc_shop2: [{ q: 7 }] },
  prd_rccar:    { loc_wh: [{ q: 9 }], loc_shop1: [{ q: 4 }] },
  prd_puzzle:   { loc_wh: [{ q: 8 }] },                                                        // dead stock
  prd_teddy:    { loc_wh: [{ q: 13 }], loc_shop1: [{ q: 6 }], loc_shop2: [{ q: 3 }] },
  prd_bunny:    { loc_wh: [{ q: 17 }], loc_shop1: [{ q: 8 }] },
  prd_dino:     {},                                                                            // OUT OF STOCK
  prd_paper:    { loc_wh: [{ q: 160 }], loc_shop1: [{ q: 80 }] },                              // OVERSTOCKED
  prd_pens:     { loc_wh: [{ q: 380 }], loc_shop1: [{ q: 70 }] },                              // OVERSTOCKED
  prd_notebook: { loc_wh: [{ q: 46 }], loc_shop1: [{ q: 28 }], loc_shop2: [{ q: 15 }] },
  prd_pencils:  { loc_wh: [{ q: 65 }], loc_shop1: [{ q: 35 }] },
  prd_dishwash: { loc_wh: [{ q: 19, exp: 80 }], loc_shop1: [{ q: 15, exp: 21, b: 'DW-P321' }] },
  prd_floor:    { loc_wh: [{ q: 18, exp: 7, b: 'FL-0219' }, { q: 8, exp: 260 }] },             // near expiry
  prd_deterg:   { loc_wh: [{ q: 12, exp: 340, b: 'LD-3310' }] },                               // LOW
  prd_airf:     { loc_wh: [{ q: 11, exp: -30, b: 'AF-1111' }, { q: 12, exp: 130 }], loc_shop1: [{ q: 9, exp: 95 }] }, // expired batch
  prd_shampoo:  { loc_wh: [{ q: 20, exp: 70 }, { q: 5, exp: -1, b: 'HS-0021' }], loc_shop1: [{ q: 6, exp: -1, b: 'HS-0021' }] }, // expired @ both
  prd_soap:     { loc_wh: [{ q: 30, exp: 330 }] },                                             // LOW (nothing at shops)
  prd_toothp:   { loc_wh: [{ q: 44, exp: 540 }], loc_shop1: [{ q: 30, exp: 520 }], loc_shop2: [{ q: 18, exp: 500 }] },
  prd_sani:     { loc_wh: [{ q: 28, exp: 95 }], loc_shop2: [{ q: 14, exp: 85 }] },
  prd_bulb:     { loc_wh: [{ q: 40 }] },                                                       // LOW
  prd_power:    {},                                                                            // OUT OF STOCK
  prd_cable:    { loc_wh: [{ q: 52 }], loc_shop1: [{ q: 18 }] },
  prd_mouse:    { loc_wh: [{ q: 14 }], loc_shop2: [{ q: 6 }] },
  prd_giftwrap: { loc_wh: [{ q: 15 }] },                                                       // dead stock
  prd_tote:     { loc_wh: [{ q: 9 }] },                                                        // dead stock
};

/** Long-ago movement dates (days ago) for dead-stock storytelling. */
const LAST_MOVEMENT_DAYS = { prd_giftwrap: 120, prd_tote: 138, prd_puzzle: 96 };

/* ------------------------------------------------------------------ */
/* Seed builder                                                        */
/* ------------------------------------------------------------------ */

export function buildSeedState() {
  const batches = [];
  let btN = 0;
  const batchId = () => `bt_s${padNum(++btN, 5)}`;

  const products = PRODUCTS_DEF.map((p, i) => ({
    ...p,
    barcode: `p84${padNum(1200 + i * 37, 6)}`,
    status: 'active',
    createdAt: ago(ri(140, 500)),
    description: p.description || '',
    lastMovementAt: null, // filled below from seeded documents
  }));

  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  // --- current stock batches --------------------------------------------
  for (const p of products) {
    const def = STOCK_DEF[p.id] || {};
    for (const loc of LOCATIONS) {
      for (const b of def[loc.id] || []) {
        if (!b.q) continue;
        const exp = b.exp ?? (p.trackExpiry ? ri(200, 400) : null);
        batches.push({
          id: batchId(),
          productId: p.id,
          locationId: loc.id,
          batchNo: b.b || (p.trackBatch ? `${p.sku}-B${ri(10, 99)}` : 'BASE'),
          expDate: exp != null ? dayKeyToIso(dayKeyOffset(exp)) : null,
          mfgDate: p.trackExpiry ? dayKeyToIso(dayKeyOffset(b.m ?? -180)) : null,
          qty: b.q,
          cost: p.costPrice,
          receivedAt: ago(ri(3, 40)),
          source: 'seed',
        });
      }
    }
  }

  const activity = [];
  const notifications = [];
  const movementDates = {};
  const bumpMovement = (pid, iso) => {
    if (!pid) return;
    if (!movementDates[pid] || iso > movementDates[pid]) movementDates[pid] = iso;
  };
  const addActivity = (o) => activity.push({ id: newId('act'), isSeeded: true, ...o });
  const addNotification = (o) => notifications.push({ id: newId('ntf'), isSeeded: true, ...o });
  const locName = (locId) => LOCATIONS.find((l) => l.id === locId)?.name || locId;

  // dead-stock products: an explicit "archive" note at their last movement
  for (const [pid, days] of Object.entries(LAST_MOVEMENT_DAYS)) {
    const iso = ago(days, ri(10, 17));
    movementDates[pid] = iso;
    addActivity({ at: iso, action: 'archive_note', refId: 'History archive', productId: pid, locationId: 'loc_wh', qtyDelta: null, description: `Archive note: last recorded movement for “${byId[pid].name}” before the demonstration period.` });
  }

  // --- seeded receipts (last ~55 days) ----------------------------------
  const receipts = [];
  let rcvN = 0;
  const receiptStory = [
    [55, 'prd_oil',      'sup_freshfarm', 30], [52, 'prd_water',  'sup_dairy', 120], [48, 'prd_blocks', 'sup_playworld', 40],
    [44, 'prd_paper',    'sup_creative', 150], [40, 'prd_shampoo','sup_home',   36], [38, 'prd_teddy',  'sup_softkids',  20],
    [34, 'prd_coffee',   'sup_dairy',     31], [30, 'prd_toothp', 'sup_home',   92], [26, 'prd_pens',   'sup_creative', 480],
    [22, 'prd_flour',    'sup_freshfarm', 40], [19, 'prd_dishwash','sup_home',  34], [16, 'prd_cable',  'sup_bright',    70],
    [12, 'prd_bunny',    'sup_softkids',  25], [10, 'prd_sani',   'sup_home',   42], [ 7, 'prd_lentils','sup_freshfarm', 46],
    [ 4, 'prd_greentea', 'sup_dairy',     30], [ 2, 'prd_rccar',  'sup_playworld',13], [ 1, 'prd_sugar',  'sup_freshfarm', 73],
  ];
  for (const [dBack, pid, supId, qty] of receiptStory) {
    const p = byId[pid];
    rcvN++;
    const ref = `RCV-${padNum(rcvN, 4)}`;
    const iso = ago(dBack);
    receipts.push({
      id: newId('rcv'), ref, supplierId: supId, locationId: 'loc_wh',
      invoiceNo: `INV-${padNum(ri(1000, 9999), 4)}`, date: iso.slice(0, 10),
      notes: 'Seeded receiving document — demonstration history.',
      createdAt: iso, isSeeded: true,
      lines: [{
        productId: pid, qty, unitCost: p.costPrice,
        batchNo: p.trackBatch ? `${p.sku}-B${ri(10, 99)}` : '',
        expDate: p.trackExpiry ? dayKeyToIso(dayKeyOffset(ri(160, 420))) : null,
        mfgDate: null,
      }],
    });
    bumpMovement(pid, iso);
    addActivity({ at: iso, action: 'stock_receipt', refId: ref, productId: pid, locationId: 'loc_wh', qtyDelta: qty, description: `Seeded receipt ${ref}: ${qty} ${p.unit} of “${p.name}” received at Main Warehouse.` });
    if (dBack <= 3) addNotification({ at: iso, type: 'receipt', title: 'Stock received', message: `${ref}: ${qty} ${p.unit} of ${p.name} received at Main Warehouse (seeded history).` });
  }

  // --- seeded transfers --------------------------------------------------
  const transfers = [];
  let trfN = 0;
  const trfStory = [
    [40, 'loc_wh', 'loc_shop1', [['prd_cola', 60], ['prd_water', 48]], 'received'],
    [30, 'loc_wh', 'loc_shop2', [['prd_dishwash', 20], ['prd_shampoo', 18]], 'received'],
    [20, 'loc_wh', 'loc_shop1', [['prd_pens', 100]], 'cancelled'],
    [12, 'loc_wh', 'loc_shop1', [['prd_rice', 10], ['prd_sugar', 15]], 'received'],
    [1,  'loc_wh', 'loc_shop1', [['prd_bulb', 30], ['prd_notebook', 24]], 'in_transit'],
    [0,  'loc_wh', 'loc_shop2', [['prd_deterg', 12], ['prd_soap', 20]], 'pending'],
  ];
  for (const [dBack, src, dst, lines, status] of trfStory) {
    trfN++;
    const ref = `TRF-${padNum(trfN, 4)}`;
    const createdAt = ago(dBack + 1, 9);
    const dispatchedAt = dBack === 0 && status === 'pending' ? null : ago(Math.max(0, dBack), 12);
    const history = [{ status: 'pending', at: createdAt }];
    if (dispatchedAt) history.push({ status: 'in_transit', at: dispatchedAt });
    if (status === 'received') history.push({ status: 'received', at: ago(Math.max(0, dBack), 16) });
    if (status === 'cancelled') history.push({ status: 'cancelled', at: ago(Math.max(0, dBack), 14) });
    transfers.push({
      id: newId('trf'), ref, sourceLocationId: src, destinationLocationId: dst,
      notes: 'Seeded transfer record — demonstration history.',
      lines: lines.map(([pid, qty]) => ({ productId: pid, qty, batchAllocations: [] })),
      status, createdAt, dispatchedAt,
      receivedAt: status === 'received' ? ago(Math.max(0, dBack), 16) : null,
      cancelledAt: status === 'cancelled' ? ago(Math.max(0, dBack), 14) : null,
      history, isSeeded: true,
    });
    const iso = dispatchedAt || createdAt;
    for (const [pid, qty] of lines) {
      bumpMovement(pid, iso);
      addActivity({ at: iso, action: 'transfer', refId: ref, productId: pid, locationId: src, qtyDelta: -qty, description: `Seeded transfer ${ref} (${status.replace('_', ' ')}): ${qty} × ${byId[pid].name} → ${locName(dst)}.` });
    }
  }

  // --- seeded issues -----------------------------------------------------
  const issues = [];
  let issN = 0;
  const issueStory = [
    [35, 'loc_wh',    'internal_use',    [['prd_paper', 6], ['prd_pens', 24]], 'Office & stationery use for store ops'],
    [28, 'loc_wh',    'damaged_stock',   [['prd_blocks', 3]], 'Carton crushed on rack — scrapped'],
    [22, 'loc_wh',    'expired_stock',   [['prd_airf', 6]], 'Expired aerosols disposed per policy'],
    [17, 'loc_wh',    'branch_transfer', [['prd_teddy', 8]], 'Sent to partner stall at weekend fair'],
    [11, 'loc_shop1', 'internal_use',    [['prd_water', 12]], 'Staff refreshments during inventory week'],
    [6,  'loc_wh',    'damaged_stock',   [['prd_bulb', 5]], 'Transit damage — cracked bulbs scrapped'],
    [3,  'loc_shop2', 'expired_stock',   [['prd_shampoo', 4]], 'Shelf-life expiry removal'],
  ];
  for (const [dBack, src, reason, lines, note] of issueStory) {
    issN++;
    const ref = `ISS-${padNum(issN, 4)}`;
    const iso = ago(dBack);
    issues.push({
      id: newId('iss'), ref, sourceLocationId: src, reason,
      destination: reason === 'branch_transfer' ? 'Weekend Fair Stall' : reason === 'internal_use' ? 'Store operations' : 'Disposed (write-off)',
      reference: '', notes: note,
      lines: lines.map(([pid, qty]) => ({ productId: pid, qty })),
      createdAt: iso, isSeeded: true,
    });
    for (const [pid, qty] of lines) {
      bumpMovement(pid, iso);
      addActivity({ at: iso, action: 'stock_issue', refId: ref, productId: pid, locationId: src, qtyDelta: -qty, description: `Seeded issuance ${ref} (${reason.replace(/_/g, ' ')}): ${qty} × ${byId[pid].name}.` });
    }
  }

  // --- seeded adjustments ------------------------------------------------
  const adjustments = [];
  let adjN = 0;
  const adjStory = [
    [33, 'prd_paper',  'loc_wh',    165, 160, 'stock_count', 'Monthly count variance'],
    [21, 'prd_bunny',  'loc_wh',    19,  17,  'stock_count', 'Shelf recount'],
    [8,  'prd_sani',   'loc_shop2', 16,  14,  'supplier_short', 'Short 2 units found vs delivery note'],
  ];
  for (const [dBack, pid, locId, prev, next, reason, note] of adjStory) {
    adjN++;
    const ref = `ADJ-${padNum(adjN, 4)}`;
    const iso = ago(dBack);
    adjustments.push({ id: newId('adj'), ref, productId: pid, locationId: locId, previousQty: prev, adjustedQty: next, reason, notes: note, operator: 'Demo Operator', createdAt: iso, isSeeded: true });
    bumpMovement(pid, iso);
    addActivity({ at: iso, action: 'adjustment', refId: ref, productId: pid, locationId: locId, qtyDelta: next - prev, description: `Seeded stock adjustment ${ref}: ${byId[pid].name} @ ${locName(locId)} changed ${prev} → ${next}.` });
  }

  // --- seeded customers --------------------------------------------------
  const customers = [
    { id: 'cus_hamza', name: 'Hamza Ali', phone: '+92 311 4420987', email: '', notes: 'Regular walk-in customer', createdAt: ago(120), isSeeded: true },
    { id: 'cus_sara',  name: 'Sara Khan', phone: '+92 313 9087712', email: 'sara.k@example.com', notes: 'Prefers eco-friendly products', createdAt: ago(90), isSeeded: true },
    { id: 'cus_bilal', name: 'Bilal Mart (wholesale)', phone: '+92 321 7711204', email: 'orders@bilalmart-demo.pk', notes: 'Bulk buyer — receives 5% standing discount', createdAt: ago(210), isSeeded: true },
    { id: 'cus_noor',  name: 'Noor Family', phone: '+92 305 6612340', email: '', notes: 'Monthly grocery basket', createdAt: ago(70), isSeeded: true },
    { id: 'cus_ali',   name: 'Ali Raza', phone: '+92 334 5509821', email: '', notes: 'Neighbourhood regular', createdAt: ago(45), isSeeded: true },
  ];
  const custIds = customers.map((c) => c.id);

  // --- seeded sales over ~76 days ----------------------------------------
  // Salable pool: dead-stock products are excluded (they do not move).
  const pool = products.map((p) => p.id).filter((pid) => !LAST_MOVEMENT_DAYS[pid]);
  const hotPool = ['prd_water', 'prd_cola', 'prd_pens', 'prd_notebook', 'prd_soap', 'prd_toothp', 'prd_pencils', 'prd_paper', 'prd_bunny', 'prd_blocks', 'prd_teddy', 'prd_salt', 'prd_oil', 'prd_shampoo', 'prd_dishwash', 'prd_deterg', 'prd_rice', 'prd_cable', 'prd_lentils', 'prd_greentea'];

  const sales = [];
  for (let dBack = 76; dBack >= 0; dBack--) {
    let count;
    if (dBack === 0) count = ri(2, 3);
    else if (dBack < 14) count = ri(1, 4);
    else if (dBack < 40) count = ri(0, 3);
    else count = ri(0, 2);
    for (let s = 0; s < count; s++) {
      const iso = dBack === 0 ? ago(0, ri(9, 12)) : ago(dBack, ri(10, 20));
      const wholesale = rnd() < 0.12;
      const locId = rnd() < 0.8 ? 'loc_shop1' : 'loc_shop2';
      const nLines = ri(1, 3);
      const lines = [];
      for (let li = 0; li < nLines; li++) {
        const pid = pick(rnd() < 0.65 ? hotPool : pool);
        if (lines.some((l) => l.productId === pid)) continue;
        const qty = wholesale ? ri(2, 6) : ri(1, 3);
        lines.push({ productId: pid, qty, unitPrice: byId[pid].sellPrice, discount: 0, batchAllocations: [] });
      }
      if (lines.length === 0) continue;
      const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
      const discPct = wholesale ? 5 : rnd() < 0.12 ? pick([3, 5, 10]) : 0;
      const discount = Math.round((subtotal * discPct) / 100);
      const total = subtotal - discount;
      const method = pick(wholesale ? ['card', 'cash'] : ['cash', 'cash', 'cash', 'card', 'card', 'other']);
      const received = method === 'cash' ? Math.max(total, Math.round((total * 1.06) / 500) * 500) : total;
      sales.push({
        id: newId('sal'), locationId: locId,
        lines, subtotal, discount, discountType: discPct ? 'pct' : 'amount', discountValue: discPct,
        tax: 0, total, paymentMethod: method, amountReceived: received, change: Math.max(0, received - total),
        paymentStatus: 'paid', customerId: rnd() < 0.5 ? pick(custIds) : null,
        status: 'completed', returnedTotal: 0, returns: [], notes: '',
        createdAt: iso, isSeeded: true,
      });
      for (const l of lines) {
        bumpMovement(l.productId, iso);
        addActivity({ at: iso, action: 'sale', refId: 'POS', productId: l.productId, locationId: locId, qtyDelta: -l.qty, description: `Seeded POS sale: ${l.qty} × ${byId[l.productId].name} at ${locName(locId)}.` });
      }
    }
  }
  sales.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  sales.forEach((s, i) => { s.ref = `SAL-${padNum(i + 1, 4)}`; s.receiptNo = s.ref; });
  for (const s of sales) {
    if (s.createdAt >= ago(0, 0)) {
      addNotification({ at: s.createdAt, type: 'sale', title: 'Sale completed', message: `${s.receiptNo} — ${s.lines.length} item line(s) via ${s.paymentMethod.toUpperCase()} (seeded demonstration sale).` });
    }
  }

  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  // --- product movement dates --------------------------------------------
  for (const p of products) {
    p.lastMovementAt = movementDates[p.id] || p.createdAt;
  }

  return {
    schemaVersion: 1,
    seededAt: new Date().toISOString(),
    locations: LOCATIONS,
    categories: CATEGORIES,
    suppliers: SUPPLIERS_DEF.map((s) => ({ ...s, createdAt: ago(ri(200, 500)), isSeeded: true })),
    customers,
    products,
    batches,
    receipts,
    issues,
    transfers,
    sales,
    adjustments,
    activity,
    notifications,
    counters: { rcv: rcvN, iss: issN, trf: trfN, sal: sales.length, adj: adjN, ret: 0 },
    settings: {
      storeName: 'StockFlow Demo Mart',
      contactPhone: '+92 300 5550100',
      contactEmail: 'hello@stockflow-demo.pk',
      contactAddress: '12 Central Plaza, Main Boulevard, Gulberg III',
      currency: 'PKR',
      dateFormat: 'MMM DD, YYYY',
      expiryWarningDays: 30,
      deadStockDays: 90,
      taxRatePct: 0,
      receiptFooter: 'Thank you for shopping with StockFlow Demo Mart!',
      theme: 'light',
      operator: 'Demo Operator',
    },
  };
}
