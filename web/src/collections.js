// What a tab owns, offered to export and import without giving up the
// keys. A screen registers its collection once; the transfer sheet
// (xfer.js) lists what is registered, reads entries, and puts new ones.
// The owner keeps its storage, its ids and its rendering.

/**
 * @typedef {object} Entry          a name on screen and plain data
 * @property {string} label
 * @property {any} item
 *
 * @typedef {object} Collection
 * @property {string} label          the tab's name, for the sheet
 * @property {() => Entry[]} entries what exists, in display order
 * @property {(label: string, item: any) => boolean} put   add one; false when the item is not valid
 */

/** @type {Map<string, Collection>} */
const cols = new Map();

/** @param {string} id  @param {Collection} c */
export function registerCollection(id, c) {
  cols.set(id, c);
}

/** every registered collection, in registration order */
export const collections = () => [...cols.entries()].map(([id, c]) => ({ id, ...c }));

/** one collection by id, or undefined */
export const collection = (id) => cols.get(id);
