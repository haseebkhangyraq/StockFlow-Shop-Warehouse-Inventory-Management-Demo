// src/utils/print.js
// Print utilities.
// - printReport(): renders a structured business report (header, summary cards,
//   data tables) from plain data — this is what every module's Print button uses.
// - printElement()/printPageContent(): print a live DOM subtree as a fallback.

import { downloadCSV } from './csv';

// Shared print styles for page dumps
const defaultPrintStyles = `
  @page { size: auto; margin: 15mm 15mm 15mm 15mm; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0; padding: 0; color: #18181b; background: white;
  }
  a { color: inherit; text-decoration: none; }
  .print-header { padding: 10px 15px; border-bottom: 1px solid #d1d5db; margin-bottom: 20px; }
  .print-title { font-size: 1.25rem; font-weight: 600; margin: 0; }
  .print-sub { font-size: 0.875rem; color: #6b7280; margin: 5px 0 0 0; }
  .print-section { padding: 10px 15px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #f9fafb; color: #18181b; font-size: 0.75rem; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 0.875rem; }
  tr:nth-child(even) td { background: #f3f4f6; }
  .cell-num { text-align: right; }
  .muted { color: #6b7280; }
  .small-text { font-size: 0.75rem; }
  .no-data { padding: 20px; text-align: center; color: #6b7280; }
  button, .btn { display: none; }
  .page-enter { margin: 0; }
  .desktop-sidebar { display: none; }
  .mobile-drawer { display: none; }
  .toast-host { display: none; }
  .modal { display: none; }
  .modal-overlay { display: none; }
  .search { display: none; }
  .global-search { display: none; }
  .toolbar .search { display: none; }
  .card-head-right { display: none; }
  .page-head-actions { display: none; }
  .line-row { display: none; }
  .form-grid { display: none; }
  .divider { display: none; }
  .no-print { display: none !important; }
  .field-error, .field-hint { display: none; }
  .pagination { margin: 10px 0; }
`;

// Styles for printReport() — clean business-report layout
const reportStyles = `
  @page { size: auto; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0; padding: 0; color: #18181b; background: white; font-size: 12px;
  }
  .rp-wrap { max-width: 100%; padding: 0; }
  .rp-head { border-bottom: 2.5px solid #18181b; padding-bottom: 12px; margin-bottom: 16px; }
  .rp-brand { font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #6d28d9; }
  .rp-brand span { color: #9ca3af; font-weight: 600; letter-spacing: 0.08em; }
  .rp-title { font-size: 20px; font-weight: 750; margin: 6px 0 2px; }
  .rp-subtitle { font-size: 12px; color: #4b5563; }
  .rp-stamp { font-size: 10.5px; color: #6b7280; margin-top: 5px; }
  .rp-meta { display: flex; flex-wrap: wrap; gap: 4px 22px; margin: 0 0 14px; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
  .rp-meta div { font-size: 11px; color: #4b5563; }
  .rp-meta b { color: #18181b; font-weight: 700; margin-left: 4px; }
  .rp-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .rp-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 9px 11px; background: #fafafa; }
  .rp-card .k { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; }
  .rp-card .v { font-size: 15px; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; word-break: break-word; }
  .rp-sec { margin-bottom: 18px; page-break-inside: auto; }
  .rp-sec h2 { font-size: 12.5px; font-weight: 750; margin: 0 0 7px; padding: 5px 0; border-bottom: 1.5px solid #d1d5db; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #374151; padding: 6px 9px; border-bottom: 1.5px solid #d1d5db; }
  td { padding: 6px 9px; border-bottom: 1px solid #f3f4f6; font-size: 11.5px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.totals td { border-top: 2px solid #18181b; border-bottom: none; font-weight: 800; background: #f9fafb !important; }
  .rp-note { margin-top: 14px; padding: 9px 12px; border: 1px solid #e5e7eb; border-left: 3px solid #6d28d9; border-radius: 6px; background: #faf5ff; font-size: 11px; color: #4b5563; }
  .rp-foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  .rp-empty { padding: 14px; text-align: center; color: #9ca3af; border: 1px dashed #e5e7eb; border-radius: 8px; }
  @media print { .rp-sec { page-break-inside: auto; } tr { page-break-inside: avoid; } }
`;

