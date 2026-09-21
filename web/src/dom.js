// DOM leaves: id lookups typed by what the page puts at that id, the
// selector query every module uses, and the one shared glyph.

/** @param {string} id */
export const $ = (id) => document.getElementById(id);
/** an <input> — @param {string} id */
export const $in = (id) => /** @type {HTMLInputElement} */ ($(id));
/** a <select> — @param {string} id */
export const $sel = (id) => /** @type {HTMLSelectElement} */ ($(id));
/** a <button> — @param {string} id */
export const $btn = (id) => /** @type {HTMLButtonElement} */ ($(id));
/** every element matching a selector — @param {string} q */
export const $$ = (q) => /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(q));

// Shrink an element's text until it fits its own width, starting from
// whatever the stylesheet gives it. A run screen's count grows with the
// round and rep numbers, and forty reps over ten rounds runs off the
// side of the phone at the size one round of eight is comfortable at.
// Measured only when the text changes, so it costs nothing per frame.
const fitted = new WeakMap();
/** @param {HTMLElement} el @param {number} [min] smallest px to go down to */
export function fitText(el, min = 14) {
  if (fitted.get(el) === el.textContent) return;
  fitted.set(el, el.textContent);
  el.style.fontSize = ''; // back to the stylesheet's responsive size
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (size > min && el.scrollWidth > el.clientWidth) {
    size -= 2;
    el.style.fontSize = size + 'px';
  }
}

// Circle-minus delete glyph (timer cards, Intervals2 rows). The fills go
// through a style attribute, not a fill attribute, because that is where
// a custom property is read reliably — so a theme reaches this too.
export const MINUS_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="12" r="11" style="fill:var(--glyph)"/>' +
  '<rect x="6" y="11" width="12" height="2" rx="1" style="fill:var(--text)"/></svg>';
