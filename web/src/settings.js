// Settings page, two tabs. General: the opening tab, the user's
// folder, the theme, and what Android is allowing. Sounds: a sound
// per cue. Android back closes it (nav.js); nothing is drawn for that.
import { $, $$, $in, $sel, $btn } from './dom.js';
import { getStartTab, setStartTab, approachSec, setApproach, keepScreenOn, setKeepScreenOn } from './prefs.js';
import { EVENTS, audioCtx, chosen, setChoice, packList } from './sound.js';
import { openSoundPicker, soundName } from './soundpick.js';
import { hasBridge, folder, pickFolder, listSounds } from './files.js';
import { themeFile, themeList, setTheme } from './theme.js';
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
// Each cue is a button naming its sound; tapping opens the picker. The
// lists are read when the picker opens, not held, so a file dropped in
// the folder shows up without reopening settings.
const LABELS = {
  approach: 'Last seconds',
  prepare: 'Prepare',
  main: 'Work',
  turn: 'Halfway',
  rest: 'Rest',
  end: 'End',
};
const drawSoundBtn = (key) => ($btn('snd-' + key).textContent = soundName(chosen(key)));
const drawSoundBtns = () => EVENTS.forEach(drawSoundBtn);
$('pickFolder').addEventListener('click', async () => {
  await pickFolder();
  await renderFolder();
  drawSoundBtns();
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
// ---- the theme: the files in themes/, by the order of their names ----
/** @type {{file: string, name: string, ui: Record<string, string>}[]} */
let themes = [];
async function renderThemes() {
  themes = await themeList();
  const sel = $sel('theme');
  const now = themeFile();
  sel.innerHTML = '';
  themes.forEach((t) => sel.add(new Option(t.name, t.file)));
  if (!themes.length) sel.add(new Option('Default', ''));
  // nothing chosen yet shows the first, which the 00- prefix makes the
  // default; it is what base.css already draws, so nothing is applied
  sel.value = themes.some((t) => t.file === now) ? now : themes.length ? themes[0].file : '';
}
$('theme').addEventListener('change', () => {
  const t = themes.find((x) => x.file === $sel('theme').value);
  setTheme(t ? t.file : '', t ? t.ui : null);
});

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
  $('sSounds').hidden = t !== 'sounds';
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
  showSettingsTab('general');
  $('settings').hidden = false;
  openScreen('settings', () => ($('settings').hidden = true));
});
EVENTS.forEach((key) => {
  $('snd-' + key).addEventListener('click', async () => {
    const [pack, mine] = await Promise.all([packList(), listSounds()]);
    openSoundPicker(LABELS[key], chosen(key), pack, mine, (v) => {
      setChoice(key, v);
      drawSoundBtn(key);
    });
  });
});
$sel('startTab').value = getStartTab();