const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function openPrintWindow(fullHtml, docTitle, tolerateErrors) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (!tolerateErrors) throw new Error('Popup blocked');
    console.error('Popup blocked for print');
    return;
  }

  try {
    const doc = printWindow.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();
  } catch (e) {
    if (tolerateErrors) console.error('Print error:', e);
    else throw e;
  }

  const doPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch (e) {
      if (tolerateErrors) console.error('Print trigger error:', e);
    }
  };
  if (printWindow.document.readyState === 'complete') setTimeout(doPrint, 150);
  else printWindow.onload = doPrint;
}

function wrapDocument(bodyHtml, docTitle, styles) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle || 'Print Preview')}</title>
  <style>${styles}</style>
</head>
<body>
${bodyHtml}
  <script>
    window.onafterprint = function () {
      setTimeout(function () { window.close(); }, 300);
    };
  <\/script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* printReport — structured business report                            */
/* ------------------------------------------------------------------ */

/**
 * Print a clean, formatted report built from plain data (not the live DOM).
 *
 * @param {object} opts
 * @param {string}  opts.title      Report title, e.g. "Sales Report"
 * @param {string}  [opts.subtitle] Period / scope line under the title
 * @param {Array}   [opts.meta]     [{ label, value }] info chips (location, supplier…)
 * @param {Array}   [opts.summary]  [{ label, value }] key figures shown as cards
 * @param {Array}   [opts.sections] [{ heading?, columns: [{label, numeric?}]|string[], rows: any[][], totals?: any[] }]
 * @param {string}  [opts.note]     Highlighted footnote (methodology, disclaimers…)
 * @param {boolean} [opts.tolerateErrors]
 */
export function printReport({
  title = 'Report',
  subtitle,
  meta = [],
  summary = [],
  sections = [],
  note,
  tolerateErrors = true,
} = {}) {
  const generatedAt = new Date().toLocaleString();

  const metaHtml = meta.length
    ? `<div class="rp-meta">${meta.map((m) => `<div>${escapeHtml(m.label)}:<b>${escapeHtml(m.value)}</b></div>`).join('')}</div>`
    : '';

  const cardsHtml = summary.length
    ? `<div class="rp-cards">${summary.map((s) => `
        <div class="rp-card"><div class="k">${escapeHtml(s.label)}</div><div class="v">${escapeHtml(s.value)}</div></div>`).join('')}</div>`
    : '';

  const sectionsHtml = sections.map((sec) => {
    const cols = sec.columns.map((c) => (typeof c === 'string' ? { label: c } : c));
    const head = cols.map((c) => `<th${c.numeric ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('');
    const body = (sec.rows || []).map((row) => `
        <tr>${row.map((cell, i) => `<td${cols[i]?.numeric ? ' class="num"' : ''}>${escapeHtml(cell === null || cell === undefined || cell === '' ? '—' : cell)}</td>`).join('')}</tr>`).join('');
    const totals = sec.totals ? `
        <tr class="totals">${sec.totals.map((cell, i) => `<td${cols[i]?.numeric ? ' class="num"' : ''}>${escapeHtml(cell === null || cell === undefined || cell === '' ? '' : cell)}</td>`).join('')}</tr>` : '';
    const table = (sec.rows || []).length || sec.totals
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}${totals}</tbody></table>`
      : `<div class="rp-empty">Nothing to show in this section</div>`;
    return `<div class="rp-sec">${sec.heading ? `<h2>${escapeHtml(sec.heading)}</h2>` : ''}${table}</div>`;
  }).join('');

  const bodyHtml = `
  <div class="rp-wrap">
    <div class="rp-head">
      <div class="rp-brand">StockFlow <span>· Inventory Suite</span></div>
      <div class="rp-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="rp-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <div class="rp-stamp">Generated ${escapeHtml(generatedAt)}</div>
    </div>
    ${metaHtml}
    ${cardsHtml}
    ${sectionsHtml || '<div class="rp-empty">No data to report</div>'}
    ${note ? `<div class="rp-note">${escapeHtml(note)}</div>` : ''}
    <div class="rp-foot"><span>StockFlow demo — all data lives in this browser only</span><span>${escapeHtml(generatedAt)}</span></div>
  </div>`;

  openPrintWindow(wrapDocument(bodyHtml, title, reportStyles), title, tolerateErrors);
}

/* ------------------------------------------------------------------ */
/* DOM-dump printing (fallback)                                        */
/* ------------------------------------------------------------------ */

// Prepare a DOM node for printing: clone it, copy live input/select/textarea
// values into attributes (React sets properties, not attributes, so plain
// innerHTML would print empty fields) and strip interactive-only chrome.
function serializeForPrint(element) {
  const clone = element.cloneNode(true);

  clone.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked) el.setAttribute('checked', '');
      else el.removeAttribute('checked');
    } else {
      el.setAttribute('value', el.value);
    }
    if (el.tagName === 'SELECT') {
      Array.from(el.options).forEach((o) => {
        if (o.selected) o.setAttribute('selected', '');
        else o.removeAttribute('selected');
      });
    }
    if (el.tagName === 'TEXTAREA') el.textContent = el.value;
  });

  // Buttons, search boxes and other controls are meaningless on paper
  clone.querySelectorAll(
    'button, .btn, .icon-btn, .global-search, .toolbar .search, .pagination, .toast-host, .modal, .modal-overlay, .no-print',
  ).forEach((el) => el.remove());

  return clone.innerHTML;
}

