// What a theme is, and whether one is whole.
//
// A theme is a folder: `theme.json` and the sound files it names. The
// JSON gives the theme its name, sets every colour token, and names a
// file for each cue, for the timer, and for each spoken count. Nothing
// is optional and nothing falls back: a theme with a gap cannot be
// picked, imported or exported. `themeCheck` is that gate, and it is
// the only place the rule is written. Pure, so it runs in Node.

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
 * Is this theme whole? Every gap is named, so the list can say what a
 * greyed theme lacks rather than only that it is out.
 * @param {any} m               the parsed theme.json
 * @param {string[]} files      names of the files beside it
 * @returns {{ok: boolean, missing: string[]}}
 */
export function themeCheck(m, files) {
  const missing = [];
  if (!m || typeof m !== 'object') return { ok: false, missing: ['theme.json'] };
  if (!text(m.name)) missing.push('name');
  const ui = m.ui || {};
  for (const t of TOKENS) if (!text(ui[t])) missing.push('colour ' + t);
  const have = new Set(files);
  const named = (group, keys, what) => {
    const g = m[group] || {};
    for (const k of keys) {
      if (!text(g[k])) missing.push(what + ' ' + k);
      else if (!have.has(g[k])) missing.push('file ' + g[k] + ' for ' + what + ' ' + k);
    }
  };
  named('sounds', SOUNDS, 'sound');
  named('counts', COUNTS, 'count');
  return { ok: !missing.length, missing };
}
