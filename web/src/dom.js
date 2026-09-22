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

// Circle-minus delete mark, drawn to sit in a bordered button beside
// the pencil. Distinct from MINUS_SVG above: that one is a filled disc
// standing on its own, this one is an outline inside a frame.
export const CIRCLE_MINUS_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>' +
  '<path d="M9 12l6 0"/></svg>';

// Pencil edit glyph (timer cards). Stroked in the button's own colour
// rather than a named one, so a theme reaches it with nothing to set.
// `currentColor` is a keyword, not a custom property, so it is safe in
// an attribute where `var()` above was not.
export const PENCIL_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/>' +
  '<path d="M13.5 6.5l4 4"/></svg>';
