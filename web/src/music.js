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
// and nothing points at a playlist. A theme with no music falls back
// to the one file picked by hand, which is how music worked before
// themes carried any.
import { $, $btn, PLAY_SVG, PAUSE_SVG } from './dom.js';
import { pickSong, keptSong, songUrl } from './files.js';
import { mediaList, mediaUrl, onThemeChange } from './theme.js';
import { themeMusic } from './prefs.js';
import { audioCtx, musicInput } from './sound.js';
import { musicPlaying, musicPaused, musicStopped, onMusicControl } from './session.js';

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
 * One song in the queue. A track from the theme is a file name and is
 * resolved to a URL when it is reached; a file picked by hand arrives
 * with its URL already.
 * @typedef {{ name: string, file?: string, url?: string }} Track
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
const keyOf = (t) => (t ? t.file || t.url || '' : '');

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
    const url = track.url || (track.file ? await mediaUrl(track.file) : '');
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
// whole point of it being there.
//
// What was last said is remembered, because `draw` runs for more than a
// change of song and saying the same thing again would repost the
// notification for nothing.
let heldFor = '';

function holdProcess() {
  const track = current();
  const want = track ? (el.paused ? 'paused:' : 'playing:') + track.name : '';
  if (want === heldFor) return;
  heldFor = want;
  if (!track) return musicStopped();
  if (el.paused) musicPaused(track.name);
  else musicPlaying(track.name);
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
  draw();
}

/** load the track at a position in the order and play it */
async function playAt(i) {
  if (!queue.length) return;
  at = ((i % order.length) + order.length) % order.length;
  const track = current();
  if (!track) return;
  const url = track.url || (track.file ? await mediaUrl(track.file) : '');
  draw();
  if (!url) return; // the file went; the strip still names it
  el.src = url;
  loaded = at;
  start();
}

function start() {
  joinBus();
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
/** seconds into the song */
export const position = () => el.currentTime || 0;
/** how long the song is; 0 until the decoder has read that far */
export const duration = () => (isFinite(el.duration) ? el.duration : 0);
/** @param {number} sec */
export function seekTo(sec) {
  if (!isFinite(el.duration)) return;
  el.currentTime = Math.max(0, Math.min(el.duration, sec));
}

/** the system picker: one file from anywhere, as a queue of one */
export async function chooseFile() {
  const s = await pickSong();
  if (!s) return;
  setQueue([{ name: shown(s.name), url: songUrl(s.uri) }]);
  playAt(0);
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
// the song playing gives its length without being asked
el.addEventListener('loadedmetadata', () => {
  const key = keyOf(current());
  if (key && isFinite(el.duration)) lengths.set(key, el.duration);
  draw();
});

/**
 * What is in the queue, read again. The theme's music is the playlist,
 * unless theme music is switched off; a theme with none falls back to
 * the file picked by hand last time, so the strip is never dead on a
 * phone that has no themes yet.
 */
export async function refreshPlaylist() {
  if (themeMusic()) {
    const songs = await mediaList();
    if (songs.length) return setQueue(songs.map((f) => ({ name: shown(f), file: f })));
    const s = await keptSong();
    return setQueue(s ? [{ name: shown(s.name), url: songUrl(s.uri) }] : []);
  }
  // Theme music off: nothing is loaded and nothing plays until the
  // browser is asked for something.
  setQueue([]);
}

// A theme carries its music, so putting one on replaces the queue.
onThemeChange(refreshPlaylist);

takeButtons();

// The lock screen, the shade's media panel and a headset all arrive
// here. Same four things the strip and the player do, from outside.
onMusicControl((what) => {
  if (what === 'play') toggleMusic();
  else if (what === 'pause') el.pause();
  else if (what === 'next') nextTrack();
  else if (what === 'previous') prevTrack();
});

draw();
refreshPlaylist();
