// Picking a sound: one sheet, a row per sound, the Android pattern.
// Tapping a row marks it AND plays it, so a sound can be heard before
// it is kept. Nothing is applied until OK — Cancel, the backdrop and
// Android back all leave the old choice alone.
//
// Both places that choose a sound use this: the five interval cues in
// settings, and a countdown timer. The value it hands back is what
// sound.js understands — `pack:<name>` for a sound shipped in the app,
// a bare name for a file in the user's folder.
import { $ } from './dom.js';
import { PACK, playFile } from './sound.js';
import { openScreen, closeScreen } from './nav.js';

/** what a choice is called on screen; a shipped sound needs no extension */
export const soundName = (v) => (v.startsWith(PACK) ? v.slice(PACK.length).replace(/\.mp3$/i, '') : v);

let marked = '';
/** @type {((value: string) => void) | null} */
let keep = null;

/** one heading and its rows; nothing at all when the group is empty */
function group(box, label, values) {
  if (!values.length) return;
  const h = document.createElement('div');
  h.className = 'xgroup';
  h.textContent = label;
  box.appendChild(h);
  values.forEach((v) => {
    const row = document.createElement('button');
    row.className = 'xrow';
    row.innerHTML = '<input type="radio" tabindex="-1" /><span></span>';
    const dot = /** @type {HTMLInputElement} */ (row.querySelector('input'));
    row.querySelector('span').textContent = soundName(v);
    dot.checked = v === marked;
    row.addEventListener('click', () => {
      marked = v;
      [...box.querySelectorAll('input')].forEach((el, i) => {
        /** @type {HTMLInputElement} */ (el).checked = el === dot && i >= 0;
      });
      dot.checked = true;
      playFile(v); // hear it before keeping it
    });
    box.appendChild(row);
  });
}

/**
 * Open the picker.
 * @param {string} title    the row being set, e.g. "Main"
 * @param {string} current  the choice to start marked
 * @param {string[]} pack   shipped sounds, bare file names
 * @param {string[]} mine   the user's folder, bare file names
 * @param {(value: string) => void} onKeep  called on OK, never on cancel
 */
export function openSoundPicker(title, current, pack, mine, onKeep) {
  marked = current;
  keep = onKeep;
  $('sndTitle').textContent = title;
  const box = $('sndList');
  box.innerHTML = '';
  group(
    box,
    'In the app',
    pack.map((f) => PACK + f),
  );
  group(box, 'Your folder', mine);
  // a choice whose file the folder has not got: kept, and said so
  if (!current.startsWith(PACK) && !mine.includes(current)) group(box, 'Missing', [current]);
  $('sndOverlay').hidden = false;
  openScreen('sndpick', () => ($('sndOverlay').hidden = true));
}

$('sndOk').addEventListener('click', () => {
  const fn = keep;
  const value = marked;
  keep = null;
  closeScreen('sndpick');
  if (fn) fn(value);
});
$('sndCancel').addEventListener('click', () => {
  keep = null;
  closeScreen('sndpick');
});
$('sndOverlay').addEventListener('click', (e) => {
  if (e.target !== $('sndOverlay')) return; // backdrop only
  keep = null;
  closeScreen('sndpick');
});
