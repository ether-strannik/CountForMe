// The settings the app owns, as state: the tab to open on, the knock
// seconds before an event, and whether the screen stays on. The
// Settings page draws these and calls the setters. The screens that
// need a value read it here, never from that page's controls.
import { loadStr, saveStr } from './storage.js';

/** seconds, whole and never negative; anything unreadable is 0 */
const seconds = (v) => Math.max(0, Math.round(+v || 0));

let startTab = loadStr('timer.startTab', 'timer');
let approach = seconds(loadStr('timer.approach', '3'));
let awake = loadStr('timer.awake', '0') === '1';

/** the tab to show on launch */
export const getStartTab = () => startTab;
/** @param {string} tab */
export function setStartTab(tab) {
  startTab = tab;
  saveStr('timer.startTab', startTab);
}

/** knock seconds before an event; 0 = off */
export const approachSec = () => approach;
/** @param {number} n  seconds; clamped here, so a caller passes what it has */
export function setApproach(n) {
  approach = seconds(n);
  saveStr('timer.approach', String(approach));
}

/** keep the screen on for as long as the app is up */
export const keepScreenOn = () => awake;
/** @param {boolean} on */
export function setKeepScreenOn(on) {
  awake = !!on;
  saveStr('timer.awake', awake ? '1' : '0');
}
