// The preset manager: one overlay, shared by every tab that has
// presets. The tab itself shows only `Preset: <name>  [Save]` — the
// name opens this, and everything that is not saving happens here.
//
// A library is sets and presets. A set is a programme someone can hand
// to someone else, so it owns its presets rather than tagging them.
// Sets come first in the list, then the presets in no set.
//
// Picking a preset loads it into the tab and closes. New asks for a
// name and hands the tab a blank setup under it; nothing is written
// until the user presses Save on the tab, so a name on its own costs
// nothing and an abandoned one leaves no entry behind.
//
// SELECTION MODE. A long press starts it; after that a tap picks a row
// out instead of opening it, and picked rows go grey. The two buttons
// become one `⋮` whose menu is built from WHAT is picked: presets only
// can be moved into a set, and a set cannot go inside a set, so any
// selection holding one offers nothing yet. Android back leaves the
// mode before it closes the sheet.
import { $, $in } from './dom.js';
import { askConfirm } from './confirm.js';
import { openScreen, closeScreen } from './nav.js';

/**
 * @typedef {{names: () => string[], loose: () => string[],
 *            cats: () => {id: string, name: string, items: string[]}[],
 *            pick: (n: string) => void,
 *            create: (n: string, catId: string) => void,
 *            remove: (n: string) => void,
 *            addCat: (name: string) => void,
 *            removeCat: (id: string) => void,
 *            move: (names: string[], catId: string) => void}} PresetApi
 */
/** @type {PresetApi | null} */
let box = null;
/** what the name row is naming: a preset or a set */
let naming = 'preset';
/** null when not selecting; otherwise the picked rows */
/** @type {{presets: Set<string>, cats: Set<string>} | null} */
let sel = null;
// Which sets are OPEN, not which are shut: nothing is open when the
// app starts, so every set begins folded and a long library is one
// screen of names. Memory only — this is how the phone is looking at
// the library right now, not part of it, and a shared set must not
// carry someone else's idea of what should be unfolded.
/** @type {Set<string>} */
const unfolded = new Set();

const LONG_MS = 450;

const selecting = () => sel !== null;
const selCount = () => (sel ? sel.presets.size + sel.cats.size : 0);

// Selection mode is a screen of its own, so Android back leaves it
// rather than closing the sheet underneath. Closing the sheet while
// selecting pops both, in order, and the mode cleans itself up.
function beginSel(kind, key) {
  sel = { presets: new Set(), cats: new Set() };
  openScreen('presetsel', () => {
    sel = null;
    $('presetMenu').hidden = true;
    render();
  });
  toggle(kind, key);
}
const endSel = () => closeScreen('presetsel');
function toggle(kind, key) {
  if (!sel) return;
  const set = kind === 'cat' ? sel.cats : sel.presets;
  if (set.has(key)) set.delete(key);
  else set.add(key);
  if (!selCount()) return endSel(); // nothing left picked: leave the mode
  render();
}

/** a press that is held rather than tapped */
function onLongPress(el, fn) {
  let t; // untyped: @types/node calls this a Timeout, the browser a number
  const start = () => {
    clearTimeout(t);
    t = setTimeout(fn, LONG_MS);
  };
  const cancel = () => clearTimeout(t);
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancel();
    fn();
  });
}

/**
 * One row. `kind` decides which bucket it selects into; `open` is what
 * a plain tap does when nothing is being selected.
 */
