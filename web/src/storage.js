// The one seam to localStorage. Every read tolerates a missing or broken
// value and every write tolerates a full or disabled store — the board
// keeps running on defaults either way.

/** JSON value, or `fallback` when the key is absent, empty, or unparsable */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** JSON value; a failed write is dropped */
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled — keep going in memory */
  }
}

/** raw string, or `fallback` only when the key is absent ("" is kept) */
export function loadStr(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** raw string; a failed write is dropped */
export function saveStr(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or disabled — keep going in memory */
  }
}
