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

// Whether a theme's own music is used at all. Off, the theme is its
// colours and its cues, and the player is a player over the user's own
// folders with nothing loaded into it.
let themeSongs = loadStr('timer.thememusic', '1') === '1';

/** play what the theme carries */
export const themeMusic = () => themeSongs;
/** @param {boolean} on */
export function setThemeMusic(on) {
  themeSongs = !!on;
  saveStr('timer.thememusic', themeSongs ? '1' : '0');
}

// How the queue is played. Set once and left, like everything else
// here, rather than something to put back every time the app opens.
let shuffle = loadStr('timer.shuffle', '0') === '1';
let repeat = loadStr('timer.repeat', 'off');

/** play the queue in a jumbled order */
export const musicShuffle = () => shuffle;
/** @param {boolean} on */
export function setMusicShuffle(on) {
  shuffle = !!on;
  saveStr('timer.shuffle', shuffle ? '1' : '0');
}

/** what the end of a song does: off, all, or one */
export const musicRepeat = () => repeat;
/** @param {string} mode */
export function setMusicRepeat(mode) {
  repeat = mode === 'all' || mode === 'one' ? mode : 'off';
  saveStr('timer.repeat', repeat);
}

// ---- the duck ----
// The music has no level of its own to set: it plays at the file's
// own, and the only thing that ever moves it is a cue. These four say
// what that move is. Depth is how far it drops. Gap is how much
// silence has to follow a cue before the music is allowed back up, so
// cues closer together than this keep it down instead of pumping it
// between every one. The two fades are how fast it moves each way,
// and they are not the same: down has to beat the cue's attack, up has
// to be slow enough not to draw attention to itself.
//
// All four are the user's. The pair that would normally be fixed in
// code is here too, because the sweet spot is found by ear on the
// phone and not guessed at a desk.

/** @param {string|number} v @param {number} lo @param {number} hi */
const within = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));

let duckDb = within(loadStr('timer.duckdb', '-12'), -24, 0);
let duckGapSec = within(loadStr('timer.duckgap', '10'), 1, 30);
let duckDownMs = within(loadStr('timer.duckdown', '50'), 10, 300);
let duckUpMs = within(loadStr('timer.duckup', '500'), 100, 2000);

/** how far the music drops under a cue, in decibels; never a lift */
export const duckDepth = () => duckDb;
/** @param {number} db */
export function setDuckDepth(db) {
  duckDb = within(db, -24, 0);
  saveStr('timer.duckdb', String(duckDb));
}

/** seconds of quiet a cue must be followed by before the music comes back */
export const duckGap = () => duckGapSec;
/** @param {number} sec */
export function setDuckGap(sec) {
  duckGapSec = within(sec, 1, 30);
  saveStr('timer.duckgap', String(duckGapSec));
}

/** milliseconds to take the music down */
export const duckDown = () => duckDownMs;
/** @param {number} ms */
export function setDuckDown(ms) {
  duckDownMs = within(ms, 10, 300);
  saveStr('timer.duckdown', String(duckDownMs));
}

/** milliseconds to bring it back */
export const duckUp = () => duckUpMs;
/** @param {number} ms */
export function setDuckUp(ms) {
  duckUpMs = within(ms, 100, 2000);
  saveStr('timer.duckup', String(duckUpMs));
}

/** keep the screen on for as long as the app is up */
export const keepScreenOn = () => awake;
/** @param {boolean} on */
export function setKeepScreenOn(on) {
  awake = !!on;
  saveStr('timer.awake', awake ? '1' : '0');
}
