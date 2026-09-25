// What is running, as Android sees it: a foreground service holding one
// ongoing notification with a countdown, so the system neither freezes
// nor kills the app while the user is in another one. The page keeps
// its own clock either way; this only says "something is running" to
// Android and to the shade.
//
// Three things can need it — a session, the countdown timers, and a
// song playing — and any of them at once. The service is held for as
// long as one of them does, and whichever is left keeps it when the
// others let go.
//
// The notification is the session's while one runs, the timers' next,
// and the song's only when nothing else is going. A song has no end to
// count down to, so it shows its name and no clock.
//
// Outside the app there is no bridge and every call here does nothing.

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Session || null;

/** @type {Map<string, {ms: number, title: string, paused: boolean}>} who holds it, and what to show */
const held = new Map();

/** which one shows: session, then timers, then song. "" when none do */
function showing() {
  for (const who of ['session', 'timers', 'music']) if (held.has(who)) return who;
  return '';
}

/** post what should show, or take the notification down */
async function post() {
  const b = bridge();
  if (!b) return;
  const who = showing();
  const h = held.get(who);
  try {
    if (!h) return await b.stop();
    // A song is not a clock. It goes up as a media session, which is
    // what gives it the lock screen and the buttons on a headset.
    if (who === 'music') return await b.music({ title: h.title, paused: h.paused });
    await b.start({ ms: h.ms, title: h.title });
    if (h.paused) await b.pause();
  } catch {
    /* the service could not be reached; the page runs on regardless */
  }
}

/** @param {string} who @param {number} seconds to go @param {string} title */
function hold(who, seconds, title) {
  held.set(who, { ms: Math.max(0, Math.round(seconds * 1000)), title, paused: false });
  return post();
}

function letGo(who) {
  held.delete(who);
  return post();
}

/**
 * @param {number} seconds  the whole run, lead-in included
 * @param {string} title    what the notification is called
 */
export const sessionStart = (seconds, title) => hold('session', seconds, title);

/** paused: the notification says so and stops counting */
export function sessionPause() {
  const h = held.get('session');
  if (!h) return;
  h.paused = true;
  h.ms = 0;
  return post();
}

/** running again, with `seconds` of the run left to go */
export function sessionResume(seconds) {
  const h = held.get('session');
  if (!h) return;
  return hold('session', seconds, h.title);
}

/** the session is over or was stopped */
export const sessionStop = () => letGo('session');

/**
 * Countdown timers are running: the one ending soonest is shown.
 * @param {number} seconds  until it ends
 * @param {string} title    its name
 */
export const timersRunning = (seconds, title) => hold('timers', seconds, title);

/** the last countdown timer has stopped */
export const timersDone = () => letGo('timers');

/**
 * A song is playing. The process is held for it the same way, because
 * without that Android freezes the app within seconds of it leaving
 * the screen and the music goes with it.
 *
 * No seconds: a song has no end the shade needs to count down to.
 * @param {string} title  the song's name
 */
export const musicPlaying = (title) => hold('music', 0, title);

/**
 * A song that is paused. The notification stays, so the lock screen
 * keeps its play button: taking it down would leave nothing to press.
 * @param {string} title
 */
export function musicPaused(title) {
  held.set('music', { ms: 0, title, paused: true });
  return post();
}

/** nothing is playing any more */
export const musicStopped = () => letGo('music');

/**
 * What the lock screen, the shade's media panel or a headset asked
 * for: play, pause, next or previous.
 * @param {(what: string) => void} fn
 */
export function onMusicControl(fn) {
  const b = bridge();
  if (b) b.addListener('control', (e) => fn(e && e.action));
}
