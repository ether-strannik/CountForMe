// Countdown timers: named, one beep at zero (not a looping alarm).
// Cards with a progress ring; an add/edit sheet with an h:mm:ss keypad.
import { $, $in, CIRCLE_MINUS_SVG, PENCIL_SVG, RELOAD_SVG } from './dom.js';
import { fmtClock } from './format.js';
import { load, save } from './storage.js';
import { askConfirm } from './confirm.js';
import { makePad } from './keypad.js';
import {
  audioCtx,
  playAt,
  playFileAt,
  buzz,
  packList,
  timerSound,
  ensureBuffers,
  ensureFile,
  holdClock,
  releaseClock,
} from './sound.js';
import { openSoundPicker, soundName } from './soundpick.js';
import { listSounds } from './files.js';
import { openScreen, closeScreen } from './nav.js';
import { approachSec } from './prefs.js';
import { timersRunning, timersDone } from './session.js';

let timers = load('timer.countdowns', []);
const saveTimers = () => save('timer.countdowns', timers);
let cdTicker = null;
let taEditId = null;

// One clock, as in runner.js. A running timer lives on the AUDIO clock:
// its zero is a time on that clock, every sound it will make is placed
// there the moment it starts, and the card is drawn from the same
// number. What is seen and what is heard cannot come apart.
//
// Date.now() is not consulted while a timer runs. It was, with the
// sounds bridged onto the audio clock once at the start, and every one
// of them landed late against the display: the audio clock loses close
// to a second while the output stream opens, and a display on the wall
// clock does not follow it there. `endAt` is kept only so a timer can
// be picked up again after the app was closed.
/** @type {Map<string, number>} audio time of zero, by running timer */
const zeros = new Map();
/** @type {Map<string, AudioScheduledSourceNode[]>} sounds placed, by timer */
const scheduled = new Map();
/** timers between the tap and the clock: decoding, not yet running */
const starting = new Set();

/** seconds left, on the clock the sounds are on */
const cdRemaining = (t) => (t.running ? zeros.get(t.id) - audioCtx().currentTime : t.rem);

/** drop whatever this timer still has waiting on the clock */
function unschedule(id) {
  for (const s of scheduled.get(id) || []) {
    try {
      s.stop();
    } catch {
      /* already finished */
    }
  }
  scheduled.delete(id);
  zeros.delete(id);
  if (!scheduled.size) releaseClock(); // nothing left to keep it open for
}

/**
 * Arm, then go. Everything is decoded first, and only then is the
 * clock read: a knock through each of the last seconds and the timer's
 * own sound at zero are placed on it, and the timer is running from
 * that instant. A timer deleted or started again while it was decoding
 * is left alone.
 */
async function start(t) {
  if (starting.has(t.id)) return;
  starting.add(t.id);
  audioCtx(); // armed on the gesture that got us here
  await Promise.all([ensureBuffers(), ensureFile(t.sound)]);
  starting.delete(t.id);
  if (t.running || !timers.includes(t)) return;
  if (t.rem <= 0) t.rem = t.sec;
  holdClock(); // before placing anything: the clock must not stall
  const c = audioCtx();
  const zero = c.currentTime + t.rem;
  zeros.set(t.id, zero);
  t.endAt = Date.now() + t.rem * 1000;
  t.running = true;
  const out = [];
  // A knock as the countdown enters each of its last seconds. One
  // already past is skipped rather than fired at once.
  for (let k = approachSec(); k >= 1; k--) {
    if (zero - k > c.currentTime) out.push(...playAt('approach', zero - k));
  }
  out.push(...playFileAt(t.sound, zero));
  scheduled.set(t.id, out);
  saveTimers();
  renderTimers();
  syncCdTicker();
}

// A timer left running when the app closed. Past its end, it comes
// back stopped with no sound: that moment is gone. Still going, it is
// put back on the clock with what it has left.
timers.forEach((t) => {
  if (!t.running) return;
  t.running = false;
  t.rem = Math.max(0, (t.endAt - Date.now()) / 1000);
  if (t.rem > 0) start(t);
});

