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
import {
  audioCtx,
  ensureSound,
  play,
  playCount,
  soundName,
  soundFile,
  countFile,
  refreshSounds,
  setVolumes,
  testCue,
  testVoice,
} from './sound.js';
import { TOKENS, SOUNDS, COUNTS, isHex } from './themepack.js';
import { hasBridge, folder, pickFolder } from './files.js';
import {
  themeId,
  themeList,
  setTheme,
  lostTheme,
  createTheme,
  copyTheme,
  themeEditable,
  setColour,
  setSound,
  setCount,
} from './theme.js';
import { openSoundPicker } from './soundpick.js';
import { systemStatus, onSystemChange, openNotifications, openBattery, keepAwake } from './system.js';
import { openScreen, closeScreen } from './nav.js';

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
  SOUNDS.forEach((key) => ($btn('snd-' + key).textContent = soundName(key) || 'none'));
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
/** @type {Awaited<ReturnType<typeof themeList>>} */
let themes = [];

// The Colours tab: every token the theme in use sets, as a chip with
// its name and its value. On a theme of the user's own, tapping a chip
// turns the value into a field. A hex colour is applied on the spot
// and written to the theme; anything else stays in the field, marked,
// until it is one. The shipped theme is shown, not edited.
function drawSwatches(ui) {
  const box = $('tColours');
  box.innerHTML = '';
  const editable = themeEditable();
  for (const t of TOKENS) {
    const s = document.createElement('div');
    s.className = 'swatch';
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.background = ui[t] || '';
    const val = document.createElement('div');
    val.className = 'val';
    val.textContent = ui[t] || '';
    s.append(chip, t, val);
    if (editable) {
      chip.addEventListener('click', () => editColour(s, val, t, ui[t] || ''));
      val.addEventListener('click', () => editColour(s, val, t, ui[t] || ''));
    }
    box.appendChild(s);
  }
}

/** put a field in place of the value, and take what it says when done */
function editColour(swatch, val, token, current) {
  if (swatch.querySelector('input')) return;
  const inp = document.createElement('input');
  inp.className = 'hexin';
  inp.value = current;
  inp.setAttribute('inputmode', 'text');
  inp.setAttribute('autocapitalize', 'none');
  inp.setAttribute('spellcheck', 'false');
  swatch.replaceChild(inp, val);
  inp.focus();
  inp.select();
  let done = false;
  const finish = async () => {
    if (done) return;
    const v = inp.value.trim();
    if (v === current || !v) {
      done = true;
      swatch.replaceChild(val, inp);
      return;
    }
    if (!isHex(v)) {
      inp.classList.add('bad'); // not a hex colour; the field stays for another go
      return;
    }
    done = true;
    if (await setColour(token, v))
      await renderThemes(); // the chips, from the file as written
    else swatch.replaceChild(val, inp);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish();
    }
    if (e.key === 'Escape') {
      done = true;
      swatch.replaceChild(val, inp);
    }
  });
  inp.addEventListener('input', () => inp.classList.remove('bad'));
  inp.addEventListener('blur', finish);
}

// The list is the shipped theme and every folder under themes/ in the
// user's folder. One that is not whole is listed greyed with what it
// lacks, the way Cadence names the range that does not fit, and it
// cannot be picked. The note under the picker says when the theme in
// use had to be left because its folder went.
async function renderThemes() {
  themes = await themeList();
  const sel = $sel('theme');
  const now = themeId();
  sel.innerHTML = '';
  for (const t of themes) {
    // cannot be used: greyed, with what it lacks. A sound still blank
    // is not said here; the Sounds tab shows it on its own row.
    const o = new Option(t.ok ? t.name : t.name + ' · missing ' + t.missing.join(', '), t.id);
    o.disabled = !t.ok;
    sel.add(o);
  }
  const t = themes.find((x) => x.id === now && x.ok) || themes[0];
  sel.value = t.id;
  drawSwatches(t.ui);
  const lost = lostTheme();
  $('themeNote').hidden = !lost;
  if (lost)
    $('themeNoteText').textContent = lost + ' could not be read any more, so the app is on ' + themes[0].name + '.';
}
$('theme').addEventListener('change', async () => {
  const t = themes.find((x) => x.id === $sel('theme').value && x.ok) || themes[0];
  setTheme(t.id, t.name, t.ui);
  drawSwatches(t.ui);
  await drawSoundBtns(); // the other theme's names
  $('themeNote').hidden = true;
});

// the two tabs inside Themes
function showThemeTab(t) {
  $$('.ttab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ttab === t)));
  $('tColours').hidden = t !== 'colours';
  $('tSounds').hidden = t !== 'sounds';
}
$$('.ttab').forEach((b) => b.addEventListener('click', () => showThemeTab(b.dataset.ttab)));

// ---- a theme of the user's own: a name, then it exists and is on ----
// New starts with every colour set and every sound blank, so it can be
// worked in at once and built step by step, seen live. Copy takes the
// theme in use, Nord included, whole. One sheet asks the name for both.
/** @type {'new' | 'copy'} */
let tnMode = 'new';
function askName(mode) {
  tnMode = mode;
  $('tnTitle').textContent = mode === 'copy' ? 'Copy theme' : 'New theme';
  $in('tnName').value = '';
  $('tnOverlay').hidden = false;
  openScreen('tnOverlay', () => ($('tnOverlay').hidden = true));
  $('tnName').focus();
}
$('themeNew').addEventListener('click', () => askName('new'));
$('themeCopy').addEventListener('click', () => askName('copy'));
$('tnOk').addEventListener('click', async () => {
  const name = $in('tnName').value.trim();
  if (!name) return $('tnName').focus();
  $btn('tnOk').disabled = true; // a copy takes a moment; one press is one theme
  const id = await (tnMode === 'copy' ? copyTheme(name) : createTheme(name));
  $btn('tnOk').disabled = false;
  closeScreen('tnOverlay');
  if (!id) return; // no folder to write in; the picker is unchanged
  await renderThemes();
  await drawSoundBtns();
});
$('tnCancel').addEventListener('click', () => closeScreen('tnOverlay'));
$('tnOverlay').addEventListener('click', (e) => {
  if (e.target === $('tnOverlay')) closeScreen('tnOverlay');
});
$('tnName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('tnOk').click();
  }
});

// the counts row: nine numbers, each played on a tap
for (const n of COUNTS) {
  const b = document.createElement('button');
  b.className = 'cnt';
  b.textContent = n;
  b.addEventListener('click', () => {
    if (!themeEditable()) return playCount(+n);
    openSoundPicker(countFile(n), (file) => setCount(n, file).then(assigned), true);
  });
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
// A row on the shipped theme plays its sound. On a theme of the user's
// own it opens the picker over the theme's library, with Add, and the
// pick is written to the theme and heard from then on.
async function assigned() {
  refreshSounds(); // the manifest changed on disk
  await drawSoundBtns();
}
SOUNDS.forEach((key) =>
  $('snd-' + key).addEventListener('click', () => {
    if (!themeEditable()) return play(key);
    openSoundPicker(soundFile(key), (file) => setSound(key, file).then(assigned), true);
  }),
);
$sel('startTab').value = getStartTab();
