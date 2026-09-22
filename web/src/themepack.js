// What a theme is, and whether one can be used.
//
// A theme is a folder: `theme.json` and the sound files it names. The
// JSON gives the theme its name, sets every colour token, and names a
// file for each cue, for the timer, and for each spoken count. Nothing
// falls back to anything outside the theme.
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
 * Can this theme be used, and is it whole? Every gap is named, so a
 * list can say what a theme lacks rather than only that it is out.
 * @param {any} m               the parsed theme.json
 * @param {string[]} files      names of the files beside it
 * @returns {{ok: boolean, whole: boolean, missing: string[], silent: string[]}}
 *   ok      the name and every colour are there: it can be put on
 *   whole   ok, and every sound and count too: it can be handed on
 *   missing every gap, named, for a message
 *   silent  the sound and count keys with no file behind them
 */
export function themeCheck(m, files) {
  const missing = [];
  const silent = [];
  if (!m || typeof m !== 'object') return { ok: false, whole: false, missing: ['theme.json'], silent };
  if (!text(m.name)) missing.push('name');
  const ui = m.ui || {};
  for (const t of TOKENS) if (!text(ui[t])) missing.push('colour ' + t);
  const ok = !missing.length;
  const have = new Set(files);
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
