// The theme in use. The app ships one, in `theme/`: its colours, its
// sounds and its spoken counts, the shape `themepack.js` describes.
// Other themes will come from the folder the user chose, whole or not
// at all. Nothing is overridden from anywhere else.
//
// The shipped theme's colours are also the stylesheet's, so the first
// frame is right without waiting for a fetch. A theme from the folder
// paints its colours over the stylesheet, and they are kept alongside
// the choice so the next launch paints them before anything draws.
import { load, save } from './storage.js';
import { TOKENS } from './themepack.js';

const KEY = 'timer.theme';

/** the id of the theme the app ships with */
export const SHIPPED = 'shipped';

/** @param {Record<string, string> | null} ui  null puts the stylesheet back */
function paint(ui) {
  const s = document.documentElement.style;
  for (const t of TOKENS) {
    const v = ui && ui[t];
    if (v) s.setProperty('--' + t, v);
    else s.removeProperty('--' + t);
  }
}

/** @type {{id: string, ui: Record<string, string> | null}} */
let chosen = load(KEY, { id: SHIPPED, ui: null });
// A choice made before themes were whole units named a file that no
// longer exists. It is dropped, and the app is on the shipped theme.
if (!chosen || chosen.id !== SHIPPED) {
  chosen = { id: SHIPPED, ui: null };
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

/**
 * Every theme that can be picked. Only the shipped one, until the
 * folder is read.
 * @returns {Promise<{id: string, name: string, ui: Record<string, string>}[]>}
 */
export async function themeList() {
  try {
    const t = await shippedTheme();
    return [{ id: SHIPPED, name: t.name, ui: t.ui }];
  } catch {
    return [{ id: SHIPPED, name: 'Nord', ui: {} }]; // the file is in the app; this is not reached
  }
}

/**
 * Where the theme in use is read from: its manifest, and the bytes of
 * a file beside it. The sound engine goes through this and knows no
 * folder. Only the shipped theme, until the folder is read.
 * @returns {{manifest: () => Promise<any>, bytes: (file: string) => Promise<ArrayBuffer | null>}}
 */
export function themeSource() {
  return {
    manifest: shippedTheme,
    bytes: async (file) => {
      const r = await fetch('theme/' + file);
      return r.ok ? r.arrayBuffer() : null;
    },
  };
}

/** use a theme and remember it, colours included */
export function setTheme(id, ui) {
  chosen = { id, ui: id === SHIPPED ? null : ui };
  save(KEY, chosen);
  paint(chosen.ui);
}