// Which second has already been felt, by timer id. Only the buzz needs
// this: the sound is on the clock, but vibration cannot be scheduled.
/** @type {Map<string, number>} */
const buzzed = new Map();

/** vibrate as the countdown enters each of its last seconds */
function lastSeconds(t, rem) {
  const n = approachSec();
  if (!n) return;
  // The same rounding the card uses, from the same value on the same
  // tick, so what is felt and what is shown cannot disagree.
  const s = Math.ceil(rem);
  if (s < 1 || s > n || buzzed.get(t.id) === s) return;
  buzzed.set(t.id, s);
  buzz(60);
}
const RING_C = 2 * Math.PI * 45;
function updateCard(card, t) {
  const rem = Math.max(0, cdRemaining(t));
  const timeEl = card.querySelector('.tctime');
  timeEl.textContent = fmtClock(rem);
  timeEl.classList.toggle('paused', !t.running && rem < t.sec);
  const frac = t.sec > 0 ? Math.min(1, Math.max(0, rem / t.sec)) : 0;
  card.querySelector('.prog').style.strokeDashoffset = (RING_C * (1 - frac)).toFixed(2);
}

export function renderTimers() {
  const box = $('timerList');
  box.innerHTML = '';
  timers.forEach((t) => {
    const rem = Math.max(0, cdRemaining(t));
    const card = document.createElement('div');
    card.className = 'timercard';
    card.dataset.id = t.id;
    const started = t.running || rem < t.sec;
    card.innerHTML =
      '<div class="tcring"><svg viewBox="0 0 100 100">' +
      '<circle class="track" cx="50" cy="50" r="45"></circle>' +
      '<circle class="prog" cx="50" cy="50" r="45"></circle></svg>' +
      '<div class="tctime"></div></div>' +
      '<div class="tcname"></div>' +
      '<div class="tcctrl">' +
      '<button class="tcbtn tcdel" title="Delete" aria-label="Delete">' +
      CIRCLE_MINUS_SVG +
      '</button>' +
      (started
        ? '<button class="tcbtn reset" title="Reset" aria-label="Reset">' + RELOAD_SVG + '</button>'
        : '<button class="tcbtn edit" title="Edit" aria-label="Edit">' + PENCIL_SVG + '</button>') +
      '</div>';
    card.querySelector('.tcname').textContent = t.name || fmtClock(t.sec);
    updateCard(card, t);
    card.querySelector('.tcdel').addEventListener('click', () => {
      askConfirm('Delete this timer?', () => {
        buzzed.delete(t.id);
        unschedule(t.id);
        timers = timers.filter((x) => x.id !== t.id);
        saveTimers();
        renderTimers();
        syncCdTicker();
      });
    });
    card.querySelector('.tcring').addEventListener('click', () => toggleTimer(t.id));
    const edEl = card.querySelector('.edit');
    if (edEl) edEl.addEventListener('click', () => openTimerAdd(t.id));
    const rsEl = card.querySelector('.reset');
    if (rsEl)
      rsEl.addEventListener('click', () => {
        buzzed.delete(t.id);
        unschedule(t.id);
        t.running = false;
        t.rem = t.sec;
        saveTimers();
        renderTimers();
        syncCdTicker();
      });
    box.appendChild(card);
  });
  const add = document.createElement('button');
  add.className = 'timeradd';
  add.textContent = '+ New timer';
  add.addEventListener('click', () => openTimerAdd(null));
  box.appendChild(add);
}
function renderTimersTimes() {
  timers.forEach((t) => {
    const card = $('timerList').querySelector('[data-id="' + t.id + '"]');
    if (card) updateCard(card, t);
  });
}
function toggleTimer(id) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  buzzed.delete(t.id); // a stop or a restart begins the count again
  if (!t.running) return start(t);
  t.rem = Math.max(0, cdRemaining(t));
  t.running = false;
  unschedule(t.id); // whatever was placed is no longer due when it was
  saveTimers();
  renderTimers();
  syncCdTicker();
}
// Called whenever the set of running timers changes. Two things follow
// it: the tick that draws the cards, and the foreground service that
// keeps the process alive while the user is in another app. Without
// the service Android freezes the app within seconds of it leaving
// the screen, and the audio clock, with every sound placed on it,
// stops with the process: a timer came back a minute behind the wall.
function syncCdTicker() {
  const running = timers.filter((t) => t.running);
  if (running.length && !cdTicker) cdTicker = setInterval(cdTick, 250);
  else if (!running.length && cdTicker) {
    clearInterval(cdTicker);
    cdTicker = null;
  }
  if (!running.length) return timersDone();
  // the notification counts down to whichever ends soonest
  const next = running.reduce((a, t) => (cdRemaining(t) < cdRemaining(a) ? t : a));
  const more = running.length - 1;
  timersRunning(cdRemaining(next), (next.name || fmtClock(next.sec)) + (more ? ' +' + more : ''));
}
function cdTick() {
  let changed = false;
  timers.forEach((t) => {
    if (!t.running) return;
    const rem = cdRemaining(t);
    if (rem > 0) return lastSeconds(t, rem);
    t.running = false;
    t.rem = t.sec; // reset to the set duration, ready to run again
    changed = true;
    buzzed.delete(t.id);
    // Not `unschedule`: the sound at zero is still ringing, and a stop
    // here would cut it. Only the hold is let go of.
    scheduled.delete(t.id);
    zeros.delete(t.id);
    if (!scheduled.size) releaseClock();
    buzz(300); // the sound was placed on the clock when this started
  });
  if (changed) {
    saveTimers();
    syncCdTicker();
    if (!$('timers').hidden) renderTimers();
  } else if (!$('timers').hidden) {
    renderTimersTimes();
  }
}

