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
import {
  listDir,
  readFile,
  writeText,
  writeFile,
  copyDir,
  removePath,
  exportZip,
  pickZip,
  unpackZip,
} from './files.js';
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
    const check = themeCheck(m, await soundNames(dir));
    out.push({ id: FOLDER + dir, name: (m && m.name) || dir, ui: (m && m.ui) || {}, ...check });
  }
  return out;
}

/** an audio file, by its name */
const AUDIO = /\.(mp3|wav|ogg|opus|m4a|aac)$/i;

// A theme is a tree: theme.json, the cue sounds under `sounds/`, the
// music under `media/`. Neither folder has to exist — one is made the
// first time something is written into it, and a folder that is not
// there lists as empty, which is the right answer for a theme with no
// music and for one still being built.
const SOUNDS_DIR = 'sounds';
const MEDIA_DIR = 'media';

/** the path of one of a theme's folders */
const inTheme = (dir, sub) => DIR + '/' + dir + '/' + sub;

/** the cue sounds a folder theme holds, for the check and the library */
const soundNames = async (dir) => (await listDir(inTheme(dir, SOUNDS_DIR))).names;

/** the sound files named in a zip's listing, without their folder */
const soundsIn = (names) =>
  names.filter((n) => n.startsWith(SOUNDS_DIR + '/')).map((n) => n.slice(SOUNDS_DIR.length + 1));

/**
 * Where the theme in use is read from: its manifest, its library, and
 * the bytes of a file beside it. The sound engine goes through this
 * and knows no folder. A folder theme that cannot be read any more
 * resolves its manifest to null; the engine then falls back through
 * `lose()`.
 *
 * The library is every audio file in the theme's `sounds/`. The shipped
 * theme's folders cannot be listed, so its theme.json names them; a
 * folder theme's listing is read, and a file dropped in appears. The
 * same holds for `media/`, which no key ever assigns: it is whatever
 * is in there.
 * @returns {{manifest: () => Promise<any>, library: () => Promise<string[]>,
 *   media: () => Promise<string[]>, bytes: (file: string) => Promise<ArrayBuffer | null>}}
 */
export function themeSource() {
  const dir = folderOf(chosen.id);
  if (!dir) {
    return {
      manifest: shippedTheme,
      library: async () => (await shippedTheme()).library || [],
      media: async () => (await shippedTheme()).media || [],
      bytes: async (file) => {
        const r = await fetch('theme/' + SOUNDS_DIR + '/' + file);
        return r.ok ? r.arrayBuffer() : null;
      },
    };
  }
  const sounds = inTheme(dir, SOUNDS_DIR);
  return {
    // usable, or nothing: a colour gone since the theme was picked is
    // the same as the theme gone. A sound gone is that sound silent.
    manifest: async () => {
      const m = await folderManifest(dir);
      return themeCheck(m, await soundNames(dir)).ok ? m : null;
    },
    library: async () => (await soundNames(dir)).filter((f) => AUDIO.test(f)),
    media: async () => (await listDir(inTheme(dir, MEDIA_DIR))).names.filter((f) => AUDIO.test(f)),
    bytes: (file) => readFile(sounds + '/' + file),
  };
}

/** the songs the theme in use holds, in name order; empty when it has none */
export const mediaList = () => themeSource().media();

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
 * user's: its manifest under the new name, its sounds, and its music.
 * Nord included. Whole from the first second, then edited like any
 * theme of the user's own. Put on at once.
 *
 * Both folders are copied natively, not a file at a time through here.
 * `media/` can be an album, and that is not something to carry through
 * a page as base64.
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
  const from = folderOf(chosen.id);
  const asset = !from;
  const at = (sub) => (asset ? 'public/theme/' + sub : inTheme(from, sub));
  if (!(await copyDir(at(SOUNDS_DIR), inTheme(dir, SOUNDS_DIR), asset))) return '';
  // a theme with no music has no media/, and copying nothing succeeds
  await copyDir(at(MEDIA_DIR), inTheme(dir, MEDIA_DIR), asset);
  // no `library` key: a folder theme's library is its sounds/
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
  return writeFile(inTheme(dir, SOUNDS_DIR) + '/' + name, bytes);
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
  const check = themeCheck(m, soundsIn(z.names));
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
// after it was chosen. A preset category naming a theme that is not
// there is the same case: the app stays where it is and says so.
let lost = '';

/** what the Themes tab says once, about a theme that could not be used; "" when nothing */
export const lostTheme = () => lost;

/** the chosen folder theme cannot be read: back to the shipped one */
export function lose() {
  if (chosen.id === SHIPPED) return;
  const name = chosen.name || folderOf(chosen.id);
  setTheme(SHIPPED, '', null);
  lost = name + ' could not be read any more, so the app is on Nord.'; // after setTheme, which clears it
}

// ---- a theme named from outside: by a preset category ----
// A category may name a theme, as `shipped` for Nord or a folder name
// under themes/. That is one string in the presets file, so a set of
// workouts shared without its theme still loads, and a theme shared
// without workouts still works.

/** a theme id as a set names it: "shipped", or its folder name */
export const refOfId = (id) => (id === SHIPPED ? 'shipped' : folderOf(id));

/**
 * Put on the theme a category names. Nothing for "". A folder name
 * that is not in the folder, or a theme there that cannot be used,
 * leaves the theme in use as it is and says so once.
 * @param {string} ref  "shipped", a folder name, or ""
 * @returns {Promise<boolean>} true when the theme is on
 */
export async function useTheme(ref) {
  if (!ref) return false;
  if (ref === 'shipped') {
    if (chosen.id !== SHIPPED) setTheme(SHIPPED, '', null);
    return true;
  }
  const m = await folderManifest(ref);
  const check = themeCheck(m, await soundNames(ref));
  if (!check.ok) {
    lost =
      'The set names a theme, ' +
      ref +
      ', that is not in the folder, so the app stays on ' +
      (chosen.name || 'Nord') +
      '.';
    return false;
  }
  if (chosen.id !== FOLDER + ref) setTheme(FOLDER + ref, m.name, m.ui);
  return true;
}
