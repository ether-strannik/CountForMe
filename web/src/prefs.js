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

// How loud each thing the app plays is, in decibels up or down from
// the level it ships at. Zero is that level, so a slider never
// touched changes nothing.
const DB_MAX = 12;
/** a whole number of decibels within the range the sliders offer */
const decibels = (v) => Math.max(-DB_MAX, Math.min(DB_MAX, Math.round(+v || 0)));

let cueDb = decibels(loadStr('timer.cuedb', '0'));
let voiceDb = decibels(loadStr('timer.voicedb', '0'));

/** the cue sounds, in decibels from the shipped level */
export const cueVolume = () => cueDb;
/** @param {number} db */
export function setCueVolume(db) {
  cueDb = decibels(db);
  saveStr('timer.cuedb', String(cueDb));
}

/** the spoken counts, in decibels from the shipped level */
export const voiceVolume = () => voiceDb;
/** @param {number} db */
export function setVoiceVolume(db) {
  voiceDb = decibels(db);
  saveStr('timer.voicedb', String(voiceDb));
}

/** keep the screen on for as long as the app is up */
export const keepScreenOn = () => awake;
/** @param {boolean} on */
export function setKeepScreenOn(on) {
  awake = !!on;
  saveStr('timer.awake', awake ? '1' : '0');
}
