// Profiles file: one collection's items as one JSON document, and the
// merge rules for bringing such a file in. Pure: strings and objects in,
// strings and objects out.

const FORMAT = 'timer-profiles';
const VERSION = 3;

/**
 * the file's text
 * @param {string} kind  the collection id
 * @param {{label: string, item: any}[]} items
 */
export function packProfiles(kind, items) {
  return JSON.stringify({ format: FORMAT, version: VERSION, kind, items }, null, 2);
}

/**
 * A library as a file: whole categories with their presets inside, and
 * loose presets alongside. Version 3 — a category is the thing someone
 * shares, so it travels as one rather than as a flattened list.
 * @param {string} kind  the collection id
 * @param {{name: string, items: {label: string, item: any}[]}[]} cats
 * @param {{label: string, item: any}[]} items  presets in no category
 */
export function packLibrary(kind, cats, items) {
  return JSON.stringify({ format: FORMAT, version: VERSION, kind, cats, items }, null, 2);
}

const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** the {label, item} entries in a list, dropping anything malformed */
const entries = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((e) => isMap(e) && typeof e.label === 'string' && e.label.trim() && isMap(e.item))
    .map((e) => ({ label: e.label.trim(), item: e.item }));

/**
 * A file's contents: the categories it carries and the presets in
 * none. Only the current version is read — nothing else has ever been
 * released, so an older file is a file from a development build.
 * @returns {{kind: string, cats: {name: string, items: {label: string, item: any}[]}[],
 *            items: {label: string, item: any}[]} | null}
 *   null when it is not a profiles file
 */
export function unpackProfiles(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isMap(doc) || doc.format !== FORMAT || doc.version !== VERSION) return null;
  if (typeof doc.kind !== 'string') return null;
  const cats = (Array.isArray(doc.cats) ? doc.cats : [])
    .filter((c) => isMap(c) && typeof c.name === 'string' && c.name.trim())
    .map((c) => ({ name: c.name.trim(), items: entries(c.items) }));
  return { kind: doc.kind, cats, items: entries(doc.items) };
}

/** two items are the same setup */
export const sameItem = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * What an import would do, item by item, with nothing overwritten:
 * a new label is added; the same label with the same setup is skipped;
 * the same label with a different setup comes in as "label (2)".
 * @param {{label: string, item: any}[]} existing
 * @param {{label: string, item: any}[]} incoming
 * @param {Set<number>} picked   indexes into `incoming` the user kept
 * @returns {{label: string, item: any, action: 'add'|'skip'|'rename', as: string}[]}
 */
export function planMerge(existing, incoming, picked) {
  const taken = new Set(existing.map((e) => e.label));
  const have = new Map(existing.map((e) => [e.label, e.item]));
  return incoming
    .map((e, i) => ({ ...e, i }))
    .filter((e) => picked.has(e.i))
    .map(({ label, item }) => {
      if (!have.has(label)) {
        taken.add(label);
        return { label, item, action: 'add', as: label };
      }
      if (sameItem(have.get(label), item)) return { label, item, action: 'skip', as: label };
      let n = 2;
      let as = `${label} (${n})`;
      while (taken.has(as)) as = `${label} (${++n})`;
      taken.add(as);
      have.set(as, item);
      return { label, item, action: 'rename', as };
    });
}

/** a default file name: timer-<kind>-YYYYMMDD.json */
export function fileName(kind, date) {
  const p = (n) => String(n).padStart(2, '0');
  return `timer-${kind}-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.json`;
}

/** the name the user typed, as a .json file name; "" when unusable */
export function cleanFileName(s) {
  const base = String(s || '')
    .trim()
    .replace(/[/\\]/g, '')
    .replace(/\.json$/i, '');
  return base ? base + '.json' : '';
}
