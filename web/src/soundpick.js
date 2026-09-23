// The sound picker: any file in the theme's library, for a countdown
// timer. A row plays when tapped; only OK keeps it. The library is
// every audio file the theme holds, the seven it assigns to cues among
// them, so a timer can ring with anything the theme brought along.
// Nothing outside the theme is offered: more sounds is a bigger theme.
import { $ } from './dom.js';
import { play, soundLibrary, ensureSound, timerSound } from './sound.js';
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
 */
export async function openSoundPicker(current, onKeep) {
  await ensureSound(current); // the library is read with the manifest
  // a file the theme does not have shows as what it plays instead
  picked = soundLibrary().includes(current) ? current : timerSound();
  keep = onKeep;
  drawRows();
  $('tsOverlay').hidden = false;
  openScreen('tsOverlay', () => ($('tsOverlay').hidden = true));
}

$('tsOk').addEventListener('click', () => {
  if (picked && keep) keep(picked);
  closeScreen('tsOverlay');
});
$('tsCancel').addEventListener('click', () => closeScreen('tsOverlay'));
$('tsOverlay').addEventListener('click', (e) => {
  if (e.target === $('tsOverlay')) closeScreen('tsOverlay'); // backdrop; Android back does the same
});
