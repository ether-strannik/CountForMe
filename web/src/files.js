// The user's files: presets, and soon themes, in one folder the user
// picked once through the system picker (a scoped grant, no storage
// permission). A native bridge lists and reads it; the page never
// touches storage itself. Without the bridge — the page in a plain
// browser — there is no folder and the lists are empty.
//
// The bridge contract, the native side's Folder plugin:
//   status()            → { granted, name }
//   pick()              → { granted, name }   opens the system folder picker
//   list()              → { names }
//   read({ name })      → { base64 }
//   write({ name, base64 })
//   remove({ name })
//   share({ name, base64 })  the system share sheet

const NAME = /^[^/\\]{1,120}$/;
const NONE = { granted: false, name: '' };

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Folder || null;

/** true inside the app, false in a plain browser */
export const hasBridge = () => !!bridge();

// ---- bytes as base64, the bridge's wire format ----
function toB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

/** the granted folder: { granted, name } */
export async function folder() {
  const b = bridge();
  if (!b) return NONE;
  try {
    return await b.status();
  } catch {
    return NONE;
  }
}

/** open the system folder picker; resolves to the new status */
export async function pickFolder() {
  const b = bridge();
  if (!b) return NONE;
  try {
    return await b.pick();
  } catch {
    return folder();
  }
}

/** write bytes under a name; false when it could not be kept */
async function writeFile(name, bytes) {
  const b = bridge();
  if (!b || !NAME.test(name)) return false;
  try {
    await b.write({ name, base64: toB64(bytes) });
    return true;
  } catch {
    return false;
  }
}

/** write a string as a text file */
export const writeText = (name, text) => writeFile(name, new TextEncoder().encode(text).buffer);

/**
 * Hand a text file to another app through the system share sheet. It
 * goes through the app's own cache, not the user's folder, so sharing
 * works whether or not a folder was ever picked.
 * @param {string} name @param {string} text
 * @returns {Promise<boolean>} false when there is no bridge to share through
 */
export async function shareText(name, text) {
  const b = bridge();
  if (!b || !NAME.test(name)) return false;
  try {
    await b.share({ name, base64: toB64(new TextEncoder().encode(text).buffer) });
    return true;
  } catch {
    return false;
  }
}
