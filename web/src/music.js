// Music: a queue of songs, one playing, and the strip that shows it.
//
// An audio element for the decoding, wired into the sound engine's
// music bus for everything after it. The element streams; the bus is
// what the duck under each cue is placed on, which an element's own
// volume could never take. Each does the half it is good at.
//
// No song is ever read into the page. A theme's music becomes a URL
// the local server answers and the decoder pulls from as it plays, so
// a track starts on its first chunk rather than its last and its
// length costs no memory. Carrying the bytes instead — as the cue
// sounds do, being small — meant a base64 string over the bridge and a
// decode loop per byte here, which is seconds of nothing before a
// ten-megabyte song makes a sound.
//
// The queue is the theme's `media/`, in name order. That is the whole
// of choosing: a category names a theme, the theme carries its music,
// and nothing points at a playlist. Anything else comes from the
// browser, a folder at a time.
//
// What was playing last is what the app opens on, whichever of the two
// it came from. A theme's music loads when that theme is put on, not
// every time the app starts.
import { $, $btn, PLAY_SVG, PAUSE_SVG } from './dom.js';
import { load, save } from './storage.js';
import { songUrl } from './files.js';
import { mediaList, mediaUrl, onThemeChange } from './theme.js';
import { themeMusic } from './prefs.js';
import { audioCtx, musicInput } from './sound.js';
import { musicState, musicStopped, onMusicControl } from './session.js';

const NOTE = '♪';

/** what the end of a song does: stop, start the next, or play it again */
const OFF = 'off';
const ALL = 'all';
const ONE = 'one';

const el = new Audio();
// Metadata only until the user asks for it: loading a song the app
// merely knows about, at every launch, is the cost this was built to
// avoid. Playing switches it.
el.preload = 'metadata';

/**
 * One song in the queue, and never a URL.
 *
 * A track from the theme is a file name under its `media/`; one from
 * the browser is a URI of its own. Either is turned into something the
 * decoder can pull from at the moment it is reached, because a URL
 * carries the server that answered it and that is not the same server
 * next time the app opens.
 * @typedef {{ name: string, file?: string, uri?: string }} Track
 */

/** @type {Track[]} */
let queue = [];
/** the positions in `queue`, in the order they play */
let order = [];
/** where in `order` we are; -1 when the queue is empty */
let at = -1;
/** which position the element actually holds, which is not always `at` */
let loaded = -1;
let shuffled = false;
let repeat = OFF;

const shown = (f) => f.replace(/\.[^.]+$/, '');

/** the track playing, or null */
const current = () => (at < 0 ? null : queue[order[at]] || null);

// How long each song runs. Only the decoder knows, and only once it
// has read the file's header, so this fills in rather than being
// known: the track playing gives its length for nothing, and the rest
// are read one at a time when the player opens. Keyed by the file
// itself, so shuffling and changing theme cost nothing.
/** @type {Map<string, number>} */
const lengths = new Map();
const keyOf = (t) => (t ? t.file || t.uri || '' : '');

/** what a track plays from, worked out when it is reached */
const urlOf = async (t) => (t.uri ? songUrl(t.uri) : t.file ? await mediaUrl(t.file) : '');

/** seconds the nth song of the ordered queue runs; 0 until it is known */
export const trackLength = (n) => lengths.get(keyOf(queue[order[n]])) || 0;

/**
 * Read the length of every song that has not given one. One at a time:
 * this opens the file to read its header, and a queue is a folder of
 * them.
 */
export async function measureQueue() {
  for (const track of queue) {
    const key = keyOf(track);
    if (!key || lengths.has(key)) continue;
    const url = await urlOf(track);
    if (!url) continue;
    await new Promise((done) => {
      const probe = new Audio();
      probe.preload = 'metadata';
      const over = () => {
        probe.src = '';
        done(null);
      };
      probe.addEventListener('loadedmetadata', () => {
        if (isFinite(probe.duration)) lengths.set(key, probe.duration);
        over();
      });
      probe.addEventListener('error', over);
      probe.src = url;
    });
    draw(); // the list fills in as they come, rather than all at the end
  }
}

