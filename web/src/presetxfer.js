// The library as a file. Export ticks what goes out, names the file,
// then writes or shares it; import reads one in and adds what it
// carries. The manager draws the ticks; what a tick means is decided
// here.
//
// Export is its own mode, not selection: it ticks boxes rather than
// greying rows, because the two answer different questions — what am
// I acting on now, versus what goes in the file. Its own screen too,
// so Android back leaves export rather than closing the sheet.
import { $, $in } from './dom.js';
import { openScreen, closeScreen } from './nav.js';
import { packLibrary, unpackProfiles, fileName, cleanFileName } from './profiles.js';
import { writeText, shareText } from './files.js';

/**
 * What a tab's library has to answer for a file to go out or come in.
 * @typedef {{id: string,
 *            cats: () => {id: string, name: string, items: string[]}[],
 *            exportPicked: (names: string[], catIds: string[]) =>
 *              {cats: {name: string, items: {label: string, item: any}[]}[],
 *               items: {label: string, item: any}[]},
 *            importDoc: (doc: any) => {cats: number, items: number, skipped: number}}} Library
 */
/** @type {Library | null} */
let box = null;
/** the manager's redraw, so a tick that changes the list shows */
let redraw = () => {};
/** null when not exporting; otherwise what is ticked */
/** @type {{presets: Set<string>, cats: Set<string>} | null} */
let pick = null;

/**
 * The library the buttons act on, for as long as the manager is open.
 * @param {Library} api @param {() => void} onChange
 */
export function attach(api, onChange) {
  box = api;
  redraw = onChange;
}

export const exporting = () => pick !== null;

/** is this row ticked; never while not exporting */
export const ticked = (kind, key) => !!pick && (kind === 'cat' ? pick.cats : pick.presets).has(key);

/**
 * Tick or untick one row. A ticked category carries its presets, so
 * any of them already ticked are unticked — or they would go in the
 * file twice, once as members and once loose — and the list is redrawn
 * so they stop being offered.
 */
export function tick(kind, key, on) {
  if (!pick || !box) return;
  const bucket = kind === 'cat' ? pick.cats : pick.presets;
  if (on) bucket.add(key);
  else bucket.delete(key);
  if (kind !== 'cat') return;
  if (on) {
    const c = box.cats().find((x) => x.id === key);
    (c ? c.items : []).forEach((n) => pick.presets.delete(n));
  }
  redraw();
}

const note = (t) => ($('presetNote').textContent = t);

// ---- export: tick what goes in the file, name it, write it ----
$('presetExport').addEventListener('click', () => {
  pick = { presets: new Set(), cats: new Set() };
  openScreen('presetexp', () => {
    pick = null;
    redraw();
  });
  redraw();
});
$('presetExpCancel').addEventListener('click', () => closeScreen('presetexp'));
// Naming the file is its own screen too, so Android back steps from
// the name to the ticks and from the ticks out of export. There is no
// Back button anywhere here; the system has one.
$('presetExpNext').addEventListener('click', () => {
  if (!pick || !box) return;
  if (!pick.presets.size && !pick.cats.size) return note('Tick something to export.');
  $in('presetFileName').value = fileName(box.id, new Date());
  $('presetFileRow').hidden = false;
  $('presetExpActions').hidden = true;
  openScreen('presetname', () => {
    $('presetFileRow').hidden = true;
    $('presetExpActions').hidden = !exporting();
  });
  $('presetFileName').focus();
});
$('presetFileOk').addEventListener('click', () => finish('save'));
$('presetShare').addEventListener('click', () => finish('share'));
$('presetFileName').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  finish('save');
});

/**
 * Write the file, or hand it to another app.
 * @param {'save'|'share'} how
 */
async function finish(how) {
  if (!pick || !box) return;
  const name = cleanFileName($in('presetFileName').value);
  if (!name) return note('Name the file.');
  const { cats, items } = box.exportPicked([...pick.presets], [...pick.cats]);
  const text = packLibrary(box.id, cats, items);
  const ok = how === 'share' ? await shareText(name, text) : await writeText(name, text);
  if (!ok) {
    return note(how === 'share' ? 'Could not share.' : 'Could not save. Pick a folder in settings first.');
  }
  if (how === 'save') note('Saved ' + name);
  closeScreen('presetexp'); // pops the name screen with it
}

// ---- import: a file in, nothing overwritten ----
$('presetImport').addEventListener('click', () => $('presetFile').click());
$('presetFile').addEventListener('change', async () => {
  const file = ($in('presetFile').files || [])[0];
  $in('presetFile').value = ''; // so the same file can be picked twice
  if (!file || !box) return;
  const doc = unpackProfiles(await file.text());
  if (!doc) return note('Not a presets file.');
  if (doc.kind !== box.id) return note('That file is for the other tab.');
  const { cats, items, skipped } = box.importDoc(doc);
  const bits = [];
  if (cats) bits.push(cats + (cats === 1 ? ' category' : ' categories'));
  if (items) bits.push(items + (items === 1 ? ' preset' : ' presets'));
  note(bits.length ? 'Added ' + bits.join(' and ') + (skipped ? ', skipped ' + skipped : '') : 'Nothing to add.');
  redraw();
});
