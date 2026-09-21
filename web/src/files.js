// The user's files: sounds and profiles, in one folder the user picked
// once through the system picker (a scoped grant, no storage permission).
// A native bridge lists and reads it; the page never touches storage
// itself. Without the bridge — the page in a plain WebView — there is no
// folder: the lists are empty and every event falls back to the beep.
//
// The bridge contract, a Capacitor plugin named Folder:
//   status()            → { granted, name }
//   pick()              → { granted, name }   opens the system folder picker
//   list()              → { names }
//   read({ name })      → { base64 }
//   write({ name, base64 })
//   remove({ name })
//   share({ name, base64 })  the system share sheet

const AUDIO = /\.(mp3|wav|ogg|m4a|aac)$/i;
const NAME = /^[^/\\]{1,120}$/;
const NONE = { granted: false, name: '' };

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Folder || null;

/** true inside the app, false in a plain WebView */
export const hasBridge = () => !!bridge();

// ---- base64 <-> bytes, the bridge's wire format ----
function fromB64(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
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

/** every file name in the folder, sorted; [] when there is no folder */
export async function listFiles() {
  const b = bridge();
  if (!b) return [];
  try {
    const names = (await b.list()).names || [];
    return names.filter((n) => NAME.test(n)).sort((a, c) => a.localeCompare(c));
  } catch {
    return [];
  }
}

/** the sound files among them */
export const listSounds = async () => (await listFiles()).filter((f) => AUDIO.test(f));

/** the bytes of one file, or null */
export async function readFile(name) {
  const b = bridge();
  if (!b || !NAME.test(name)) return null;
  try {
    return fromB64((await b.read({ name })).base64);
  } catch {
    return null;
  }
}

/** write bytes under a name; false when it could not be kept */
export async function writeFile(name, bytes) {
  const b = bridge();
  if (!b || !NAME.test(name)) return false;
  try {
    await b.write({ name, base64: toB64(bytes) });
    return true;
  } catch {
    return false;
  }
}

/** a text file as a string, or null */
export async function readText(name) {
  const buf = await readFile(name);
  return buf ? new TextDecoder().decode(buf) : null;
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