// The element joins the graph once and stays: a media element source
// can only be made once, and making it is what takes the element's
// output off the speakers and onto the bus. It waits for the first
// play, because until a gesture has resumed the context there is no
// graph to join.
/** @type {MediaElementAudioSourceNode | null} */
let src = null;
function joinBus() {
  if (src) return;
  try {
    src = audioCtx().createMediaElementSource(el);
    src.connect(musicInput());
  } catch {
    /* no audio on this device; the element plays on its own */
  }
}

// ---- what the phone shows while the app is away ----
// The lock screen and the shade, through the browser's own media
// session: the song's name, and buttons that reach back in here.
//
// Nothing native is involved. Chromium builds the Android media session
// from this, when it builds one at all — a page in a WebView does not
// always get the notification a page in a browser would.
const session = () => /** @type {any} */ (navigator).mediaSession || null;

/** the name and the state, whenever either changes */
function tellPhone() {
  const s = session();
  if (!s) return;
  const track = current();
  try {
    s.metadata = track ? new MediaMetadata({ title: track.name }) : null;
    s.playbackState = track ? (el.paused ? 'paused' : 'playing') : 'none';
  } catch {
    /* no media session here; the strip is still the way in */
  }
}

/** the buttons on the lock screen, and on a headset, once */
function takeButtons() {
  const s = session();
  if (!s || !s.setActionHandler) return;
  const set = (name, fn) => {
    try {
      s.setActionHandler(name, fn);
    } catch {
      /* this device does not offer that one */
    }
  };
  set('play', () => toggleMusic());
  set('pause', () => el.pause());
  set('previoustrack', () => prevTrack());
  set('nexttrack', () => nextTrack());
}

// The foreground service, held for as long as a song is playing.
// Without it Android freezes the app within seconds of it leaving the
// screen, and the music stops with the process. A session or a
// countdown timer holds the same service for its own reasons; whoever
// is left keeps it.
//
// A paused song keeps the notification. Taking it down would leave the
// lock screen with nothing to press, and pressing play there is the
// whole point of it being there. Closing it by hand is the one thing
// that takes it away, and it stays away until something plays again.
//
// What was last said is remembered, because `draw` runs for more than a
// change of song and saying the same thing again would repost the
// notification for nothing. The position is part of that: the system
// carries the bar forward on its own, so it only needs telling when the
// song, the state or the place actually changes.
let heldFor = '';
/** the notification was closed by hand; nothing puts it back but play */
let dismissed = false;

function holdProcess() {
  const track = current();
  if (dismissed) return;
  const want = track ? [el.paused, track.name, Math.round(position()), Math.round(duration())].join('|') : '';
  if (want === heldFor) return;
  heldFor = want;
  if (!track) return musicStopped();
  musicState(track.name, el.paused, position(), duration());
}

/** the X on the notification: playing stops and it goes */
function dismiss() {
  dismissed = true;
  heldFor = '';
  el.pause();
  musicStopped();
}

/** the strip, and then whatever else is showing the same thing */
function draw() {
  const track = current();
  $('mName').textContent = NOTE + ' ' + (track ? track.name : 'none');
  $('mName').classList.toggle('none', !track);
  $('mPlay').innerHTML = el.paused ? PLAY_SVG : PAUSE_SVG;
  $btn('mPlay').disabled = !track;
  holdProcess();
  tellPhone();
  for (const fn of watchers) fn();
}

/** the play order: straight through, or shuffled around what is playing */
function reorder() {
  const playing = at < 0 ? -1 : order[at];
  order = queue.map((_, i) => i);
  if (shuffled) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  // whatever is playing keeps playing: it moves to where it now sits
  at = playing < 0 ? -1 : order.indexOf(playing);
}