function row(kind, key, name, open, onDelete) {
  const el = document.createElement('div');
  const cat = kind === 'cat';
  el.className = 'prrow ' + (cat ? 'prcat' : 'prpreset');
  el.innerHTML =
    (cat ? '<button class="prfold" aria-expanded="true">›</button>' : '') +
    '<button class="prname"></button><button class="prdel" title="Delete">✕</button>';
  if (cat) {
    // The arrow folds the set; it is its own target so a tap on the
    // name is still free for selecting, and for whatever a set's own
    // tap becomes later.
    const fold = /** @type {HTMLButtonElement} */ (el.querySelector('.prfold'));
    const isOpen = unfolded.has(key);
    fold.setAttribute('aria-expanded', String(isOpen));
    el.classList.toggle('shut', !isOpen);
    fold.addEventListener('click', () => {
      if (isOpen) unfolded.delete(key);
      else unfolded.add(key);
      render();
    });
  }
  const pick = /** @type {HTMLButtonElement} */ (el.querySelector('.prname'));
  pick.textContent = name;
  const picked = sel && (kind === 'cat' ? sel.cats : sel.presets).has(key);
  if (picked) el.classList.add('picked');
  pick.addEventListener('click', () => {
    if (selecting()) return toggle(kind, key);
    if (open) open();
  });
  onLongPress(pick, () => {
    if (!selecting()) beginSel(kind, key);
  });
  const del = /** @type {HTMLButtonElement} */ (el.querySelector('.prdel'));
  del.hidden = selecting(); // one thing at a time
  del.addEventListener('click', onDelete);
  return el;
}

/** a preset row, wherever it sits; `inset` marks one inside a set */
function presetRow(api, n, inset) {
  const el = row(
    'preset',
    n,
    n,
    () => {
      closeScreen('presets');
      api.pick(n);
    },
    () =>
      askConfirm('Delete "' + n + '"?', () => {
        api.remove(n);
        render();
      }),
  );
  if (inset) el.classList.add('prin');
  return el;
}

function render() {
  const list = $('presetList');
  list.innerHTML = '';
  if (!box) return;
  const api = box;

  // A set, then what is inside it, indented. The nesting is the whole
  // point of a set: it is a programme, not a label on a flat list.
  const cats = api.cats();
  cats.forEach((c) => {
    const el = row('cat', c.id, c.name, null, () =>
      askConfirm(
        'Delete the set "' + c.name + '"' + (c.items.length ? ' and its ' + c.items.length + ' presets?' : '?'),
        () => {
          api.removeCat(c.id);
          render();
        },
      ),
    );
    const n = document.createElement('small');
    n.className = 'prcount';
    n.textContent = c.items.length ? String(c.items.length) : 'empty';
    el.insertBefore(n, el.querySelector('.prdel'));
    list.appendChild(el);
    if (unfolded.has(c.id)) c.items.forEach((name) => list.appendChild(presetRow(api, name, true)));
  });

  // then the presets in no set, at the root
  const loose = api.loose();
  loose.forEach((n) => list.appendChild(presetRow(api, n, false)));

  if (!loose.length && !cats.length) {
    const empty = document.createElement('div');
    empty.className = 'prnote';
    empty.textContent = 'Nothing saved yet.';
    list.appendChild(empty);
  }
  drawBar();
}

/** the title and the buttons follow the mode */
function drawBar() {
  const on = selecting();
  $('presetTitle').textContent = on ? selCount() + ' selected' : $('presetTitle').dataset.title || 'Presets';
  $('presetActions').hidden = on;
  $('presetSelActions').hidden = !on;
}

/** what can be done with what is picked; empty means the menu stays shut */
function actions() {
  if (!sel || !sel.presets.size || sel.cats.size) return [];
  return ['move']; // a set cannot go inside a set
}

/** one tappable line in the menu */
function menuItem(menu, text, onClick) {
  const b = document.createElement('button');
  b.className = 'prmenu';
  b.textContent = text;
  b.addEventListener('click', onClick);
  menu.appendChild(b);
}
function menuNote(menu, text, cls) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  menu.appendChild(d);
}

/** what `⋮` shows: the actions available for what is picked */
function openMenu() {
  const menu = $('presetMenu');
  menu.innerHTML = '';
  const acts = actions();
  if (!acts.length) menuNote(menu, 'Nothing to do with this selection.', 'prnote');
  if (acts.includes('move')) menuItem(menu, 'Move', openMoveMenu);
  menu.hidden = false;
}