// Print a specific HTML element or content with print-friendly styling
export function printElement(elementIdOrRef, options = {}) {
  const element = typeof elementIdOrRef === 'string'
    ? document.getElementById(elementIdOrRef)
    : elementIdOrRef;

  if (!element) {
    console.warn('Print element not found:', elementIdOrRef);
    return;
  }

  const {
    title = '',
    tolerateErrors = true,
    customCss = '',
    theme = 'default',
    showHeader = true,
  } = options;

  let themeCss = '';
  if (theme === 'dark') {
    themeCss = `
      body { color: #e5e7eb; background: #18181b; }
      th { background: #3f3f46; color: #e5e7eb; }
      td { border-color: #3f3f46; }
      tr:nth-child(even) td { background: #3a3a3c; }
    `;
  } else if (theme === 'high-contrast') {
    themeCss = `
      body { color: #000; background: #fff; }
      th { background: #fff; color: #000; border-color: #000; }
      td { border-color: #000; }
    `;
  }

  const generatedAt = new Date().toLocaleString();
  const contentHtml = serializeForPrint(element);

  const bodyHtml = `
  ${showHeader && title ? `
  <div class="print-header">
    <h1 class="print-title">${escapeHtml(title)}</h1>
    <p class="print-sub">StockFlow · generated ${escapeHtml(generatedAt)}</p>
  </div>` : ''}

  <div class="print-section">
    ${contentHtml || '<div class="no-data">No data to print</div>'}
  </div>`;

  openPrintWindow(wrapDocument(bodyHtml, title, `${defaultPrintStyles}${themeCss}${customCss}`), title, tolerateErrors);
}

// Print the current page's main content area (excluding sidebar/navbar)
export function printPageContent(options = {}) {
  const content = document.getElementById('page-content');
  if (!content) {
    console.warn('page-content element not found');
    return;
  }
  printElement(content, { ...options, title: options.title || 'StockFlow Print Preview' });
}

// Print a specific table by its class or ID
export function printTable(tableElement, options = {}) {
  if (!tableElement) {
    console.warn('Table element not found');
    return;
  }
  printElement(tableElement, { ...options, title: options.title || 'Table Print Preview' });
}

// Generate a CSV-then-print workflow: download CSV and then print
export function printAsCSVThenPrint(filename, rows, columns, options = {}) {
  downloadCSV(filename, rows, columns);
  setTimeout(() => {
    if (options.onAfterCsv) options.onAfterCsv();
    window.print();
  }, 500);
}
