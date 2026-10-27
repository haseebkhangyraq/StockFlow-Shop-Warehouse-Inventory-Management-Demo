// src/utils/csv.js
// CSV export utility with proper escaping and a BOM so Excel opens UTF-8 correctly.

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // detect formula injection
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows, columns) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvCell(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function downloadCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
