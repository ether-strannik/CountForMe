// The theme in use. The app ships one, in `theme/`: its colours, its
// sounds and its spoken counts, the shape `themepack.js` describes.
// Others come from the folder the user chose, one folder each under
// `themes/`, and only whole: one with a gap is listed with what it
// lacks and cannot be picked. Nothing is overridden from anywhere else.
//
// The shipped theme's colours are also the stylesheet's, so the first
// frame is right without waiting for a fetch. A theme from the folder
// paints its colours over the stylesheet, and they are kept alongside
// the choice so the next launch paints them before anything draws.
import { load, save } from './storage.js';
import { listDir, readFile, writeText, writeFile, removePath, exportZip, pickZip, unpackZip } from './files.js';
import { TOKENS, SOUNDS, COUNTS, themeCheck, blankTheme, slug } from './themepack.js';

const KEY = 'timer.theme';

/** the id of the theme the app ships with */
export const SHIPPED = 'shipped';

/** where the folder's themes live, under the folder the user picked */
const DIR = 'themes';

/** a folder theme's id carries its folder name */
const FOLDER = 'folder:';
const folderOf = (id) => (id.startsWith(FOLDER) ? id.slice(FOLDER.length) : '');

/** @param {Record<string, string> | null} ui  null puts the stylesheet back */
function paint(ui) {
  const s = document.documentElement.style;
  for (const t of TOKENS) {
    const v = ui && ui[t];
    if (v) s.setProperty('--' + t, v);
    else s.removeProperty('--' + t);
  }
}

/** @type {{id: string, name: string, ui: Record<string, string> | null}} */
let chosen = load(KEY, { id: SHIPPED, name: '', ui: null });
// A choice made before themes were whole units named a file that no
// longer exists. It is dropped, and the app is on the shipped theme.
if (!chosen || !(chosen.id === SHIPPED || chosen.id.startsWith(FOLDER))) {
  chosen = { id: SHIPPED, name: '', ui: null };
  save(KEY, chosen);
}
paint(chosen.ui);

/** the id of the theme in use */
export const themeId = () => chosen.id;

/**
 * The shipped theme, read from its folder.
 * @returns {Promise<any>} the parsed theme.json
 */
export const shippedTheme = async () => (await fetch('theme/theme.json')).json();

const text = new TextDecoder();

