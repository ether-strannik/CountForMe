// Sound engine: one AudioContext, and a decoded file per sound.
//
// Every sound comes from the theme in use: a file for each cue, one
// for a countdown timer, one for each spoken count. `theme.js` says
// where the theme is and hands over its files; nothing here knows a
// folder. There is no choice of sound apart from the theme, so there
// is nothing to store. The synth below is the last resort only: a
// device that cannot decode an MP3 still gets a cue.
//
// Everything a run plays goes on the audio clock in advance. The audio
// thread keeps running when the page is hidden and the animation frame
// loop does not, so a cue that was scheduled still sounds while the
// user is in another app. Nothing here waits for a timer to fire.
import { themeSource } from './theme.js';
import { SOUNDS } from './themepack.js';

let ac = null;
export function audioCtx() {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  ac = ac || new AC();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// ---- the two buses everything plays through ----
// Cues on one, the spoken counts on the other, each behind a gain the
// user sets. A bus rather than a gain per sound because a session is
// scheduled whole at the start: moving a slider has to reach cues
// already placed on the clock, and only a shared node does that.
//
// The voice starts lifted. Those files were recorded quieter than the
// cue sounds, so this is the correction that makes the two level, and
// what the user sets moves from there.
const VOICE_BASE = 2.5;
/** @type {GainNode | null} */
let cueBus = null;
/** @type {GainNode | null} */
let voiceBus = null;

function buses() {
  const c = audioCtx();
  if (!cueBus) {
    cueBus = c.createGain();
    cueBus.connect(c.destination);
  }
  if (!voiceBus) {
    voiceBus = c.createGain();
    voiceBus.gain.value = VOICE_BASE;
    voiceBus.connect(c.destination);
  }
  return { cue: cueBus, voice: voiceBus };
}

/** decibels as a multiplier: 0 leaves a level alone */
const fromDb = (db) => Math.pow(10, (+db || 0) / 20);

/**
 * How loud each bus runs, in decibels from the level the app ships at.
 * @param {number} cueDb @param {number} voiceDb
 */
export function setVolumes(cueDb, voiceDb) {
  try {
    const b = buses();
    b.cue.gain.value = fromDb(cueDb);
    b.voice.gain.value = VOICE_BASE * fromDb(voiceDb);
  } catch {
    /* no audio on this device; nothing to set */
  }
}

/**
 * @param {number} freq @param {number} dur @param {string} [type]
 * @param {number} [vol]
 * @param {number} [at]  on the audio clock; now when left out. Scheduling
 *                       ahead puts the sound on the audio thread, which
 *                       does not need JavaScript to be running to play it.
 */
function tone(freq, dur, type, vol, at) {
  try {
    const c = audioCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    o.connect(g);
    g.connect(buses().cue);
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

// The last resort, one per sound, reached only when the theme's file
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
  timer: (t) => [tone(880, 0.3, 'sine', 0.45, t)],
};

/** the cues a session plays, and the only sounds it decodes up front */
export const EVENTS = ['approach', 'prepare', 'main', 'turn', 'rest', 'end'];

// ---- the theme's files, decoded once each ----
// The manifest is read once and kept, because placing a sound on the
// clock is synchronous and has to know which file a key names. Buffers
// are cached by file name; two keys naming one file decode it once.
/** @type {{sounds: Record<string, string>, counts: Record<string, string>} | null} */
let manifest = null;
/** @type {Record<string, AudioBuffer | null>} */
const cache = {};

/** the theme's manifest, read on first use */
async function ready() {
  if (!manifest) manifest = await themeSource().manifest();
  return manifest;
}

/** decode one of the theme's files once; null when it cannot be had */
async function bufferFor(file) {
  if (!file) return null;
  if (cache[file] !== undefined) return cache[file];
  try {
    const bytes = await themeSource().bytes(file);
    cache[file] = bytes ? await audioCtx().decodeAudioData(bytes) : null;
  } catch {
    cache[file] = null;
  }
  return cache[file];
}

/** a sound key the theme has; anything else is what a timer plays */
const soundKey = (key) => (SOUNDS.includes(key) ? key : 'timer');

/** the file behind a sound key, once the manifest is in */
const fileFor = (key) => (manifest ? manifest.sounds[soundKey(key)] : '');

/** the name a sound shows under: its file, without the extension */
export const soundName = (key) => fileFor(key).replace(/\.mp3$/i, '');

/** decode a sound so it can be put on the clock later; cached after */
export async function ensureSound(key) {
  await ready();
  return bufferFor(fileFor(key));
}

/** decode every cue a session plays */
export const ensureBuffers = () => Promise.all(EVENTS.map(ensureSound));

/**
 * Put a sound on the audio clock at time `at`. Once scheduled it belongs
 * to the audio thread and plays whether or not JavaScript is still
 * running, which is how a cue reaches the user while the app is in the
 * background. Decoded first by `ensureSound`: nothing is fetched here,
 * because a sound that has to be fetched when it is due is a sound that
 * arrives late, or not at all once the page is in the background.
 * @param {string} key  approach | prepare | main | turn | rest | end | timer
 * @param {number} at   a time on the AudioContext clock
 * @returns {AudioScheduledSourceNode[]} the sources, so a caller can cancel them
 */
export function playAt(key, at) {
  const buf = cache[fileFor(key)];
  if (buf) {
    try {
      const c = audioCtx();
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(buses().cue);
      s.start(at);
      return [s];
    } catch {
      /* fall through to the synth */
    }
  }
  return synth[soundKey(key)](at).filter(Boolean);
}

/** a sound, now, decoding it if need be */
export async function play(key) {
  await ensureSound(key);
  playAt(key, audioCtx().currentTime);
}

/** what a new countdown timer starts with: the theme's timer sound */
export const timerSound = () => 'timer';

// The spoken numbers. Decoded up front like the cues, because a count
// that has to be fetched at the moment it is due is a count that
// arrives late, or not at all once the page is in the background.

/** the file behind a spoken count, once the manifest is in */
const countFile = (n) => (manifest ? manifest.counts[String(n)] : '');

/** decode the numbers a session will speak; anything missing stays silent */
export async function ensureCounts(nums) {
  await ready();
  await Promise.all([...new Set(nums)].map((n) => bufferFor(countFile(n))));
}

/**
 * Put a spoken number on the audio clock.
 * @param {number} n @param {number} at
 * @returns {AudioScheduledSourceNode[]}
 */
export function sayAt(n, at) {
  const buf = cache[countFile(n)];
  if (!buf) return [];
  try {
    const s = audioCtx().createBufferSource();
    s.buffer = buf;
    s.connect(buses().voice);
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
//
// And not too quiet. A hidden page that has not been audible for sixty
// seconds has its output stopped, to the millisecond, and audible means
// over -72 dBFS. A hold at -80 dBFS passed the zero check and failed
// this one: a countdown timer left for the other screen stopped
// counting exactly a minute later. The hold is a constant, not a wave,
// so it makes no sound at any level; it only has to measure as one.
/** @type {AudioBufferSourceNode | null} */
let hold = null;

/** 60 dB under full scale: audible to the meter, not to anyone */
const HOLD_LEVEL = 1e-3;

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

// ---- the Volume tab's test buttons ----

/** the Work cue, at the level set, so a slider can be heard while moved */
export const testCue = () => play('main');

/** a spoken number, the same way */
export async function testVoice() {
  await ensureCounts([3]);
  sayAt(3, audioCtx().currentTime);
}