/** the second step of Move: which set they go into */
function openMoveMenu() {
  const menu = $('presetMenu');
  menu.innerHTML = '';
  const cats = box ? box.cats() : [];
  if (!cats.length) {
    menuNote(menu, 'No categories yet. Make one first.', 'prnote');
    return;
  }
  menuNote(menu, 'Move to', 'prgroup');
  cats.forEach((c) =>
    menuItem(menu, c.name, () => {
      if (box && sel) box.move([...sel.presets], c.id);
      menu.hidden = true;
      endSel();
    }),
  );
}

/**
 * Open the manager for one tab.
 * @param {string} title
 * @param {PresetApi} api
 */
export function openPresets(title, api) {
  box = api;
  sel = null;
  $('presetTitle').dataset.title = title;
  $('presetMenu').hidden = true;
  nameRow('');
  render();
  $('presetOverlay').hidden = false;
  openScreen('presets', () => ($('presetOverlay').hidden = true));
}

/** show the name box for a preset or a set, or put it away */
function nameRow(what) {
  naming = what || naming;
  const on = !!what;
  $('presetNameRow').hidden = !on;
  $('presetActions').hidden = on || selecting();
  if (!on) return;
  const input = $in('presetNameInput');
  input.placeholder = what === 'cat' ? 'set name' : 'preset name';
  input.value = '';
  input.focus();
}

$('presetAdd').addEventListener('click', () => nameRow('preset'));
$('presetAddCat').addEventListener('click', () => nameRow('cat'));
$('presetNameCancel').addEventListener('click', () => nameRow(''));
/** make the preset and leave: it opens blank on the tab */
function finishCreate(name, catId) {
  if (!box) return;
  const create = box.create;
  closeScreen('presets');
  create(name, catId);
}

/**
 * After naming a preset, ask where it goes — but only when there is
 * somewhere to put it. With no categories the question has one answer,
 * so it is not asked.
 */
function askCategory(name) {
  const cats = box ? box.cats() : [];
  if (!cats.length) return finishCreate(name, '');
  const menu = $('presetMenu');
  menu.innerHTML = '';
  const ask = document.createElement('div');
  ask.className = 'prask';
  ask.innerHTML =
    '<span>Add to category?</span><button class="pbtn save">Yes</button><button class="pbtn">Skip</button>';
  const [yes, skip] = ask.querySelectorAll('button');
  yes.addEventListener('click', () => pickCategory(name));
  skip.addEventListener('click', () => {
    menu.hidden = true;
    finishCreate(name, '');
  });
  menu.appendChild(ask);
  menu.hidden = false;
}

/** the second step of Yes: which category it goes into */
function pickCategory(name) {
  const menu = $('presetMenu');
  menu.innerHTML = '';
  menuNote(menu, 'Add to', 'prgroup');
  (box ? box.cats() : []).forEach((c) =>
    menuItem(menu, c.name, () => {
      menu.hidden = true;
      finishCreate(name, c.id);
    }),
  );
}

$('presetNameOk').addEventListener('click', () => {
  const n = $in('presetNameInput').value.trim();
  if (!n || !box) return;
  if (naming === 'cat') {
    box.addCat(n);
    nameRow('');
    return render(); // a new set is made here; the manager stays open
  }
  nameRow('');
  askCategory(n);
});
$('presetNameInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  $('presetNameOk').click();
});
$('presetDots').addEventListener('click', () => {
  if ($('presetMenu').hidden) openMenu();
  else $('presetMenu').hidden = true;
});
$('presetOverlay').addEventListener('click', (e) => {
  if (e.target !== $('presetOverlay')) return; // backdrop
  if (selecting()) return endSel(); // leave the mode first
  closeScreen('presets');
});
// a tap anywhere else in the sheet puts the menu away
$('presetList').addEventListener('click', () => ($('presetMenu').hidden = true));
