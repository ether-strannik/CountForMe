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

// Reload mark: put a started timer back to its full duration. Sits in
// the same button as the pencil, which it replaces once a timer runs.
export const RELOAD_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M19.933 13.041a8 8 0 1 1 -9.925 -8.788c3.899 -1 7.935 1.007 9.425 4.747"/>' +
  '<path d="M20 4v5h-5"/></svg>';

// Pencil edit glyph (timer cards). Stroked in the button's own colour
// rather than a named one, so a theme reaches it with nothing to set.
// `currentColor` is a keyword, not a custom property, so it is safe in
// an attribute where `var()` above was not.
export const PENCIL_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/>' +
  '<path d="M13.5 6.5l4 4"/></svg>';

// The music controls. Drawn rather than typed: the play and pause
// characters render at different weights and sizes from one font to
// the next, and two buttons that swap have to be the same shape.
//
// Two wrappers, because the transport marks are solid and the switches
// beside them are outlined. That difference is the point rather than
// an accident: play, pause, previous and next do something, while
// shuffle and repeat only say what is set.
const SOLID = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">';
const STROKE =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';

export const PLAY_SVG =
  SOLID + '<path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z"/></svg>';

export const PAUSE_SVG =
  SOLID +
  '<path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/>' +
  '<path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/></svg>';

export const PREV_SVG =
  SOLID +
  '<path d="M19.496 4.136l-12 7a1 1 0 0 0 0 1.728l12 7a1 1 0 0 0 1.504 -.864v-14a1 1 0 0 0 -1.504 -.864z"/>' +
  '<path d="M4 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z"/></svg>';

export const NEXT_SVG =
  SOLID +
  '<path d="M3 5v14a1 1 0 0 0 1.504 .864l12 -7a1 1 0 0 0 0 -1.728l-12 -7a1 1 0 0 0 -1.504 .864z"/>' +
  '<path d="M20 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z"/></svg>';

export const FOLDER_SVG =
  SOLID +
  '<path d="M9 3a1 1 0 0 1 .608 .206l.1 .087l2.706 2.707h6.586a3 3 0 0 1 2.995 2.824l.005 .176v8a3 3 0 0 1 ' +
  '-2.824 2.995l-.176 .005h-14a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-11a3 3 0 0 1 2.824 -2.995l.176 -.005h4z"/></svg>';

export const VOLUME_SVG =
  STROKE +
  '<path d="M15 8a5 5 0 0 1 0 8"/>' +
  '<path d="M17.7 5a9 9 0 0 1 0 14"/>' +
  '<path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"/>' +
  '</svg>';

export const SHUFFLE_SVG =
  STROKE +
  '<path d="M18 4l3 3l-3 3"/>' +
  '<path d="M18 20l3 -3l-3 -3"/>' +
  '<path d="M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5"/>' +
  '<path d="M21 7h-5a4.978 4.978 0 0 0 -3 1m-4 8a4.984 4.984 0 0 1 -3 1h-3"/></svg>';

const REPEAT_LOOP =
  '<path d="M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3"/>' + '<path d="M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3"/>';

export const REPEAT_SVG = STROKE + REPEAT_LOOP + '</svg>';

// The same loop with a 1 inside it: the queue is not repeated, the one
// song is. Drawn here rather than given, so it is the one mark on
// these buttons that is not from the set.
export const REPEAT_ONE_SVG = STROKE + REPEAT_LOOP + '<path d="M11 11l1 -1v4"/></svg>';
