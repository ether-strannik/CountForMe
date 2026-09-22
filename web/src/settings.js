// Settings page, three tabs. General: the opening tab, the user's
// folder, the theme, and what Android is allowing. Sounds: what the
// theme plays for each cue, to hear, not to change. Volume: a fader
// per bus. Android back closes it (nav.js); nothing is drawn for that.
import { $, $$, $in, $sel, $btn } from './dom.js';
import {
  getStartTab,
  setStartTab,
  approachSec,
  setApproach,
  keepScreenOn,
  setKeepScreenOn,
  cueVolume,
  setCueVolume,
  voiceVolume,
  setVoiceVolume,
} from './prefs.js';
import { audioCtx, ensureSound, play, playCount, soundName, setVolumes, testCue, testVoice } from './sound.js';
import { TOKENS, SOUNDS, COUNTS } from './themepack.js';
import { hasBridge, folder, pickFolder } from './files.js';
import { themeId, themeList, setTheme } from './theme.js';
import { systemStatus, onSystemChange, openNotifications, openBattery, keepAwake } from './system.js';
import { openScreen } from './nav.js';

// ---- the folder: sounds and preset files live there ----
async function renderFolder() {
  const inApp = hasBridge();
  $btn('pickFolder').disabled = !inApp;
  if (!inApp) return ($('folderName').textContent = 'in the app only');
  const f = await folder();
  $('folderName').textContent = f.granted ? f.name : 'none picked';
}
// Each cue is a button naming the theme's sound for it; tapping plays
// it. Nothing here changes a sound: that is a different theme.
async function drawSoundBtns() {
  await ensureSound('timer'); // reads the manifest, so the names are in
  SOUNDS.forEach((key) => ($btn('snd-' + key).textContent = soundName(key)));
}
$('pickFolder').addEventListener('click', async () => {
  await pickFolder();
  await renderFolder();
});

// Import and export live in the preset manager now. They belong beside
// the categories they carry: a file is a set of presets, and this page
// cannot show which ones are going.

// ---- the rest of the sheet ----
$('startTab').addEventListener('change', () => setStartTab($sel('startTab').value));
// The field is drawn from the store and read back on every keystroke.
// It is not rewritten while typing: a half-typed value would be
// clamped under the user's thumb.
$in('approach').value = String(approachSec());
$('approach').addEventListener('input', () => setApproach(+$in('approach').value));
$('approach').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('approach').blur();
  }
});
// ---- the theme: the shipped one, and later the folder's ----
/** @type {{id: string, name: string, ui: Record<string, string>}[]} */
let themes = [];

/** the Colours tab: every token the theme in use sets, as a chip */
function drawSwatches(ui) {
  const box = $('tColours');
  box.innerHTML = '';
  for (const t of TOKENS) {
    const s = document.createElement('div');
    s.className = 'swatch';
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.background = ui[t] || '';
    s.append(chip, t);
    box.appendChild(s);
  }
}

async function renderThemes() {
  themes = await themeList();
  const sel = $sel('theme');
  const now = themeId();
  sel.innerHTML = '';
  themes.forEach((t) => sel.add(new Option(t.name, t.id)));
  const t = themes.find((x) => x.id === now) || themes[0];
  sel.value = t.id;
  drawSwatches(t.ui);
}
$('theme').addEventListener('change', () => {
  const t = themes.find((x) => x.id === $sel('theme').value) || themes[0];
  setTheme(t.id, t.ui);
  drawSwatches(t.ui);
});

