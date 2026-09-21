// Settings page, two tabs. General: the opening tab, approach seconds,
// the user's folder, profiles in and out. Sounds: a sound per event.
// Android back closes it (nav.js); nothing is drawn for that.
import { $, $$, $in, $sel, $btn } from './dom.js';
import { loadStr, saveStr } from './storage.js';
import { EVENTS, audioCtx, chosen, setChoice, preview } from './sound.js';
import { hasBridge, folder, pickFolder, listSounds } from './files.js';
import { unpackProfiles } from './profiles.js';
import { openExport, openImport } from './xfer.js';
import { themeFile, themeList, setTheme } from './theme.js';
import { systemStatus, onSystemChange, openNotifications, openBattery } from './system.js';
import { openScreen } from './nav.js';

let startTab = loadStr('timer.startTab', 'timer');
/** the tab to show on launch */
export const getStartTab = () => startTab;
/** knock seconds before an event, as set in the sheet; 0 = off */
export const approachSec = () => Math.max(0, Math.round(+$in('approach').value || 0));

// ---- the folder: sounds and profiles live there; the app only reads it ----
async function renderFolder() {
  const inApp = hasBridge();
  $('exportProfiles').hidden = !inApp; // nowhere to export to without a folder
  $btn('pickFolder').disabled = !inApp;
  if (!inApp) return ($('folderName').textContent = 'in the app only');
  const f = await folder();
  $('folderName').textContent = f.granted ? f.name : 'none picked';
}
async function loadSoundList() {
  const list = await listSounds();
  EVENTS.forEach((key) => {
    const sel = $sel('snd-' + key);
    const saved = chosen(key) || '';
    sel.innerHTML = '';
    sel.add(new Option('Default (beep)', ''));
    list.forEach((f) => sel.add(new Option(f, f)));
    // the choice is kept even when the folder has not got it: it says so
    // rather than being forgotten, and plays the beep until it is back
    if (saved && !list.includes(saved)) sel.add(new Option(saved + ' (missing)', saved));
    sel.value = saved;
  });
}
$('pickFolder').addEventListener('click', async () => {
  await pickFolder();
  await renderFolder();
  loadSoundList();
});

// ---- profiles: a tab's items to a file, or a file's items into a tab ----
const profileNote = (text) => ($('profileNote').textContent = text);
$('exportProfiles').addEventListener('click', openExport);
$('importProfiles').addEventListener('click', () => $('profPick').click());
$('profPick').addEventListener('change', async () => {
  const file = ($in('profPick').files || [])[0];
  $in('profPick').value = '';
  if (!file) return;
  const doc = unpackProfiles(await file.text());
  if (!doc) return profileNote('not a profiles file');
  profileNote('');
  openImport(doc);
});

// ---- the rest of the sheet ----
$('startTab').addEventListener('change', () => {
  startTab = $sel('startTab').value;
  saveStr('timer.startTab', startTab);
});
// Approach is a remembered setting now, not a per-run stepper
const savedApproach = loadStr('timer.approach', null);
if (savedApproach !== null) $in('approach').value = savedApproach;
$('approach').addEventListener('input', () => {
  saveStr('timer.approach', $in('approach').value);
});
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
  await renderSystem();
  await loadSoundList();
  $sel('startTab').value = startTab;
  showSettingsTab('general');
  $('settings').hidden = false;
  openScreen('settings', () => ($('settings').hidden = true));
});
EVENTS.forEach((key) => {
  $sel('snd-' + key).addEventListener('change', () => setChoice(key, $sel('snd-' + key).value));
  $('prev-' + key).addEventListener('click', () => preview(key));
});
$sel('startTab').value = startTab;
