// src/utils/identifiers.js
// Unique ID + document reference helpers.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Human-readable, prefix-tagged unique id. e.g. "prd_k3j9x2m1q7" */
export function newId(prefix, size = 10) {
  let s = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const bytes = new Uint8Array(size);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < size; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  } else {
    for (let i = 0; i < size; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}_${s}`;
}

/** Padded document reference from a persisted counter. e.g. "RCV-0042" */
export function makeRef(prefix, counter) {
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

export function padNum(n, width = 4) {
  return String(n).padStart(width, '0');
}
