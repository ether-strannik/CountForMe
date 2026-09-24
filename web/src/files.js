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
//   copyDir({ from, to, asset? }) → { ok }    a folder's contents into another
//   remove({ name })
//   share({ name, base64 })  the system share sheet

/** an audio file, by its name. One test, wherever the question is asked */
const AUDIO = /\.(mp3|wav|ogg|opus|m4a|aac)$/i;
/** @param {string} name */
export const isAudio = (name) => AUDIO.test(name);

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

// ---- the folders music is kept in ----
// Each is a grant of its own, made through the system picker. Android
// keeps the list, so there is nothing stored here and nothing to go
// stale: a grant taken back from system settings is simply not in the
// next answer.

/** @typedef {{ uri: string, name: string, path: string }} MusicFolder */

/** @param {any} r @returns {MusicFolder[]} */
const asFolders = (r) => (r && Array.isArray(r.folders) ? r.folders : []);

/** the folders added for music */
export async function musicFolders() {
  const b = bridge();
  if (!b) return [];
  try {
    return asFolders(await b.folders());
  } catch {
    return [];
  }
}

/** the system picker; the folder it returns is kept for good */
export async function addMusicFolder() {
  const b = bridge();
  if (!b) return [];
  try {
    return asFolders(await b.addFolder());
  } catch {
    return [];
  }
}

/**
 * What one folder holds, by URI. The added folders have no shared root
 * to walk from, so going down a level is following a URI rather than
 * joining names onto a path.
 * @param {string} uri
 * @returns {Promise<{dirs: {uri: string, name: string}[], files: {uri: string, name: string}[]}>}
 */
export async function browseFolder(uri) {
  const b = bridge();
  const empty = { dirs: [], files: [] };
  if (!b || !uri) return empty;
  try {
    const r = await b.browse({ uri });
    return { dirs: r.dirs || [], files: r.files || [] };
  } catch {
    return empty;
  }
}

/** give one folder's grant back @param {string} uri */
export async function dropMusicFolder(uri) {
  const b = bridge();
  if (!b) return [];
  try {
    return asFolders(await b.dropFolder({ uri }));
  } catch {
    return [];
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
 * One file from anywhere, through the system file picker: its name
 * and its bytes. Null when nothing was picked or there is no bridge.
 * The pick is a one-time read; keeping the file is a write.
 * @param {string} type  a mime filter for the picker
 * @returns {Promise<{name: string, bytes: ArrayBuffer} | null>}
 */
export async function pickFile(type) {
  const b = bridge();
  if (!b) return null;
  try {
    const r = await b.pickFile({ type });
    if (!r.name || !r.base64) return null;
    return { name: r.name, bytes: fromB64(r.base64) };
  } catch {
    return null;
  }
}

/** one audio file, the same way */
export const pickAudio = () => pickFile('audio/*');

// ---- the song: a URL, not bytes ----
// A cue sound is a few hundred kilobytes and is copied into a theme,
// so `pickFile` carrying the bytes is right for it. A song is not.
// Reading one whole file before a note plays means the bytes cross the
// bridge as base64 and are decoded a character at a time here, which
// on a ten-megabyte track is ten million turns of a loop on the main
// thread. So the song is never read: the native side keeps the URI
// with a grant that survives a restart, and `songUrl` turns it into
// something the media decoder can stream.

/**
 * @typedef {{ name: string, uri: string }} Song
 */

/** @param {any} r @returns {Song | null} */
const asSong = (r) => (r && r.name && r.uri ? { name: r.name, uri: r.uri } : null);

/** the system picker, for one song that is then remembered */
export async function pickSong() {
  const b = bridge();
  if (!b) return null;
  try {
    return asSong(await b.pickSong());
  } catch {
    return null;
  }
}

/** the song picked last time, if its grant survived */
export async function keptSong() {
  const b = bridge();
  if (!b) return null;
  try {
    return asSong(await b.song());
  } catch {
    return null;
  }
}

/**
 * The URI of one file under the folder. A picked song arrives with a
 * URI already; a song sitting in a theme's `media/` is only a path,
 * and a path cannot be streamed. "" when the folder does not hold it.
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function fileUri(path) {
  const b = bridge();
  if (!b || !PATH.test(path)) return '';
  try {
    return (await b.fileUri({ name: path })).uri || '';
  } catch {
    return '';
  }
}

/**
 * A song's URI as a URL the WebView will stream. Capacitor's own local
 * server answers it, on the same origin as the page, so this holds in
 * the dev build too.
 * @param {string} uri
 */
export const songUrl = (uri) => /** @type {any} */ (window).Capacitor?.convertFileSrc?.(uri) || uri;

// ---- a theme as a zip, made and read natively ----

/**
 * Zip a folder, flat, to a file the user picks through the system's
 * save dialog. `path` is under the tree, or inside the app's own files
 * when `asset` is true. False when the user backed out or it failed.
 * @param {string} path @param {string} name  the suggested file name
 * @param {boolean} [asset]
 */
export async function exportZip(path, name, asset = false) {
  const b = bridge();
  if (!b || !PATH.test(path) || !NAME.test(name)) return false;
  try {
    return !!(await b.exportZip({ path, name, asset })).saved;
  } catch {
    return false;
  }
}

/**
 * Pick a zip and look inside: the paths of its files and the text of
 * its theme.json. Nothing is written yet. Null when nothing was picked
 * or it could not be read.
 *
 * Paths, not names: a theme is a tree, and `sounds/gong.mp3` is what
 * the check has to see. Filtering these as plain names threw every
 * entry away and the theme read as having no sounds at all.
 * @returns {Promise<{names: string[], manifest: string} | null>}
 */
export async function pickZip() {
  const b = bridge();
  if (!b) return null;
  try {
    const r = await b.pickZip();
    const names = (r.names || []).filter((n) => PATH.test(n));
    return names.length ? { names, manifest: r.manifest || '' } : null;
  } catch {
    return null;
  }
}

/**
 * Unpack the zip picked last into a folder under the tree.
 * @param {string} dest  a path under the tree, made if need be
 */
export async function unpackZip(dest) {
  const b = bridge();
  if (!b || !PATH.test(dest)) return false;
  try {
    return !!(await b.unpackZip({ dest })).ok;
  } catch {
    return false;
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
 * Everything under one folder, copied into another. The bytes never
 * come here: a theme carries its music, and moving that through the
 * page would be the base64 round trip all over again.
 *
 * A source that is not there copies nothing and still succeeds — a
 * theme with no `media/` is a theme with no music, not a failure.
 *
 * @param {string} from   a path under the tree, or inside the app when `asset`
 * @param {string} to     a path under the tree; folders are made
 * @param {boolean} [asset]
 */
export async function copyDir(from, to, asset = false) {
  const b = bridge();
  if (!b || !PATH.test(to) || (!asset && !PATH.test(from))) return false;
  try {
    await b.copyDir({ from, to, asset });
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
