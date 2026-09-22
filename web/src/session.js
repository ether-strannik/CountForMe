// What is running, as Android sees it: a foreground service holding one
// ongoing notification with a countdown, so the system neither freezes
// nor kills the app while the user is in another one. The page keeps
// its own clock either way; this only says "something is running" to
// Android and to the shade.
//
// Two things can need it, a session and the countdown timers, and both
// at once. The service is held for as long as either does. The
// notification is the session's while one runs, the timers' otherwise,
// and whichever is left keeps it when the other lets go.
//
// Outside the app there is no bridge and every call here does nothing.

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Session || null;

/** @type {Map<string, {ms: number, title: string, paused: boolean}>} who holds it, and what to show */
const held = new Map();

/** the one that shows: the session over the timers */
const showing = () => held.get('session') || held.get('timers');

/** post what should show, or take the notification down */
async function post() {
  const b = bridge();
  if (!b) return;
  const h = showing();
  try {
    if (!h) return await b.stop();
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