// What was playing last time, so the app opens on it rather than on
// nothing. The queue and the place in it, not a URL: a URL carries the
// server that answered it, and that is not the same server next time.
//
// Last played always wins at launch. A theme's music is loaded when
// that theme is put on — by hand or by a preset — and not every time
// the app opens, or a folder played yesterday would be unreachable
// without going and finding it again.
const KEPT = 'timer.queue';
/** how far the song may run before the place is written down again */
const SAVE_EVERY = 5;
let saved = 0;

function remember() {
  saved = el.currentTime || 0;
  save(KEPT, { tracks: queue, at, pos: saved });
}

/**
 * Seconds into the song the app was closed on, waiting for that song to
 * be loaded. A place cannot be set on an element that has not read the
 * file yet, so it is held here — and shown from here, so the bar opens
 * where the song was left rather than at nothing.
 *
 * It belongs to one position in the queue. Play something else first
 * and it is dropped: it was never that song's place.
 */
let resumeAt = 0;
let resumeIndex = -1;

/** the queue from last time; false when there was none */
function recall() {
  const kept = load(KEPT, null);
  if (!kept || !Array.isArray(kept.tracks) || !kept.tracks.length) return false;
  setQueue(kept.tracks);
  at = Math.min(Math.max(0, Math.round(kept.at) || 0), order.length - 1);
  resumeAt = Math.max(0, kept.pos || 0);
  resumeIndex = at;
  draw();
  return true;
}

/**
 * Put a queue up. Whatever was playing stops: its file belonged to the
 * queue being replaced. Nothing starts — a theme coming on is not a
 * reason to make noise, and a session may already be running.
 * @param {Track[]} tracks
 */
function setQueue(tracks) {
  el.pause();
  loaded = -1;
  queue = tracks;
  at = -1;
  reorder();
  if (queue.length) at = 0;
  remember();
  draw();
}

/** load the track at a position in the order and play it */
async function playAt(i) {
  if (!queue.length) return;
  at = ((i % order.length) + order.length) % order.length;
  const track = current();
  if (!track) return;
  const url = await urlOf(track);
  draw();
  if (!url) return; // the file went; the strip still names it
  el.src = url;
  loaded = at;
  // Back where it was left, once the file has been read far enough for
  // a place to mean anything. Only the song the app closed on has one.
  if (resumeAt && at === resumeIndex) {
    el.addEventListener(
      'loadedmetadata',
      () => {
        seekTo(resumeAt);
        resumeAt = 0;
        resumeIndex = -1;
      },
      { once: true },
    );
  } else {
    resumeAt = 0;
    resumeIndex = -1;
  }
  remember();
  start();
}

function start() {
  joinBus();
  dismissed = false; // playing again is what brings the notification back
  el.preload = 'auto';
  el.play().catch(() => draw()); // a device that will not play it leaves the strip honest
}

/** play what is named, or pause it; nothing when the queue is empty */
export function toggleMusic() {
  if (!current()) return;
  if (!el.paused) return el.pause();
  // named but not the one the element holds: the first press loads it
  if (loaded === at) start();
  else playAt(at);
}

/** the next song, wrapping at the end */
export const nextTrack = () => playAt(at + 1);
/** the previous song, wrapping at the start */
export const prevTrack = () => playAt(at - 1);

/** shuffle on or off; what is playing carries on */
export function setShuffle(on) {
  shuffled = !!on;
  reorder();
}
export const isShuffled = () => shuffled;

/** @param {string} mode  off, all, or one */
export function setRepeat(mode) {
  repeat = mode === ALL || mode === ONE ? mode : OFF;
}
export const repeatMode = () => repeat;

/** the queue as it will play, and where in it we are */
export const playlist = () => order.map((i) => queue[i].name);
export const playingAt = () => at;
/** play the nth song of the queue as it is ordered */
export const playNth = (n) => playAt(n);

