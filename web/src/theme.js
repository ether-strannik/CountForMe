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
import { listDir, readFile, writeText } from './files.js';
import { TOKENS, themeCheck, blankTheme, slug } from './themepack.js';

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
  const taken = new Set((await listDir(DIR)).dirs);
  let dir = slug(name);
  for (let n = 2; taken.has(dir); n++) dir = slug(name) + '-' + n;
  const m = blankTheme(name.trim() || dir);
  if (!(await writeText(DIR + '/' + dir + '/theme.json', JSON.stringify(m, null, 2) + '\n'))) return '';
  setTheme(FOLDER + dir, m.name, m.ui);
  return FOLDER + dir;
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
