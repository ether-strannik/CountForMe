// Music: one song, playing, and the strip that shows it.
//
// An audio element for the decoding, wired into the sound engine's
// music bus for everything after it. The element streams; the bus is
// what the dip under each cue is placed on, which an element's own
// volume could never take. Each does the half it is good at.
//
// The song is never read into the page. The native side keeps the URI
// the picker returned, with a grant that survives a restart, and
// `songUrl` turns it into a URL Capacitor's local server answers. The
// decoder pulls from it as it plays, so a track starts on its first
// chunk rather than its last and its length costs no memory. Carrying
// the bytes instead — as the cue sounds do, being small — meant a
// base64 string over the bridge and a decode loop per byte here, which
// is seconds of nothing before a ten-megabyte song makes a sound.
//
// No seek and no position. This is a strip, not a music app.
import { $, $btn } from './dom.js';
import { pickSong, keptSong, songUrl } from './files.js';
import { audioCtx, musicInput } from './sound.js';

const NOTE = '♪';
const PLAY = '▶';
const PAUSE = '⏸';

const el = new Audio();
// Metadata only until the user asks for it: loading a song the app
// merely remembers, at every launch, is the cost this was built to
// avoid. Playing switches it.
el.preload = 'metadata';

/** what is loaded, without its extension; "" when nothing is */
let name = '';

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
  const playing = !el.paused;
  const shown = NOTE + ' ' + (name || 'none');
  $('mName').textContent = shown;
  $('mName').classList.toggle('none', !name);
  $('mPlay').textContent = playing ? PAUSE : PLAY;
  $btn('mPlay').disabled = !name;
  $btn('mStop').disabled = !name;
  $('volMusicName').textContent = shown;
  $('volMusicTest').textContent = playing ? 'Pause' : 'Play';
  $btn('volMusicTest').disabled = !name;
}

/** @param {{name: string, uri: string}} s */
function load(s) {
  name = s.name.replace(/\.[^.]+$/, '');
  el.src = songUrl(s.uri);
  draw();
}

/** the system picker, then play what came back */
async function choose() {
  const s = await pickSong();
  if (!s) return;
  load(s);
  start();
}

function start() {
  joinBus();
  el.preload = 'auto';
  el.play().catch(() => draw()); // a device that will not play it leaves the strip honest
}

/** play what is loaded, or pause it; nothing when nothing is loaded */
export function toggleMusic() {
  if (!name) return;
  if (el.paused) start();
  else el.pause();
}

$('mName').addEventListener('click', choose);
$('mPlay').addEventListener('click', toggleMusic);
$('mStop').addEventListener('click', () => {
  el.pause();
  el.currentTime = 0;
});
// The end is a stop: back to the start, the name still there to press.
el.addEventListener('ended', () => {
  el.currentTime = 0;
  draw();
});
el.addEventListener('play', draw);
el.addEventListener('pause', draw);

draw();
// The song from last time comes back named and ready, not playing.
keptSong().then((s) => s && load(s));
