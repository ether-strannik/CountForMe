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
import { $, $btn } from './dom.js';
import { pickSong, keptSong, songUrl } from './files.js';
import { mediaList, mediaUrl, onThemeChange } from './theme.js';
import { audioCtx, musicInput } from './sound.js';

const NOTE = '♪';
const PLAY = '▶';
const PAUSE = '⏸';

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

// The strip and the Music tab's top line say the same thing, so one
// function draws both. The tab's copy is what the four faders are
// tuned against, and the settings page covers the strip.
function draw() {
  const track = current();
  const playing = !el.paused;
  const label = NOTE + ' ' + (track ? track.name : 'none');
  $('mName').textContent = label;
  $('mName').classList.toggle('none', !track);
  $('mPlay').textContent = playing ? PAUSE : PLAY;
  $btn('mPlay').disabled = !track;
  $btn('mStop').disabled = !track;
  $('volMusicName').textContent = label;
  $('volMusicTest').textContent = playing ? 'Pause' : 'Play';
  $btn('volMusicTest').disabled = !track;
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

/** stop, and go back to the start of the song */
export function stopMusic() {
  el.pause();
  el.currentTime = 0;
}

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

$('mName').addEventListener('click', choose);
$('mPlay').addEventListener('click', toggleMusic);
$('mStop').addEventListener('click', stopMusic);

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

/** the system picker: one file from anywhere, as a queue of one */
async function choose() {
  const s = await pickSong();
  if (!s) return;
  setQueue([{ name: shown(s.name), url: songUrl(s.uri) }]);
  playAt(0);
}

/**
 * What is in the queue, read again. The theme's music is the playlist;
 * a theme with none falls back to the file picked by hand last time,
 * so the strip is never dead on a phone that has no themes yet.
 */
export async function refreshPlaylist() {
  const songs = await mediaList();
  if (songs.length) return setQueue(songs.map((f) => ({ name: shown(f), file: f })));
  const s = await keptSong();
  setQueue(s ? [{ name: shown(s.name), url: songUrl(s.uri) }] : []);
}

// A theme carries its music, so putting one on replaces the queue.
onThemeChange(refreshPlaylist);

draw();
refreshPlaylist();
