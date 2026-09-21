// The palette at runtime. A theme is a JSON file in `themes/`, the same
// shape the terminal board uses: a name, and the tokens it sets. There
// is no server here to scan that folder, so `themes/index.json` names
// the files, numeric prefix giving the order. A theme that leaves a
// token out keeps whatever `base.css` says for it.
//
// The chosen colours are kept alongside the chosen file, so the theme is
// painted the instant this module loads, before anything draws. The
// files themselves are only read when the settings page wants the list.
import { load, save } from './storage.js';

const KEY = 'timer.theme';

/** every token a theme may set */
const TOKENS = [
  'bg',
  'card',
  'line',
  'text',
  'muted',
  'accent',
  'warn',
  'bad',
  'go',
  'on-accent',
  'accent-soft',
  'action',
  'on-action',
  'scrim',
  'glyph',
];

/** @param {Record<string, string> | null} ui  null puts base.css back */
function paint(ui) {
  const s = document.documentElement.style;
  for (const t of TOKENS) {
    const v = ui && ui[t];
    if (v) s.setProperty('--' + t, v);
    else s.removeProperty('--' + t);
  }
}

let chosen = load(KEY, { file: '', ui: null });
paint(chosen.ui);

/** the file of the theme in use; "" means none was ever chosen */
export const themeFile = () => chosen.file;

/**
 * Every theme, read from disk.
 * @returns {Promise<{file: string, name: string, ui: Record<string, string>}[]>}
 */
export async function themeList() {
  let names;
  try {
    names = await (await fetch('themes/index.json')).json();
  } catch {
    return []; // no index is a valid state: the stylesheet is the look
  }
  const out = [];
  for (const file of Array.isArray(names) ? names : []) {
    try {
      const t = await (await fetch('themes/' + file)).json();
      out.push({ file, name: t.name || file, ui: t.ui || {} });
    } catch {
      /* one bad theme costs that theme, not the list */
    }
  }
  return out;
}

/** use a theme and remember it, colours included */
export function setTheme(file, ui) {
  chosen = { file, ui: file ? ui : null };
  save(KEY, chosen);
  paint(chosen.ui);
}