/** a folder theme's parsed theme.json, or null when it cannot be read */
async function folderManifest(dir) {
  const bytes = await readFile(DIR + '/' + dir + '/theme.json');
  if (!bytes) return null;
  try {
    return JSON.parse(text.decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Every theme that can be shown: the shipped one, then each folder
 * under `themes/`, checked. One that cannot be used is still listed,
 * so the picker can say what it lacks, but `ok` is false and it
 * cannot be picked. One that can be used but is not whole is picked
 * with its blank sounds silent, and `silent` names them.
 * @returns {Promise<{id: string, name: string, ui: Record<string, string>,
 *   ok: boolean, whole: boolean, missing: string[], silent: string[]}[]>}
 */
export async function themeList() {
  const out = [];
  const fine = { ok: true, whole: true, missing: [], silent: [] };
  try {
    const t = await shippedTheme();
    out.push({ id: SHIPPED, name: t.name, ui: t.ui, ...fine });
  } catch {
    out.push({ id: SHIPPED, name: 'Nord', ui: {}, ...fine }); // in the app; not reached
  }
  for (const dir of (await listDir(DIR)).dirs) {
    const m = await folderManifest(dir);
    const check = themeCheck(m, (await listDir(DIR + '/' + dir)).names);
    out.push({ id: FOLDER + dir, name: (m && m.name) || dir, ui: (m && m.ui) || {}, ...check });
  }
  return out;
}

/** an audio file, by its name */
const AUDIO = /\.(mp3|wav|ogg|m4a|aac)$/i;

/**
 * Where the theme in use is read from: its manifest, its library, and
 * the bytes of a file beside it. The sound engine goes through this
 * and knows no folder. A folder theme that cannot be read any more
 * resolves its manifest to null; the engine then falls back through
 * `lose()`.
 *
 * The library is every audio file in the theme's folder. The shipped
 * theme's folder cannot be listed, so its theme.json names them; a
 * folder theme's listing is read, and a file dropped in appears.
 * @returns {{manifest: () => Promise<any>, library: () => Promise<string[]>,
 *   bytes: (file: string) => Promise<ArrayBuffer | null>}}
 */
export function themeSource() {
  const dir = folderOf(chosen.id);
  if (!dir) {
    return {
      manifest: shippedTheme,
      library: async () => (await shippedTheme()).library || [],
      bytes: async (file) => {
        const r = await fetch('theme/' + file);
        return r.ok ? r.arrayBuffer() : null;
      },
    };
  }
  const path = DIR + '/' + dir;
  return {
    // usable, or nothing: a colour gone since the theme was picked is
    // the same as the theme gone. A sound gone is that sound silent.
    manifest: async () => {
      const m = await folderManifest(dir);
      return themeCheck(m, (await listDir(path)).names).ok ? m : null;
    },
    library: async () => (await listDir(path)).names.filter((f) => AUDIO.test(f)),
    bytes: (file) => readFile(path + '/' + file),
  };
}

/**
 * A theme of the user's own: a folder under `themes/` named after it,
 * holding a theme.json with the starting colours and no sounds yet.
 * Put on at once, so it can be built and seen live from here. A name
 * already taken gets a number.
 * @param {string} name
 * @returns {Promise<string>} the new theme's id; "" when nothing could be written
 */
export async function createTheme(name) {
  const dir = await freeDir(name);
  const m = blankTheme(name.trim() || dir);
  if (!(await writeText(DIR + '/' + dir + '/theme.json', JSON.stringify(m, null, 2) + '\n'))) return '';
  setTheme(FOLDER + dir, m.name, m.ui);
  return FOLDER + dir;
}

/** can the theme in use be edited: only one from the folder */
export const themeEditable = () => !!folderOf(chosen.id);

/**
 * Change one colour of the theme in use, on the spot: painted at once
 * and written to its theme.json. Only a folder theme.
 * @param {string} token @param {string} value  a hex colour, checked by the caller
 * @returns {Promise<boolean>} false when nothing could be written
 */
export async function setColour(token, value) {
  const dir = folderOf(chosen.id);
  if (!dir || !TOKENS.includes(token)) return false;
  const m = await folderManifest(dir);
  if (!m) return false;
  m.ui = { ...(m.ui || {}), [token]: value };
  if (!(await writeText(DIR + '/' + dir + '/theme.json', JSON.stringify(m, null, 2) + '\n'))) return false;
  setTheme(chosen.id, chosen.name, m.ui);
  return true;
}

/** a folder name under themes/ not yet taken, from a theme name */
async function freeDir(name) {
  const taken = new Set((await listDir(DIR)).dirs);
  let dir = slug(name);
  for (let n = 2; taken.has(dir); n++) dir = slug(name) + '-' + n;
  return dir;
}

/**
 * The theme in use, copied whole into a new folder under a name of the
 * user's: its manifest under the new name, every file in its library,
 * every count. Nord included. Whole from the first second, then edited
 * like any theme of the user's own. Put on at once.
 * @param {string} name
 * @returns {Promise<string>} the new theme's id; "" when it could not be made
 */
export async function copyTheme(name) {
  const src = themeSource();
  let m;
  try {
    m = await src.manifest();
  } catch {
    m = null;
  }
  if (!m) return '';
  const dir = await freeDir(name);
  const files = new Set([...(await src.library()), ...Object.values(m.sounds || {}), ...Object.values(m.counts || {})]);
  for (const f of files) {
    if (!FILE.test(f)) continue;
    const bytes = await src.bytes(f);
    if (bytes && !(await writeFile(DIR + '/' + dir + '/' + f, bytes))) return '';
  }
  // no `library` key: a folder theme's library is its folder
  const out = {
    name: name.trim() || dir,
    ui: { ...m.ui },
    sounds: { ...(m.sounds || {}) },
    counts: { ...(m.counts || {}) },
  };
  if (!(await writeText(DIR + '/' + dir + '/theme.json', JSON.stringify(out, null, 2) + '\n'))) return '';
  setTheme(FOLDER + dir, out.name, out.ui);
  return FOLDER + dir;
}

/**
 * Remove the theme in use, folder and all. Only one of the user's own;
 * the shipped theme cannot go. The app is on the shipped theme after.
 * @returns {Promise<boolean>} false when it is still there
 */
export async function deleteTheme() {
  const dir = folderOf(chosen.id);
  if (!dir) return false;
  if (!(await removePath(DIR + '/' + dir))) return false;
  setTheme(SHIPPED, '', null);
  return true;
}

/** a file name as it may be kept in a theme folder: no separators */
const FILE = /^[^/\\]{1,120}$/;

/**
 * Put a sound file into the theme in use, so it is in the library.
 * Only a folder theme. A file of that name already there is replaced.
 * @param {string} name @param {ArrayBuffer} bytes
 * @returns {Promise<boolean>}
 */
export async function addToLibrary(name, bytes) {
  const dir = folderOf(chosen.id);
  if (!dir || !FILE.test(name) || name === 'theme.json') return false;
  return writeFile(DIR + '/' + dir + '/' + name, bytes);
}

/** change one entry of the theme's manifest and write it back */
async function assign(group, key, file) {
  const dir = folderOf(chosen.id);
  if (!dir || !FILE.test(file)) return false;
  const m = await folderManifest(dir);
  if (!m) return false;
  m[group] = { ...(m[group] || {}), [key]: file };
  return writeText(DIR + '/' + dir + '/theme.json', JSON.stringify(m, null, 2) + '\n');
}

/**
 * Name the library file a cue plays, on the theme in use.
 * @param {string} role  one of SOUNDS @param {string} file  in the library
 */
export const setSound = (role, file) => (SOUNDS.includes(role) ? assign('sounds', role, file) : Promise.resolve(false));

/**
 * Name the library file a count speaks, on the theme in use.
 * @param {string} n  one of COUNTS @param {string} file  in the library
 */
export const setCount = (n, file) => (COUNTS.includes(n) ? assign('counts', n, file) : Promise.resolve(false));

/**
 * The theme in use as a zip of its folder, to a place the user picks.
 * Only a whole theme goes out. Nord too: its folder is inside the app,
 * and the zip is made from there.
 * @returns {Promise<{saved: boolean} | {missing: string[]}>}
 *   whether the file was written, or what the theme lacks
 */
export async function exportTheme() {
  const src = themeSource();
  let m;
  try {
    m = await src.manifest();
  } catch {
    m = null;
  }
  const lib = m ? await src.library() : [];
  const check = themeCheck(m, lib);
  if (!check.whole) return { missing: check.missing };
  const dir = folderOf(chosen.id);
  const name = slug(m.name) + '.zip';
  return { saved: dir ? await exportZip(DIR + '/' + dir, name) : await exportZip('public/theme', name, true) };
}

/**
 * A theme zip in, picked from anywhere: looked inside, checked at the
 * door, and only then unpacked into a new folder under the user's own
 * and put on. Only a whole theme comes in.
 * @returns {Promise<{id: string} | {missing: string[]} | null>}
 *   null when nothing was picked
 */
export async function importTheme() {
  const z = await pickZip();
  if (!z) return null;
  let m;
  try {
    m = JSON.parse(z.manifest);
  } catch {
    m = null;
  }
  if (!m) return { missing: ['no theme.json in it'] };
  const check = themeCheck(m, z.names);
  if (!check.whole) return { missing: check.missing };
  const dir = await freeDir(m.name);
  if (!(await unpackZip(DIR + '/' + dir))) return { missing: ['could not be unpacked'] };
  setTheme(FOLDER + dir, m.name, m.ui);
  return { id: FOLDER + dir };
}

/** use a theme and remember it, colours included */
export function setTheme(id, name, ui) {
  lost = '';
  chosen = { id, name, ui: id === SHIPPED ? null : ui };
  save(KEY, chosen);
  paint(chosen.ui);
}

// The one state the app cannot refuse. A folder theme was picked,
// then its folder went, or lost a file, or the folder grant itself is
// gone. There is nothing to paint or play from, so the app runs on the
// shipped theme and says so, once, in the Themes tab. Not a fallback
// rule: a theme is whole or unusable, and this one became unusable
// after it was chosen.
let lost = '';

/** the folder theme the app had to leave, named; "" when none */
export const lostTheme = () => lost;

/** the chosen folder theme cannot be read: back to the shipped one */
export function lose() {
  if (chosen.id === SHIPPED) return;
  const name = chosen.name || folderOf(chosen.id);
  setTheme(SHIPPED, '', null);
  lost = name; // after setTheme, which clears it: this is the one case it stays
}
