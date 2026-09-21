// The running session as Android sees it: a foreground service holding
// one ongoing notification with a countdown, so the system neither
// freezes nor kills the app while the user is in another one. The page
// keeps its own clock either way; this only says "a session is running"
// to Android and to the shade.
//
// Outside the app there is no bridge and every call here does nothing.

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Session || null;

/**
 * @param {number} seconds  the whole run, lead-in included
 * @param {string} title    what the notification is called
 */
export async function sessionStart(seconds, title) {
  const b = bridge();
  if (!b) return false;
  try {
    await b.start({ ms: Math.max(0, Math.round(seconds * 1000)), title });
    return true;
  } catch {
    return false;
  }
}

/** paused: the notification says so and stops counting */
export async function sessionPause() {
  const b = bridge();
  if (!b) return;
  try {
    await b.pause();
  } catch {
    /* nothing running */
  }
}

/** running again, with `seconds` of the run left to go */
export async function sessionResume(seconds) {
  const b = bridge();
  if (!b) return;
  try {
    await b.resume({ ms: Math.max(0, Math.round(seconds * 1000)) });
  } catch {
    /* nothing running */
  }
}

/** the session is over or was stopped: take the notification down */
export async function sessionStop() {
  const b = bridge();
  if (!b) return;
  try {
    await b.stop();
  } catch {
    /* nothing to stop */
  }
}
