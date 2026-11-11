// src/utils/print.js
// Print utility for generating print-friendly output from page data.
// Provides a print button that opens a printable window with the current view.

import { downloadCSV } from './csv';

// Default print styles optimized for business reports
const defaultPrintStyles = `
  @page {
    size: auto;
    margin: 15mm 15mm 15mm 15mm;
  }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
    color: #18181b;
    background: white;
  }
  a { color: inherit; text-decoration: none; }
  .print-header {
    padding: 10px 15px;
    border-bottom: 1px solid #d1d5db;
    margin-bottom: 20px;
  }
  .print-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }
  .print-sub {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 5px 0 0 0;
  }
  .print-section {
    padding: 10px 15px;
  }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th {
    background: #f9fafb;
    color: #18181b;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid #e5e7eb;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.875rem;
  }
  tr:nth-child(even) td {
    background: #f3f4f6;
  }
  .cell-num {
    text-align: right;
  }
  .muted { color: #6b7280; }
  .small-text { font-size: 0.75rem; }
  .no-data { padding: 20px; text-align: center; color: #6b7280; }
  button, .btn { display: none; } /* Hide buttons in print */
  .page-enter { margin: 0; }
  .desktop-sidebar { display: none; }
  .mobile-drawer { display: none; }
  .toast-host { display: none; }
  .modal { display: none; }
  .search { display: none; }
  .pagination { margin: 10px 0; }
`;

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
    title = '',               // Page title to show at top
    filename = 'print',       // Default filename for the print window
    addCss = true,            // Whether to add default print styles
    tolerateErrors = true,    // Don't throw if something fails
    customCss = '',           // Additional custom CSS to include
    theme = 'default',        // Theme: 'default', 'light', 'dark'
    showHeader = true,        // Whether to show the print header with title
  } = options;

  // Apply theme-specific adjustments
  let themeCss = '';
  if (theme === 'dark') {
    themeCss = `
      body { color: e5e7eb; background: #18181b; }
      th { background: #3f3f46; color: e5e7eb; }
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

  // Create a printable window
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (!tolerateErrors) throw new Error('Popup blocked');
    console.error('Popup blocked for print');
    return;
  }

  // Wait for window to load
  printWindow.onload = () => {
    try {
      const doc = printWindow.document;

      // Write print document
      doc.open();
      doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Print Preview'}</title>
  <style>
    @page {
      size: auto;
      margin: 15mm 15mm 15mm 15mm;
    }
    ${defaultPrintStyles}
    ${themeCss}
    ${customCss ? `<style>${customCss}</style>` : ''}
  </style>
</head>
<body>
  ${showHeader && title ? `
  <div class="print-header">
    <h1 class="print-title">${title}</h1>
  </div>` : ''}
  
  ${element ? `
  <div class="print-section">
    ${element.innerHTML}
  </div>` : `
  <div class="print-section no-data">
    No data to print
  </div>`}

  <script>
    window.onafterprint = () => {
      setTimeout(() => { printWindow.close(); }, 500);
    };
    window.onbeforeprint = () => {
      // Ensure prints starts clean
    };
  </script>
</body>
</html>`);

      doc.close();
      printWindow.print();
    } catch (e) {
      if (tolerateErrors) console.error('Print error:', e);
      else throw e;
    }
  };

  // Trigger print after a small delay to ensure content is ready
  setTimeout(() => {
    try { printWindow.print(); } catch (e) {
      if (tolerateErrors) console.error('Print trigger error:', e);
    }
  }, 100);
}

// Print the current page's main content area (excluding sidebar/navbar)
// Useful for pages where you want to print the data table/report
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
  // First download CSV
  downloadCSV(filename, rows, columns);
  
  // After a delay, print (the CSV file will be in downloads)
  setTimeout(() => {
    if (options.onAfterCsv) options.onAfterCsv();
    window.print();
  }, 500);
}