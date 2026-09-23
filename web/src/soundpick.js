// The sound picker: any file in the theme's library. A row plays when
// tapped; only OK keeps it. The library is every audio file the theme
// holds, the seven it assigns to cues among them. Nothing outside the
// theme is offered.
//
// A timer picks from it. So does the builder, for a cue or a count on
// a theme of the user's own, and there the picker also has Add: one
// file from anywhere, copied into the theme's folder, in the library
// from then on. That is the only way a sound comes into a theme.
import { $ } from './dom.js';
import { play, soundLibrary, ensureSound, timerSound, refreshSounds } from './sound.js';
import { pickAudio } from './files.js';
import { addToLibrary } from './theme.js';
import { openScreen, closeScreen } from './nav.js';

let picked = '';
/** @type {((file: string) => void) | null} */
let keep = null;

const shown = (file) => file.replace(/\.[^.]+$/, '');

function drawRows() {
  const box = $('tsList');
  box.innerHTML = '';
  for (const file of soundLibrary()) {
    const row = document.createElement('button');
    row.className = 'xrow';
    row.setAttribute('aria-pressed', String(file === picked));
    const name = document.createElement('span');
    name.textContent = shown(file);
    row.appendChild(name);
    row.addEventListener('click', () => {
      picked = file;
      drawRows();
      play(file);
    });
    box.appendChild(row);
  }
}

/**
 * @param {string} current  the file in use
 * @param {(file: string) => void} onKeep  called with the pick on OK
 * @param {boolean} [canAdd]  offer Add: only on a theme of the user's own
 */
export async function openSoundPicker(current, onKeep, canAdd = false) {
  await ensureSound(current); // the library is read with the manifest
  // a file the theme does not have shows as what it plays instead
  picked = soundLibrary().includes(current) ? current : timerSound();
  keep = onKeep;
  $('tsAdd').hidden = !canAdd;
  drawRows();
  $('tsOverlay').hidden = false;
  openScreen('tsOverlay', () => ($('tsOverlay').hidden = true));
}

// Add: the system picker, then the file is written into the theme's
// folder and the library read again, with the new file picked.
$('tsAdd').addEventListener('click', async () => {
  const f = await pickAudio();
  if (!f) return;
  if (!(await addToLibrary(f.name, f.bytes))) return;
  refreshSounds();
  await ensureSound(f.name);
  picked = f.name;
  drawRows();
  play(f.name);
});

$('tsOk').addEventListener('click', () => {
  if (picked && keep) keep(picked);
  closeScreen('tsOverlay');
});
$('tsCancel').addEventListener('click', () => closeScreen('tsOverlay'));
$('tsOverlay').addEventListener('click', (e) => {
  if (e.target === $('tsOverlay')) closeScreen('tsOverlay'); // backdrop; Android back does the same
});
