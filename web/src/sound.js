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
import { themeSource, themeId, lose } from './theme.js';
import { SOUNDS } from './themepack.js';
import { duckEnvelope } from './duck.js';
import { duckDepth, duckGap, duckDown, duckUp } from './prefs.js';

let ac = null;
export function audioCtx() {
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  ac = ac || new AC();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

// ---- the three buses everything plays through ----
// Cues on one, the spoken counts on the other, the music on a third,
// each behind a gain the user sets. A bus rather than a gain per sound
// because a session is scheduled whole at the start: moving a slider
// has to reach cues already placed on the clock, and only a shared
// node does that.
//
// The music bus is why the player belongs in here at all. A dip under
// each cue has to be placed on the audio clock beside it, ahead of
// time, or it arrives late and holds while the app is away. A gain on
// a shared node takes that schedule; an element's own volume cannot.
//
// The voice starts lifted. Those files were recorded quieter than the
// cue sounds, so this is the correction that makes the two level, and
// what the user sets moves from there.
const VOICE_BASE = 2.5;
/** @type {GainNode | null} */
let cueBus = null;
/** @type {GainNode | null} */
let voiceBus = null;
/** @type {GainNode | null} */
let musicBus = null;

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
  if (!musicBus) {
    musicBus = c.createGain();
    musicBus.connect(c.destination);
  }
  return { cue: cueBus, voice: voiceBus, music: musicBus };
}

/** the node the music player hangs off, so the dip has somewhere to go */
export const musicInput = () => buses().music;

/** decibels as a multiplier: 0 leaves a level alone */
const fromDb = (db) => Math.pow(10, (+db || 0) / 20);

/**
 * How loud each bus runs, in decibels from the level the app ships at.
 * The music bus is not here: it sits at the file's own level and only
 * the duck ever moves it.
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

// ---- the duck ----
// A session puts every cue on the clock at once, and this puts the
// music's answer to them there in the same breath. `duck.js` works out
// what that answer is; everything here is the writing of it.
//
// The lists are kept because the four numbers are the user's to move
// while a session runs, and moving one has to be heard now, not next
// time. `refreshDuck` rewrites from the same lists against the new
// settings, which is also what a pause and resume needs.
//
// One list per thing that schedules, not one in total: a countdown
// timer can be running under a session, and several countdowns under
// each other. The music answers to all of them at once, so the
// envelope is built from every list together.

/** @type {Map<string, {at: number, dur: number}[]>} what each placed */
const placedBy = new Map();

// Two ramps ending at the same instant on one parameter are not a
// ramp, they are a race. A millisecond of daylight settles it.
const EVENT_GAP = 0.001;

function writeDuck() {
  try {
    const g = buses().music.gain;
    const now = audioCtx().currentTime;
    // What is wholly behind us can no longer shape anything ahead.
    for (const [who, list] of placedBy) {
      if (list.every((s) => s.at + s.dur < now)) placedBy.delete(who);
    }
    const placed = [...placedBy.values()].flat();
    const down = duckDown() / 1000;
    const pts = duckEnvelope(placed, {
      from: now,
      depth: duckDepth(),
      gap: duckGap(),
      down: duckDown(),
      up: duckUp(),
    });
    // Drop what was written before and pin the level where it is now,
    // so a rewrite mid-session carries on from what is being heard.
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);

    // A point already behind us cannot be scheduled, but it still says
    // where the gain belongs: the last of them is the level to be at.
    // That is not always the level being heard. PREPARE sits at second
    // zero of a session, so the whole of its fall is behind the instant
    // this runs, and skipping those points left the music drifting down
    // across the window instead of dropping before the cue. Slide into
    // that level over what is left of the fall rather than stepping,
    // which on music is a click.
    let i = 0;
    let level = g.value;
    while (i < pts.length && pts[i].t <= now) level = pts[i++].v;
    if (level !== g.value) {
      const next = i < pts.length ? pts[i].t : Infinity;
      const slide = Math.min(now + down, next - EVENT_GAP);
      if (slide > now) g.linearRampToValueAtTime(level, slide);
      else g.setValueAtTime(level, now);
    }

    for (; i < pts.length; i++) g.linearRampToValueAtTime(pts[i].v, pts[i].t);
    // Nothing ahead: whatever it is at comes back up and stays there.
    if (i === 0 && level === g.value) g.linearRampToValueAtTime(1, now + duckUp() / 1000);
  } catch {
    /* no audio on this device; there is nothing to duck */
  }
}

/**
 * What one thing has put on the clock, and so what the music owes it.
 * Replaces whatever that thing said before.
 * @param {string} who  the scheduler: a session, or one countdown timer
 * @param {{at: number, dur: number}[]} sounds  every cue and count it placed
 */
export function armDuck(who, sounds) {
  placedBy.set(who, sounds);
  writeDuck();
}

