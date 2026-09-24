// The player: the queue on screen, and the controls the strip has no
// room for. `music.js` owns what plays; this only shows it and calls
// it. Opened by tapping the song name on the strip.
//
// The position is read on a timer, and only while this is open. A
// progress bar is the one thing here that has to keep redrawing, and
// it is worth nothing on a screen nobody is looking at — the run
// screen must not pay for a sheet that is closed.
import { $, $btn, $in } from './dom.js';
import { fmt } from './format.js';
import { openScreen, closeScreen } from './nav.js';
import {
  playlist,
  playingAt,
  playNth,
  toggleMusic,
  nextTrack,
  prevTrack,
  chooseFile,
  isPlaying,
  position,
  duration,
  seekTo,
  setShuffle,
  isShuffled,
  setRepeat,
  repeatMode,
  onMusicChange,
} from './music.js';

const PLAY = '▶';
const PAUSE = '⏸';
/** what the repeat button shows in each of its three states */
const REPEAT = { off: '↻', all: '↻', one: '↻¹' };
const NEXT_MODE = { off: 'all', all: 'one', one: 'off' };

/** how often the bar catches up while the player is open */
const TICK = 250;
let ticker = null;

/** the thumb is the user's while it is under a finger */
let dragging = false;

const open = () => !$('player').hidden;

function drawList() {
  const box = $('plList');
  const songs = playlist();
  const now = playingAt();
  box.innerHTML = '';
  songs.forEach((name, i) => {
    const row = document.createElement('button');
    row.className = 'xrow';
    row.setAttribute('aria-pressed', String(i === now));
    const label = document.createElement('span');
    label.textContent = name;
    row.appendChild(label);
    row.addEventListener('click', () => playNth(i));
    box.appendChild(row);
  });
}

/** the part that changes as a song runs */
function drawTime() {
  const len = duration();
  const at = dragging ? +$in('plSeek').value : position();
  const seek = $in('plSeek');
  seek.max = String(Math.max(1, Math.round(len)));
  seek.disabled = !len;
  if (!dragging) seek.value = String(Math.round(at));
  $('plAt').textContent = fmt(Math.round(at));
  $('plLen').textContent = fmt(Math.round(len));
}

/** the part that changes when the track or the state does */
function draw() {
  if (!open()) return;
  const songs = playlist();
  $('plTitle').textContent = songs[playingAt()] || 'none';
  $('plPlay').textContent = isPlaying() ? PAUSE : PLAY;
  $btn('plPlay').disabled = !songs.length;
  $btn('plPrev').disabled = songs.length < 2;
  $btn('plNext').disabled = songs.length < 2;
  $('plShuffle').setAttribute('aria-pressed', String(isShuffled()));
  $('plRepeat').textContent = REPEAT[repeatMode()];
  $('plRepeat').setAttribute('aria-pressed', String(repeatMode() !== 'off'));
  drawList();
  drawTime();
}

// The queue changes from three places — the strip, this sheet, and a
// theme coming on — so it says so once and everything listening draws.
onMusicChange(draw);

export function openPlayer() {
  $('player').hidden = false;
  draw();
  ticker = setInterval(() => open() && drawTime(), TICK);
  openScreen('player', () => {
    clearInterval(ticker);
    ticker = null;
    $('player').hidden = true;
  });
}

$('plClose').addEventListener('click', () => closeScreen('player'));
$('player').addEventListener('click', (e) => {
  if (e.target === $('player')) closeScreen('player'); // backdrop; Android back does the same
});

$('plPlay').addEventListener('click', toggleMusic);
$('plPrev').addEventListener('click', prevTrack);
$('plNext').addEventListener('click', nextTrack);
$('plFile').addEventListener('click', chooseFile);
$('plShuffle').addEventListener('click', () => {
  setShuffle(!isShuffled());
  draw();
});
$('plRepeat').addEventListener('click', () => {
  setRepeat(NEXT_MODE[repeatMode()]);
  draw();
});

// Dragging owns the thumb until it is let go, or the tick would pull
// it back to where the song actually is on every pass.
$('plSeek').addEventListener('pointerdown', () => (dragging = true));
$('plSeek').addEventListener('input', drawTime);
$('plSeek').addEventListener('change', () => {
  seekTo(+$in('plSeek').value);
  dragging = false;
});