// add / edit sheet with an h:mm:ss keypad
const taPad = makePad($('taKeypad'), $('taDisplay'), 6);
function secToDigits(sec) {
  sec = Math.floor(sec);
  const p = (n) => String(n).padStart(2, '0');
  return (p(Math.floor(sec / 3600)) + p(Math.floor((sec % 3600) / 60)) + p(sec % 60)).replace(/^0+/, '');
}
// The sound this timer plays, held while the sheet is open: the button
// only names it, and the picker is where it changes.
let taSound = timerSound();
const drawTaSound = () => ($('taSound').textContent = soundName(taSound));
$('taSound').addEventListener('click', async () => {
  const [pack, mine] = await Promise.all([packList(), listSounds()]);
  openSoundPicker('Sound', taSound, pack, mine, (v) => {
    taSound = v;
    drawTaSound();
  });
});
function openTimerAdd(id) {
  taEditId = id;
  const t = id != null ? timers.find((x) => x.id === id) : null;
  $('taTitle').textContent = t ? 'Edit timer' : 'New timer';
  $in('taName').value = t ? t.name || '' : '';
  taPad.set(t ? secToDigits(t.sec) : '');
  // an existing timer keeps its own sound; a new one starts at the
  // default, read now so a change under Sounds is picked up
  taSound = (t && t.sound) || timerSound();
  drawTaSound();
  $('timerAdd').hidden = false;
  openScreen('timerAdd', () => ($('timerAdd').hidden = true));
}
$('taName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('taName').blur();
  }
});
$('timerAdd').addEventListener('click', (e) => {
  if (e.target === $('timerAdd')) closeScreen('timerAdd'); // backdrop; Android back does the same
});
$('taSave').addEventListener('click', () => {
  const sec = taPad.sec();
  if (sec <= 0) return;
  const name = $in('taName').value.trim();
  const sound = taSound;
  if (taEditId != null) {
    const t = timers.find((x) => x.id === taEditId);
    t.name = name;
    t.sec = sec;
    t.sound = sound;
    if (!t.running) t.rem = sec;
  } else {
    timers.push({
      id: 't' + Date.now(),
      name,
      sec,
      sound,
      rem: sec,
      running: false,
    });
  }
  saveTimers();
  closeScreen('timerAdd');
  renderTimers();
});
syncCdTicker();
