// Sound engine: one AudioContext, and a decoded file per event.
//
// A choice names one of two places. `pack:<name>` is a sound shipped in
// the app, under `sounds/`, listed by `sounds/index.json` because there
// is no server here to scan the folder. Anything else is a file in the
// folder the user picked, read through files.js. The prefix is what
// keeps a shipped `gong.mp3` and the user's own `gong.mp3` apart.
//
// Every event has a shipped default, so the app makes real sounds out
// of the box with no folder chosen. The synth below is the last resort
// only: a device that cannot decode an MP3 still gets a cue.
//
// Everything a run plays goes on the audio clock in advance. The audio
// thread keeps running when the page is hidden and the animation frame
// loop does not, so a cue that was scheduled still sounds while the
// user is in another app. Nothing here waits for a timer to fire.
import { load, save } from './storage.js';
import { readFile } from './files.js';

let ac = null;
export function audioCtx() {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  ac = ac || new AC();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
/**
 * @param {number} freq @param {number} dur @param {string} [type]
 * @param {number} [vol]
 * @param {number} [at]  on the audio clock; now when left out. Scheduling
 *                       ahead puts the sound on the audio thread, which
 *                       does not need JavaScript to be running to play it.
 */
export function tone(freq, dur, type, vol, at) {
  try {
    const c = audioCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = at === undefined ? c.currentTime : at;
    g.gain.setValueAtTime(vol || 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
    return o;
  } catch {
    return null; // no audio on this device — silent
  }
}

// The last resort, one per event, reached only when the chosen file
// cannot be decoded. Every note is placed on the audio clock rather
// than chained with a timer, so a two-note cue scheduled for later
// arrives whole even with no JavaScript running.
const synth = {
  prepare: (t) => [tone(520, 0.18, 'sine', 0.4, t)],
  main: (t) => [tone(1175, 0.12, 'triangle', 0.5, t), tone(1568, 0.26, 'triangle', 0.5, t + 0.11)],
  turn: (t) => [tone(700, 0.14, 'square', 0.4, t), tone(700, 0.14, 'square', 0.4, t + 0.15)],
  approach: (t) => [tone(880, 0.15, 'sine', 0.3, t)],
  rest: (t) => [tone(660, 0.14, 'sine', 0.4, t), tone(520, 0.2, 'sine', 0.4, t + 0.12)],
  end: (t) => [tone(440, 0.6, 'sine', 0.45, t)],
};

export const EVENTS = ['approach', 'prepare', 'main', 'turn', 'rest', 'end'];

/** a choice with this prefix is a sound shipped in the app */
export const PACK = 'pack:';

/** what each event plays when the user has never chosen for it */
export const DEFAULTS = {
  prepare: 'clock-ticking.mp3',
  main: 'gong.mp3',
  turn: 'bell-4.mp3',
  approach: 'piano-3.mp3',
  rest: 'wine-glass.mp3',
  end: 'flute.mp3',
};

/** the shipped sounds, by the order of their names; [] if the index is gone */
export async function packList() {
  try {
    const names = await (await fetch('sounds/index.json')).json();
    return Array.isArray(names) ? names : [];
  } catch {
    return [];
  }
}

const choice = load('timer.sounds', {});
const saveChoice = () => save('timer.sounds', choice);

/**
 * What an event plays: the user's choice, or its shipped default.
 * An empty stored value is a choice never made — older versions wrote
 * one to mean "the beep", and the beep is no longer an option.
 */
export const chosen = (key) => choice[key] || PACK + DEFAULTS[key];

/** choose a sound for an event; decodes it right away */
export function setChoice(key, file) {
  choice[key] = file;
  saveChoice();
  decode(key);
}

// A choice is never dropped because the file cannot be found. A folder
// that fails to list comes back empty, and forgetting all five over one
// bad read would be silent and permanent. A missing file falls back to
// the shipped default when it plays, and the settings say so beside it.

// ---- buffers, cached by the choice itself so the shipped sounds and
// the folder's share one store and a sound decodes once ----
/** @type {Record<string, AudioBuffer | null>} */
const cache = {};

/** the bytes behind a choice: out of the app for `pack:`, else the folder */
async function loadBytes(value) {
  if (value.startsWith(PACK)) {
    const r = await fetch('sounds/' + value.slice(PACK.length));
    return r.ok ? await r.arrayBuffer() : null;
  }
  return readFile(value);
}

/** decode a choice once; null when it cannot be had */
async function bufferFor(value) {
  if (!value) return null;
  if (cache[value] !== undefined) return cache[value];
  try {
    const bytes = await loadBytes(value);
    cache[value] = bytes ? await audioCtx().decodeAudioData(bytes) : null;
  } catch {
    cache[value] = null;
  }
  return cache[value];
}

const decode = (key) => bufferFor(chosen(key));
export const ensureBuffers = () => Promise.all(EVENTS.map(decode));

/**
 * Put an event's sound on the audio clock at time `at`. Once scheduled
 * it belongs to the audio thread and plays whether or not JavaScript is
 * still running, which is how a cue reaches the user while the app is
 * in the background.
 * @param {string} key  main | turn | approach | rest | end
 * @param {number} at   a time on the AudioContext clock
 * @returns {AudioScheduledSourceNode[]} the sources, so a caller can cancel them
 */
export function playAt(key, at) {
  const buf = cache[chosen(key)];
  if (buf) {
    try {
      const c = audioCtx();
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(c.destination);
      s.start(at);
      return [s];
    } catch {
      /* fall through to the synth */
    }
  }
  return synth[key](at).filter(Boolean);
}

/** the event's sound, now */
export const play = (key) => playAt(key, audioCtx().currentTime);

// The spoken numbers, shipped in counts/. Decoded up front like the
// chosen files, because a cue that has to be fetched or synthesised at
// the moment it is due is a cue that arrives late, or not at all once
// the page is in the background.
const counts = {};

/** decode the numbers a session will speak; anything missing stays silent */
export async function ensureCounts(nums) {
  await Promise.all(
    [...new Set(nums)].map(async (n) => {
      if (counts[n] !== undefined) return;
      try {
        const r = await fetch('counts/' + n + '.mp3');
        counts[n] = await audioCtx().decodeAudioData(await r.arrayBuffer());
      } catch {
        counts[n] = null; // no file for that number; say nothing
      }
    }),
  );
}

/**
 * Put a spoken number on the audio clock.
 * @param {number} n @param {number} at
 * @returns {AudioScheduledSourceNode[]}
 */
export function sayAt(n, at) {
  const buf = counts[n];
  if (!buf) return [];
  try {
    const c = audioCtx();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.start(at);
    return [s];
  } catch {
    return [];
  }
}

// After thirty seconds of silence the browser closes the hardware
// stream and drives rendering from a timer instead, and a timer in a
// background page runs slow. AudioContext.currentTime then falls behind
// the wall clock: 2.7 seconds lost over three minutes on a program with
// a minute between cues, every one of them landing late because they
// were all placed on that clock in advance. So a session is never
// silent. It loops one second of a sample too small to hear, and the
// stream stays open for as long as it runs.
//
// Not zeros. The silence check is for samples that are exactly zero,
// and a looping empty buffer was tried first and changed nothing.
/** @type {AudioBufferSourceNode | null} */
let hold = null;

/** 80 dB under full scale: below anything a speaker can make audible */
const HOLD_LEVEL = 1e-4;

/** keep the audio clock running for the length of a session */
export function holdClock() {
  if (hold) return;
  try {
    const c = audioCtx();
    const buf = c.createBuffer(1, Math.round(c.sampleRate), c.sampleRate);
    buf.getChannelData(0).fill(HOLD_LEVEL);
    hold = c.createBufferSource();
    hold.buffer = buf;
    hold.loop = true;
    hold.connect(c.destination);
    hold.start();
  } catch {
    hold = null; // no audio on this device; the drift is moot
  }
}

/** let the stream close again */
export function releaseClock() {
  try {
    hold && hold.stop();
  } catch {
    /* already stopped */
  }
  hold = null;
}

/** vibrate; Android ignores this while the page is hidden */
export const buzz = (ms) => navigator.vibrate && navigator.vibrate(ms);

/** decode the chosen file if needed, then play the event */
export async function preview(key) {
  await decode(key);
  play(key);
}

/** what a countdown timer plays when none was chosen for it */
export const TIMER_DEFAULT = PACK + DEFAULTS.end;

/** play a sound by choice (countdown timers), the shipped default when unset */
export async function playFile(f) {
  const buf = await bufferFor(f || TIMER_DEFAULT);
  if (!buf) return tone(880, 0.3, 'sine', 0.45);
  try {
    const c = audioCtx();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.start();
  } catch {
    tone(880, 0.3, 'sine', 0.45);
  }
}
