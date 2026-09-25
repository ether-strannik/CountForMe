// The player: the queue on screen, and the controls the strip has no
// room for. `music.js` owns what plays; this only shows it and calls
// it. Opened by tapping the song name on the strip.
//
// The position is read on a timer, and only while this is open. A
// progress bar is the one thing here that has to keep redrawing, and
// it is worth nothing on a screen nobody is looking at — the run
// screen must not pay for a sheet that is closed.
import {
  $,
  $$,
  $btn,
  $in,
  PLAY_SVG,
  PAUSE_SVG,
  PREV_SVG,
  NEXT_SVG,
  SHUFFLE_SVG,
  REPEAT_SVG,
  REPEAT_ONE_SVG,
  VOLUME_SVG,
  FOLDER_SVG,
} from './dom.js';
import { mediaVolume, setMediaVolume } from './system.js';
import { fmt } from './format.js';
import { openScreen, closeScreen } from './nav.js';
import {
  playlist,
  playingAt,
  playNth,
  trackLength,
  measureQueue,
  toggleMusic,
  nextTrack,
  prevTrack,
  isPlaying,
  position,
  duration,
  seekTo,
  setShuffle,
  isShuffled,
  setRepeat,
  repeatMode,
  playFolder,
  onMusicChange,
} from './music.js';
import { musicFolders, browseFolder, isAudio } from './files.js';

/** a song's name as it shows: without the extension nobody needs */
const shown = (f) => f.replace(/\.[^.]+$/, '');

/** what the repeat button shows in each of its three states */
const REPEAT = { off: REPEAT_SVG, all: REPEAT_SVG, one: REPEAT_ONE_SVG };
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
    // blank until the file has been read: a length that is not known
    // yet says nothing, rather than saying nothing lasting
    const len = trackLength(i);
    const time = document.createElement('small');
    time.textContent = len ? fmt(Math.round(len)) : '';
    row.appendChild(time);
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
  $('plPlay').innerHTML = isPlaying() ? PAUSE_SVG : PLAY_SVG;
  $btn('plPlay').disabled = !songs.length;
  $btn('plPrev').disabled = songs.length < 2;
  $btn('plNext').disabled = songs.length < 2;
  $('plShuffle').setAttribute('aria-pressed', String(isShuffled()));
  $('plRepeat').innerHTML = REPEAT[repeatMode()];
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
  measureQueue(); // the lengths fill in as the files are read
  ticker = setInterval(() => open() && drawTime(), TICK);
  openScreen('player', () => {
    clearInterval(ticker);
    ticker = null;
    hideVolume(); // it does not outlive the sheet it sits in
    $('player').hidden = true;
  });
}

// ---- the device's media volume ----
// The rocker on screen: the same stream the buttons on the side of the
// phone move, so it carries the cues and the voice with the music. It
// is read when the strip opens rather than remembered, because the
// rocker may have moved it since.
//
// The strip covers the seek row and goes away four seconds after the
// last touch. A volume control that stays up is a volume control in
// the way of the thing it belongs to.
const VOLUME_LINGER = 4000;
let volumeId;

function hideVolume() {
  clearTimeout(volumeId);
  volumeId = undefined;
  $('plVol').hidden = true;
}

/** push the strip's disappearance back to the full wait again */
function keepVolume() {
  clearTimeout(volumeId);
  volumeId = setTimeout(hideVolume, VOLUME_LINGER);
}

/** @param {{level: number, max: number}} v */
function showVolume(v) {
  const slider = $in('plVolSlider');
  slider.max = String(Math.max(1, v.max));
  slider.value = String(v.level);
  $('plVolVal').textContent = String(v.level);
}

async function openVolume() {
  if (!$('plVol').hidden) return hideVolume(); // a second press puts it away
  showVolume(await mediaVolume());
  $('plVol').hidden = false;
  keepVolume();
}

$('plVolBtn').addEventListener('click', openVolume);
$('plVolSlider').addEventListener('input', async () => {
  keepVolume();
  // what it actually landed on, which is not the asked-for level when
  // Do Not Disturb refuses the change
  showVolume(await setMediaVolume(+$in('plVolSlider').value));
});

// The marks that never change are set once, here, rather than redrawn
// with the state on every pass.
$('plPrev').innerHTML = PREV_SVG;
$('plNext').innerHTML = NEXT_SVG;
$('plShuffle').innerHTML = SHUFFLE_SVG;
$('plVolBtn').innerHTML = VOLUME_SVG;
$('plVolIcon').innerHTML = VOLUME_SVG;

// ---- the browser ----
// The music folders, walked one at a time. Nothing is indexed and
// nothing is scanned: a folder is listed when it is opened, so there is
// no library to build, keep fresh, or leave things out of.
//
// The roots are the grants themselves; below them it is URIs all the
// way down, because folders from different grants share no path. Going
// up is a row rather than a gesture, since Android back closes the
// sheet.

/** where the browser has walked to; empty is the list of music folders */
let crumbs = [];

async function drawBrowse() {
  const here = crumbs[crumbs.length - 1];
  const box = $('plBrowse');
  box.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'xlist';
  const row = (label, icon, go) => {
    const b = document.createElement('button');
    b.className = 'xrow';
    if (icon) {
      const mark = document.createElement('span');
      mark.className = 'fdicon';
      mark.innerHTML = icon;
      b.appendChild(mark);
    }
    const s = document.createElement('span');
    s.textContent = label;
    b.appendChild(s);
    b.addEventListener('click', go);
    list.appendChild(b);
  };

  if (crumbs.length) {
    row('..', '', () => {
      crumbs.pop();
      drawBrowse();
    });
  }

  const inside = here ? await browseFolder(here.uri) : { dirs: await musicFolders(), files: [] };
  for (const d of inside.dirs) {
    row(d.name, FOLDER_SVG, () => {
      crumbs.push({ uri: d.uri, name: d.name });
      drawBrowse();
    });
  }
  // the songs of this folder, as the queue they would become
  // The URI, not a URL made from it: what the queue keeps has to still
  // mean something the next time the app opens.
  const songs = inside.files.filter((f) => isAudio(f.name)).map((f) => ({ name: shown(f.name), uri: f.uri }));
  songs.forEach((s, i) =>
    row(s.name, '', () => {
      playFolder(songs, i);
      showPane('player'); // picking a song is done browsing
    }),
  );

  box.appendChild(list);
}

// ---- the sheet's two tabs ----
const PANES = { player: PLAY_SVG, browse: FOLDER_SVG };

function showPane(which) {
  $$('.pltab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pltab === which)));
  $('plPane').hidden = which !== 'player';
  $('plBrowse').hidden = which !== 'browse';
  if (which !== 'player') hideVolume();
  if (which === 'browse') drawBrowse();
}
$$('.pltab').forEach((b) => {
  b.innerHTML = PANES[b.dataset.pltab];
  b.addEventListener('click', () => showPane(b.dataset.pltab));
});

// No close button: Android back closes it, and so does the backdrop.
$('player').addEventListener('click', (e) => {
  if (e.target === $('player')) closeScreen('player'); // backdrop; Android back does the same
});

$('plPlay').addEventListener('click', toggleMusic);
$('plPrev').addEventListener('click', prevTrack);
$('plNext').addEventListener('click', nextTrack);
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
