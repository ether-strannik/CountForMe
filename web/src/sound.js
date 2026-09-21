// Sound engine: one AudioContext, a synth fallback per event, and the
// user's chosen file per event, decoded once so it can be scheduled.
// Choices persist in localStorage; the files come through files.js.
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

// Built-in fallback, one per event. Every note is placed on the audio
// clock rather than chained with a timer, so a two-note cue scheduled
// for later arrives whole even with no JavaScript running.
const synth = {
  main: (t) => [tone(1175, 0.12, 'triangle', 0.5, t), tone(1568, 0.26, 'triangle', 0.5, t + 0.11)],
  turn: (t) => [tone(700, 0.14, 'square', 0.4, t), tone(700, 0.14, 'square', 0.4, t + 0.15)],
  approach: (t) => [tone(880, 0.15, 'sine', 0.3, t)],
  rest: (t) => [tone(660, 0.14, 'sine', 0.4, t), tone(520, 0.2, 'sine', 0.4, t + 0.12)],
  end: (t) => [tone(440, 0.6, 'sine', 0.45, t)],
};

export const EVENTS = ['main', 'turn', 'approach', 'rest', 'end'];
const choice = load('timer.sounds', {});
const buffers = {
  main: null,
  turn: null,
  approach: null,
  rest: null,
  end: null,
};

const saveChoice = () => save('timer.sounds', choice);

/** the file chosen for an event; "" (or unset) means the built-in beep */
export const chosen = (key) => choice[key];

/** choose a file for an event ("" for the beep); decodes it right away */
export function setChoice(key, file) {
  choice[key] = file;
  buffers[key] = null;
  saveChoice();
  decode(key);
}

// A choice is never dropped because the file cannot be found. A folder
// that fails to list comes back empty, and forgetting all five over one
// bad read would be silent and permanent. A missing file falls back to
// the beep when it plays, and the settings say so beside its name.

// decode a chosen file into an AudioBuffer once; low-latency for playback
async function decode(key) {
  const file = choice[key];
  if (!file) return (buffers[key] = null);
  if (buffers[key]) return buffers[key];
  try {
    const bytes = await readFile(file);
    buffers[key] = bytes ? await audioCtx().decodeAudioData(bytes) : null;
  } catch {
    buffers[key] = null;
  }
  return buffers[key];
}
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
  if (buffers[key]) {
    try {
      const c = audioCtx();
      const s = c.createBufferSource();
      s.buffer = buffers[key];
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

/** vibrate; Android ignores this while the page is hidden */
export const buzz = (ms) => navigator.vibrate && navigator.vibrate(ms);

/** decode the chosen file if needed, then play the event */
export async function preview(key) {
  await decode(key);
  play(key);
}

function playBuf(buf) {
  try {
    const c = audioCtx();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    s.start();
  } catch {
    /* no audio on this device — silent */
  }
}
const fileBuffers = {};
/** play a file by name (countdown timers), the plain beep when unset */
export async function playFile(f) {
  if (!f) return tone(880, 0.3, 'sine', 0.45);
  if (fileBuffers[f] === undefined) {
    try {
      const bytes = await readFile(f);
      fileBuffers[f] = bytes ? await audioCtx().decodeAudioData(bytes) : null;
    } catch {
      fileBuffers[f] = null;
    }
  }
  if (fileBuffers[f]) playBuf(fileBuffers[f]);
  else tone(880, 0.3, 'sine', 0.45);
}
