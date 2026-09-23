// Music: one file, playing, and the strip that shows it.
//
// An audio element for the decoding, wired into the sound engine's
// music bus for everything after it. The element streams a whole song,
// which decoding it whole into a buffer would not; the bus is what the
// dip under each cue is placed on, which an element's own volume could
// never take. Each does the half it is good at.
//
// The file comes through the system picker as bytes, so it is the
// user's own file wherever it lives, read once. Nothing survives a
// restart: picking is the whole of choosing, and there is no library.
//
// No seek and no position. This is a strip, not a music app.
import { $, $btn } from './dom.js';
import { pickAudio } from './files.js';
import { audioCtx, musicInput } from './sound.js';

const NOTE = '♪';
const PLAY = '▶';
const PAUSE = '⏸';

// The picker hands over bytes and a name, no type. A media element
// wants one, so it comes off the extension; anything unknown is tried
// as an MP3, which is what an unnamed audio file usually is.
const MIME = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
};
const typeOf = (file) => MIME[(file.split('.').pop() || '').toLowerCase()] || 'audio/mpeg';

const el = new Audio();
el.preload = 'auto';

/** what is loaded, without its extension; "" when nothing is */
let name = '';
/** the blob URL behind it, revoked when the next file replaces it */
let url = '';

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

/** the system picker, then play what came back */
async function pickSong() {
  const f = await pickAudio();
  if (!f) return;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([f.bytes], { type: typeOf(f.name) }));
  name = f.name.replace(/\.[^.]+$/, '');
  el.src = url;
  draw();
  start();
}

function start() {
  joinBus();
  el.play().catch(() => draw()); // a device that will not play it leaves the strip honest
}

/** play what is loaded, or pause it; nothing when nothing is loaded */
export function toggleMusic() {
  if (!name) return;
  if (el.paused) start();
  else el.pause();
}

$('mName').addEventListener('click', pickSong);
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
