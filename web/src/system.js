// What Android is currently letting the app do, and the screens that
// change it. Never assumed and never cached: a permission granted once
// can be taken away later from settings.
//
// The screens these open sit on top of the app rather than replacing
// it, so the page is never hidden and would not otherwise know it is
// back. Android says so instead, through `onSystemChange`.
//
// Outside the app there is no bridge and there is nothing to report.

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.System || null;

/**
 * @returns {Promise<{notifications: boolean, battery: boolean} | null>}
 *   null when there is nothing to ask
 */
export async function systemStatus() {
  const b = bridge();
  if (!b) return null;
  try {
    return await b.status();
  } catch {
    return null;
  }
}

/** called whenever the app comes back to the front */
export function onSystemChange(fn) {
  const b = bridge();
  if (b) b.addListener('changed', fn);
}

/** the app's notification settings */
export async function openNotifications() {
  const b = bridge();
  if (!b) return;
  try {
    await b.notifications();
  } catch {
    /* no such screen on this device */
  }
}

/** the exemption dialog, or the list to undo it when already exempt */
export async function openBattery() {
  const b = bridge();
  if (!b) return;
  try {
    await b.battery();
  } catch {
    /* no such screen on this device */
  }
}