/** the same again, against settings that have just changed */
export const refreshDuck = () => placedBy.size && writeDuck();

/**
 * That one has nothing coming. The music lifts once nothing else is
 * holding it down.
 * @param {string} who
 */
export function clearDuck(who) {
  placedBy.delete(who);
  writeDuck();
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
// The manifest is read once per theme and kept, because placing a
// sound on the clock is synchronous and has to know which file a key
// names. Buffers are cached by file name; two keys naming one file
// decode it once. A change of theme drops both: another theme's
// `gong.mp3` is another sound.
/** @type {{sounds: Record<string, string>, counts: Record<string, string>} | null} */
let manifest = null;
/** every audio file the theme holds: what a timer may pick from */
/** @type {string[]} */
let library = [];
/** the theme the manifest, library and cache belong to */
let loadedFor = '';
/** @type {Record<string, AudioBuffer | null>} */
const cache = {};

/**
 * The theme's manifest, read on first use and again after a change of
 * theme. A folder theme that cannot be read any more is let go of, and
 * the shipped theme's manifest comes back instead.
 */
async function ready() {
  if (manifest && loadedFor === themeId()) return manifest;
  for (const k of Object.keys(cache)) delete cache[k];
  manifest = null;
  let m = null;
  try {
    m = await themeSource().manifest();
  } catch {
    m = null;
  }
  if (!m || !m.sounds || !m.counts) {
    lose();
    m = await themeSource().manifest(); // the shipped one now
  }
  manifest = m;
  library = await themeSource().library();
  loadedFor = themeId();
  return manifest;
}

/** the theme's library, once read: every file a timer may pick */
export const soundLibrary = () => library;

/** the theme in use changed on disk: read it again on the next call */
export function refreshSounds() {
  manifest = null;
  loadedFor = '';
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

// Read at launch, not at the first sound. A folder theme that went
// while the app was closed is found out now, and the app is back on
// the shipped theme before anything is drawn from the old colours for
// long, rather than in the middle of arming a session.
ready().catch(() => {
  /* no theme readable at all; the next `ready` tries again */
});

// A sound is asked for by a role (`main`, `timer`) or by a file in the
// library, which is how a timer names its own. A file the theme does
// not have is what a timer plays by default: a timer saved under one
// theme still rings under another.
/** the file behind a role, once the manifest is in */
const roleFile = (role) => (manifest ? manifest.sounds[role] || '' : '');

/** the file a role or a library file name resolves to */
function fileFor(x) {
  if (SOUNDS.includes(x)) return roleFile(x);
  if (library.includes(x)) return x;
  return roleFile('timer');
}

/** the synth for a role; a library file that cannot be decoded gets the timer's */
const synthFor = (x) => synth[SOUNDS.includes(x) ? x : 'timer'];

// How long a sound runs, for the duck: it has to know when a cue is
// over before it can let the music back up. Read off the decoded
// buffer, so it is the real length and not a guess. Nothing decoded,
// or the theme naming no file, falls back to the synth's own length —
// that is what will play instead.
const SYNTH_LEN = 0.3;

/** seconds a cue sounds for */
export const cueLength = (key) => cache[fileFor(key)]?.duration || SYNTH_LEN;

/** seconds a spoken number sounds for; 0 when the theme has none */
export const countLength = (n) => cache[countFile(n)]?.duration || 0;

/** the name a sound shows under: its file, without the extension */
export const soundName = (x) => fileFor(x).replace(/\.[^.]+$/, '');

/** the library file a role plays, once the manifest is in; "" when blank */
export const soundFile = (role) => roleFile(role);

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
  const file = fileFor(key);
  if (!file) return []; // the theme names nothing for it: silence, by design
  const buf = cache[file];
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
  return synthFor(key)(at).filter(Boolean);
}

/** a sound, now, decoding it if need be */
export async function play(key) {
  await ensureSound(key);
  playAt(key, audioCtx().currentTime);
}

/** what a new countdown timer starts with: the theme's timer file */
export const timerSound = () => roleFile('timer');

// The spoken numbers. Decoded up front like the cues, because a count
// that has to be fetched at the moment it is due is a count that
// arrives late, or not at all once the page is in the background.

/** the file behind a spoken count, once the manifest is in; "" when blank */
export const countFile = (n) => (manifest ? manifest.counts[String(n)] || '' : '');

/** decode the numbers a session will speak; anything missing stays silent */
export async function ensureCounts(nums) {
  await ready();
  await Promise.all([...new Set(nums)].map((n) => bufferFor(countFile(n))));
}

/** a spoken number, now, decoding it if need be */
export async function playCount(n) {
  await ensureCounts([n]);
  sayAt(n, audioCtx().currentTime);
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
export const testVoice = () => playCount(3);
