// The transfer sheet: export a collection's items to a file in the user's
// folder, or bring a file's items into a collection. Steps, top to bottom:
// which collection (export only) → which items → the file name (export
// only). Import never overwrites: profiles.js decides add / skip / rename
// per item and the sheet shows it before the user confirms.
import { $, $$, $in } from './dom.js';
import { collections, collection } from './collections.js';
import { packProfiles, planMerge, fileName, cleanFileName } from './profiles.js';
import { writeText } from './files.js';
import { openScreen, closeScreen } from './nav.js';

let mode = 'export'; // 'export' | 'import'
let step = 'kinds'; // 'kinds' | 'items' | 'name' | 'done'
let kind = '';
/** @type {{label: string, item: any}[]} */
let items = [];

const note = (t) => ($('xferNote').textContent = t);

function show() {
  $('xferKinds').hidden = step !== 'kinds';
  $('xferItems').hidden = step !== 'items';
  $('xferNameRow').hidden = step !== 'name';
  $('xferBack').hidden = mode === 'import' || step === 'kinds' || step === 'done';
  $('xferAll').hidden = step !== 'items';
  $('xferNext').hidden = step === 'kinds';
  $('xferNext').textContent =
    step === 'done' ? 'Done' : step === 'name' ? 'Export' : mode === 'import' ? 'Import' : 'Next';
  $('xferTitle').textContent = mode === 'import' ? 'Import' : 'Export';
}

function renderKinds() {
  const box = $('xferKinds');
  box.innerHTML = '';
  collections().forEach((c) => {
    const b = document.createElement('button');
    b.className = 'xrow';
    b.innerHTML = '<span></span><small></small>';
    b.querySelector('span').textContent = c.label;
    b.querySelector('small').textContent = String(c.entries().length);
    b.addEventListener('click', () => {
      kind = c.id;
      items = c.entries();
      step = 'items';
      renderItems();
      show();
    });
    box.appendChild(b);
  });
}

/** one row per item, checked; on import, a tag says what will happen */
function renderItems() {
  const box = $('xferItems');
  box.innerHTML = '';
  const c = collection(kind);
  const plan = mode === 'import' && c ? planMerge(c.entries(), items, new Set(items.map((_, i) => i))) : [];
  items.forEach((e, i) => {
    const row = document.createElement('label');
    row.className = 'xrow';
    row.innerHTML = '<input type="checkbox" checked /><span></span><small></small>';
    row.querySelector('span').textContent = e.label;
    if (plan[i]) {
      const p = plan[i];
      row.querySelector('small').textContent =
        p.action === 'add' ? 'new' : p.action === 'skip' ? 'same, skipped' : 'as "' + p.as + '"';
    }
    box.appendChild(row);
  });
  note(items.length ? '' : 'nothing here');
}

const picked = () =>
  new Set([...$$('#xferItems input')].map((el, i) => (/** @type {any} */ (el).checked ? i : -1)).filter((i) => i >= 0));

const open = () => {
  $('xferOverlay').hidden = false;
  openScreen('xfer', () => ($('xferOverlay').hidden = true));
};
const close = () => closeScreen('xfer');

async function next() {
  if (step === 'done') return close();
  if (step === 'items' && mode === 'export') {
    if (!picked().size) return note('nothing picked');
    $in('xferName').value = fileName(kind, new Date());
    step = 'name';
    return show();
  }
  if (step === 'items' && mode === 'import') {
    const c = collection(kind);
    if (!c) return;
    const plan = planMerge(c.entries(), items, picked());
    let added = 0;
    let skipped = 0;
    plan.forEach((p) => {
      if (p.action === 'skip') return skipped++;
      if (c.put(p.as, p.item)) added++;
      else skipped++;
    });
    note('added ' + added + ', skipped ' + skipped);
    step = 'done';
    return show();
  }
  if (step === 'name') {
    const name = cleanFileName($in('xferName').value);
    if (!name) return note('name the file');
    const keep = picked();
    const ok = await writeText(
      name,
      packProfiles(
        kind,
        items.filter((_, i) => keep.has(i)),
      ),
    );
    note(ok ? 'saved ' + name : 'could not save');
    step = 'done';
    return show();
  }
}

function back() {
  if (step === 'name') step = 'items';
  else if (step === 'items') step = 'kinds';
  show();
}

/** open the sheet to export: the user picks a collection first */
export function openExport() {
  mode = 'export';
  step = 'kinds';
  kind = '';
  note('');
  renderKinds();
  show();
  open();
}

/** open the sheet with a file's items to bring into their collection */
export function openImport(doc) {
  mode = 'import';
  kind = doc.kind;
  items = doc.items;
  note('');
  if (!collection(kind)) {
    step = 'done';
    items = [];
    $('xferItems').innerHTML = '';
    note('no such tab here: ' + kind);
  } else {
    step = 'items';
    renderItems();
  }
  show();
  open();
}

$('xferNext').addEventListener('click', next);
$('xferBack').addEventListener('click', back);
$('xferAll').addEventListener('click', () => {
  const boxes = [...$$('#xferItems input')].map((el) => /** @type {any} */ (el));
  const all = boxes.every((b) => b.checked);
  boxes.forEach((b) => (b.checked = !all));
});
$('xferOverlay').addEventListener('click', (e) => {
  if (e.target === $('xferOverlay')) close(); // backdrop
});
