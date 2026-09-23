// The user's files: presets at the top, themes in folders under
// `themes/`, in one folder the user picked once through the system
// picker (a scoped grant, no storage permission). A native bridge lists
// and reads it; the page never touches storage itself. Without the
// bridge — the page in a plain browser — there is no folder and the
// lists are empty.
//
// The bridge contract, the native side's Folder plugin:
//   status()            → { granted, name }
//   pick()              → { granted, name }   opens the system folder picker
//   list({ path? })     → { names, dirs }     files and subfolders of one folder
//   read({ name })      → { base64 }          name may be a path
//   write({ name, base64 })
//   remove({ name })
//   share({ name, base64 })  the system share sheet

/** one file or folder name: no separators */
const NAME = /^[^/\\]{1,120}$/;
/** a path of names under the folder: no empty, dot or dot-dot segments */
const PATH = /^(?!.*(^|\/)\.\.?(\/|$))[^/\\]{1,120}(\/[^/\\]{1,120}){0,8}$/;
const NONE = { granted: false, name: '' };

const bridge = () => /** @type {any} */ (window).Capacitor?.Plugins?.Folder || null;

/** true inside the app, false in a plain browser */
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

/**
 * What one folder under the tree holds. `path` is names joined by "/",
 * "" for the tree itself. A folder that is not there lists as empty.
 * @param {string} path
 * @returns {Promise<{names: string[], dirs: string[]}>} files, and subfolders
 */
export async function listDir(path) {
  const b = bridge();
  if (!b || (path && !PATH.test(path))) return { names: [], dirs: [] };
  try {
    const r = await b.list({ path });
    const clean = (a) => (a || []).filter((n) => NAME.test(n)).sort((x, y) => x.localeCompare(y));
    return { names: clean(r.names), dirs: clean(r.dirs) };
  } catch {
    return { names: [], dirs: [] };
  }
}

/** the bytes of one file by path, or null */
export async function readFile(path) {
  const b = bridge();
  if (!b || !PATH.test(path)) return null;
  try {
    return fromB64((await b.read({ name: path })).base64);
  } catch {
    return null;
  }
}

/**
 * One audio file from anywhere, through the system file picker: its
 * name and its bytes. Null when nothing was picked or there is no
 * bridge. The pick is a one-time read; keeping the file is a write.
 * @returns {Promise<{name: string, bytes: ArrayBuffer} | null>}
 */
export async function pickAudio() {
  const b = bridge();
  if (!b) return null;
  try {
    const r = await b.pickFile();
    if (!r.name || !r.base64) return null;
    return { name: r.name, bytes: fromB64(r.base64) };
  } catch {
    return null;
  }
}

/**
 * Remove a file or a folder by path, a folder with everything in it.
 * True when it is gone, or was never there.
 */
export async function removePath(path) {
  const b = bridge();
  if (!b || !PATH.test(path)) return false;
  try {
    await b.remove({ name: path });
    return true;
  } catch {
    return false;
  }
}

/**
 * Write bytes under a name, which may be a path; folders on the way
 * are made. False when it could not be kept.
 */
export async function writeFile(name, bytes) {
  const b = bridge();
  if (!b || !PATH.test(name)) return false;
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