// the two tabs inside Themes
function showThemeTab(t) {
  $$('.ttab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ttab === t)));
  $('tColours').hidden = t !== 'colours';
  $('tSounds').hidden = t !== 'sounds';
}
$$('.ttab').forEach((b) => b.addEventListener('click', () => showThemeTab(b.dataset.ttab)));

// the counts row: nine numbers, each played on a tap
for (const n of COUNTS) {
  const b = document.createElement('button');
  b.className = 'cnt';
  b.textContent = n;
  b.addEventListener('click', () => playCount(+n));
  $('counts').appendChild(b);
}

// ---- keep the screen on ----
// A setting the app owns, unlike the rows below it: this switch decides,
// they only report. Applied at load, not when the sheet opens, so it
// holds from the first screen the user sees.
const renderAwake = () => {
  $('rowAwake').hidden = !hasBridge();
  $('awakeBtn').setAttribute('aria-checked', String(keepScreenOn()));
};
keepAwake(keepScreenOn());
$('awakeBtn').addEventListener('click', () => {
  setKeepScreenOn(!keepScreenOn());
  keepAwake(keepScreenOn());
  renderAwake();
});

// ---- volume: a fader per thing the app plays ----
// The value is pushed into the sound engine on every move, so a slider
// dragged mid-session reaches the cues already on the clock. Applied
// at load too, not when the sheet opens, or the first session of the
// day would run at the shipped level.
const showDb = (id, db) => ($(id).textContent = (db > 0 ? '+' : '') + db);

function applyVolumes() {
  setVolumes(cueVolume(), voiceVolume());
  showDb('volCueVal', cueVolume());
  showDb('volVoiceVal', voiceVolume());
}

function renderVolumes() {
  $in('volCue').value = String(cueVolume());
  $in('volVoice').value = String(voiceVolume());
  applyVolumes();
}
$('volCue').addEventListener('input', () => {
  setCueVolume(+$in('volCue').value);
  applyVolumes();
});
$('volVoice').addEventListener('input', () => {
  setVoiceVolume(+$in('volVoice').value);
  applyVolumes();
});
$('volCueTest').addEventListener('click', testCue);
$('volVoiceTest').addEventListener('click', testVoice);
applyVolumes();

// ---- what Android is letting the app do ----
// Each row is a switch showing the real state, not a control that sets
// it: tapping opens the screen where Android decides. Read when the
// page opens and again whenever the app returns to the front, since
// those screens sit over the page rather than hiding it.
function permRow(id, ok, good, bad) {
  const note = $(id + 'State');
  note.textContent = ok ? good : bad;
  note.classList.toggle('warn', !ok);
  $(id + 'Btn').setAttribute('aria-checked', String(ok));
}
async function renderSystem() {
  const s = await systemStatus();
  $('permNotif').hidden = !s;
  $('permBattery').hidden = !s;
  if (!s) return;
  permRow('permNotif', s.notifications, 'allowed', 'blocked, a running session will not show');
  permRow('permBattery', s.battery, 'exempt', 'optimised, a long session may be cut short');
}
$('permNotifBtn').addEventListener('click', openNotifications);
$('permBatteryBtn').addEventListener('click', openBattery);
onSystemChange(() => {
  if (!$('settings').hidden) renderSystem();
});

// ---- the page: two tabs, closed by Android back ----
function showSettingsTab(t) {
  $$('.stab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.stab === t)));
  $('sGeneral').hidden = t !== 'general';
  $('sThemes').hidden = t !== 'themes';
  $('sVolume').hidden = t !== 'volume';
}
$$('.stab').forEach((b) => b.addEventListener('click', () => showSettingsTab(b.dataset.stab)));
$('gear').addEventListener('click', async () => {
  audioCtx();
  await renderFolder();
  await renderThemes();
  renderAwake();
  await renderSystem();
  drawSoundBtns();
  $sel('startTab').value = getStartTab();
  $in('approach').value = String(approachSec());
  renderVolumes();
  showSettingsTab('general');
  showThemeTab('colours');
  $('settings').hidden = false;
  openScreen('settings', () => ($('settings').hidden = true));
});
SOUNDS.forEach((key) => $('snd-' + key).addEventListener('click', () => play(key)));
$sel('startTab').value = getStartTab();
