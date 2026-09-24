// What a theme is, and whether one can be used.
//
// A theme is a folder of two folders and `theme.json`, a preset over
// them. `sounds/` is the library; `media/` is the music. The JSON
// gives the theme its name, sets every colour token, and names a file
// from `sounds/` for each cue, for the timer, and for each spoken
// count. A timer may ring with any file in `sounds/`. Nothing falls
// back to anything outside the theme.
//
// Music lives inside the theme, so a category naming a theme says
// what plays as well as how it looks, with nothing left to point at.
// No key says which song or in what order: `media/` is read as it is
// found. A song can never be missing, an empty folder is silence, and
// a theme with no music at all is still whole.
//
// Two lines are drawn, because a theme is built step by step and seen
// live as it goes. `ok` is the line for using it: the name and every
// colour, since a screen with a colour missing cannot be worked in. A
// sound or count still blank is silence at that moment, which is safe.
// `whole` is the line for handing it on: everything present, so what
// is exported or imported is the complete thing. `themeCheck` is both
// gates, and the only place the rule is written. Pure, so it runs in
// Node.

/** every colour token a theme sets */
export const TOKENS = [
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

/** every sound a theme names: the six cues, then what a timer plays */
export const SOUNDS = ['approach', 'prepare', 'main', 'turn', 'rest', 'end', 'timer'];

/** the spoken counts, as the keys they are named by */
export const COUNTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const text = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * What a new theme starts with: every colour set, so the screen can be
 * worked in from the first second, and every sound blank. The colours
 * are the blue palette the app had before Nord, kept here as values
 * so a new theme reads nothing from anywhere.
 */
export const NEW_UI = {
  bg: '#12161a',
  card: '#191f26',
  line: '#232b34',
  text: '#e6e6e6',
  muted: '#8b98a5',
  accent: '#64b5f6',
  warn: '#d8a657',
  bad: '#ef6b6b',
  go: '#66bb6a',
  'on-accent': '#06121f',
  'accent-soft': '#64b5f666',
  action: '#eef1f4',
  'on-action': '#0b0f14',
  scrim: '#00000099',
  glyph: '#5b6672',
};

/** a colour as a theme writes it: hex only, 3, 4, 6 or 8 digits */
export const isHex = (v) => /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(v || '').trim());

/** a new theme's manifest: named, coloured, silent */
export const blankTheme = (name) => ({ name, ui: { ...NEW_UI }, sounds: {}, counts: {} });

/** a folder name from a theme name: lower case, dashes, nothing else */
export function slug(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'theme';
}

/**
 * Can this theme be used, and is it whole? Every gap is named, so a
 * list can say what a theme lacks rather than only that it is out.
 * @param {any} m               the parsed theme.json
 * @param {string[]} sounds     names of the files in the theme's sounds/
 * @returns {{ok: boolean, whole: boolean, missing: string[], silent: string[]}}
 *   ok      the name and every colour are there: it can be put on
 *   whole   ok, and every sound and count too: it can be handed on
 *   missing every gap, named, for a message
 *   silent  the sound and count keys with no file behind them
 */
export function themeCheck(m, sounds) {
  const missing = [];
  const silent = [];
  if (!m || typeof m !== 'object') return { ok: false, whole: false, missing: ['theme.json'], silent };
  if (!text(m.name)) missing.push('name');
  const ui = m.ui || {};
  for (const t of TOKENS) if (!text(ui[t])) missing.push('colour ' + t);
  const ok = !missing.length;
  const have = new Set(sounds);
  const named = (group, keys, what) => {
    const g = m[group] || {};
    for (const k of keys) {
      if (!text(g[k])) missing.push(what + ' ' + k);
      else if (!have.has(g[k])) missing.push('file ' + g[k] + ' for ' + what + ' ' + k);
      else continue;
      silent.push(k);
    }
  };
  named('sounds', SOUNDS, 'sound');
  named('counts', COUNTS, 'count');
  return { ok, whole: !missing.length, missing, silent };
}