/**
 * A folder becomes the queue, starting at one of its songs. That is
 * what tapping a song in the browser means: the rest of the folder is
 * what follows it, as a playlist rather than one file.
 *
 * `from` counts through the folder as it was listed. Shuffle moves
 * what plays after, never what was asked for.
 * @param {Track[]} tracks @param {number} from
 */
export function playFolder(tracks, from) {
  setQueue(tracks);
  playAt(order.indexOf(from));
}

export const isPlaying = () => !el.paused;

// Both answer before the song is loaded, so the bar opens on the place
// the app was closed at rather than on nothing and then jumping. The
// element knows neither until it has read the file.
/** seconds into the song */
export const position = () => el.currentTime || (at === resumeIndex ? resumeAt : 0);
/** how long the song is, from the element or from what was measured */
export const duration = () => (isFinite(el.duration) && el.duration ? el.duration : trackLength(at));
/** @param {number} sec */
export function seekTo(sec) {
  if (!isFinite(el.duration)) return;
  el.currentTime = Math.max(0, Math.min(el.duration, sec));
}

// What is on screen has to follow what the queue does, and the queue
// changes from the strip, from the player and from a theme coming on.
// One list of listeners rather than each of those telling the others.
/** @type {(() => void)[]} */
const watchers = [];
/** run `fn` whenever the track or the playing state changes */
export const onMusicChange = (fn) => watchers.push(fn);

$('mPlay').addEventListener('click', toggleMusic);

// The end of a song is where a queue differs from a single file. One
// on repeat plays again; otherwise the next one starts, and the end of
// the queue either wraps or stops there.
el.addEventListener('ended', () => {
  if (repeat === ONE) return playAt(at);
  if (at + 1 < order.length || repeat === ALL) return nextTrack();
  el.currentTime = 0;
  draw();
});
el.addEventListener('play', draw);
el.addEventListener('pause', draw);
// The system carries the bar forward on its own, so a jump is the only
// time it needs telling where the song actually is.
el.addEventListener('seeked', draw);

// Where the song had got to. Written while it plays, every few seconds,
// because an app being closed is the case this exists for and a closing
// app fires none of the tidy events: no pause, and not always a hidden
// page. So the most that can be lost is the last few seconds, and the
// cost is one small write per five of them.
el.addEventListener('timeupdate', () => {
  if (Math.abs(el.currentTime - saved) >= SAVE_EVERY) remember();
});
el.addEventListener('pause', remember);
el.addEventListener('seeked', remember);
document.addEventListener('visibilitychange', () => document.hidden && remember());
window.addEventListener('pagehide', remember);
// the song playing gives its length without being asked
el.addEventListener('loadedmetadata', () => {
  const key = keyOf(current());
  if (key && isFinite(el.duration)) lengths.set(key, el.duration);
  draw();
});

/**
 * What is in the queue, read again. The theme's music is the playlist,
 * and nothing else loads on its own: with theme music off, or a theme
 * that carries none, the queue is empty until the browser is asked for
 * something.
 */
export async function refreshPlaylist() {
  const songs = themeMusic() ? await mediaList() : [];
  setQueue(songs.map((f) => ({ name: shown(f), file: f })));
}

// A theme carries its music, so putting one on replaces the queue.
onThemeChange(refreshPlaylist);

takeButtons();

// The lock screen, the shade's media panel and a headset all arrive
// here. Same four things the strip and the player do, from outside.
onMusicControl((what, value) => {
  if (what === 'play') toggleMusic();
  else if (what === 'pause') el.pause();
  else if (what === 'next') nextTrack();
  else if (what === 'previous') prevTrack();
  else if (what === 'stop') dismiss();
  else if (what === 'seek') seekTo(value / 1000);
});

draw();
// Last played wins at launch. Only when there is nothing to come back
// to does the theme's music load on its own.
if (!recall()) refreshPlaylist();
