// Countdown timers: named, one beep at zero (not a looping alarm).
// Cards with a progress ring; an add/edit sheet with an h:mm:ss keypad.
import { $, $in, MINUS_SVG } from './dom.js';
import { fmtClock } from './format.js';
import { load, save } from './storage.js';
import { askConfirm } from './confirm.js';
import { makePad } from './keypad.js';
import { audioCtx, playFile, buzz, packList, timerSound } from './sound.js';
import { openSoundPicker, soundName } from './soundpick.js';
import { listSounds } from './files.js';
import { openScreen, closeScreen } from './nav.js';

let timers = load('timer.countdowns', []);
// a timer that already elapsed while away comes back stopped, no beep
timers.forEach((t) => {
  if (t.running && t.endAt - Date.now() <= 0) {
    t.running = false;
    t.rem = 0;
  }
});
const saveTimers = () => save('timer.countdowns', timers);
let cdTicker = null;
let taEditId = null;

const cdRemaining = (t) => (t.running ? (t.endAt - Date.now()) / 1000 : t.rem);
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
      '<button class="tcdel">' +
      MINUS_SVG +
      '</button>' +
      (started ? '<button class="tcbtn reset">↺</button>' : '<button class="tcbtn edit">✎</button>') +
      '</div>';
    card.querySelector('.tcname').textContent = t.name || fmtClock(t.sec);
    updateCard(card, t);
    card.querySelector('.tcdel').addEventListener('click', () => {
      askConfirm('Delete this timer?', () => {
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
  audioCtx(); // arm audio on this gesture so the beep can fire later
  if (t.running) {
    t.rem = Math.max(0, (t.endAt - Date.now()) / 1000);
    t.running = false;
  } else {
    if (t.rem <= 0) t.rem = t.sec;
    t.endAt = Date.now() + t.rem * 1000;
    t.running = true;
  }
  saveTimers();
  renderTimers();
  syncCdTicker();
}
function syncCdTicker() {
  const any = timers.some((t) => t.running);
  if (any && !cdTicker) cdTicker = setInterval(cdTick, 250);
  else if (!any && cdTicker) {
    clearInterval(cdTicker);
    cdTicker = null;
  }
}
function cdTick() {
  let changed = false;
  timers.forEach((t) => {
    if (t.running && t.endAt - Date.now() <= 0) {
      t.running = false;
      t.rem = t.sec; // reset to the set duration, ready to run again
      changed = true;
      playFile(t.sound); // ONE beep, no loop
      buzz(300);
    }
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
