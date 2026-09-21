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
import { $, $in } from './dom.js';
import { askConfirm } from './confirm.js';
import { openScreen, closeScreen } from './nav.js';

/**
 * @typedef {{names: () => string[],
 *            cats: () => {id: string, name: string, count: number}[],
 *            pick: (n: string) => void, create: (n: string) => void,
 *            remove: (n: string) => void,
 *            addCat: (name: string) => void,
 *            removeCat: (id: string) => void}} PresetApi
 */
/** @type {PresetApi | null} */
let box = null;
/** what the name row is naming: a preset or a set */
let naming = 'preset';

/** a row with a name on the left and a delete on the right */
function row(cls, name, onPick, onDelete) {
  const el = document.createElement('div');
  el.className = 'xrow ' + cls;
  el.innerHTML = '<button class="prname"></button><button class="prdel" title="Delete">✕</button>';
  const pick = el.querySelector('.prname');
  pick.textContent = name;
  if (onPick) pick.addEventListener('click', onPick);
  else /** @type {HTMLButtonElement} */ (pick).disabled = true;
  el.querySelector('.prdel').addEventListener('click', onDelete);
  return el;
}

function render() {
  const list = $('presetList');
  list.innerHTML = '';
  if (!box) return;
  const api = box;

  // Sets first. Nothing is in one yet — that is the next step — so a
  // set shows its count and sits there waiting for presets.
  api.cats().forEach((c) => {
    const el = row('prcat', c.name, null, () =>
      askConfirm('Delete the set "' + c.name + '"' + (c.count ? ' and its ' + c.count + ' presets?' : '?'), () => {
        api.removeCat(c.id);
        render();
      }),
    );
    const n = document.createElement('small');
    n.className = 'prcount';
    n.textContent = c.count ? String(c.count) : 'empty';
    el.insertBefore(n, el.querySelector('.prdel'));
    list.appendChild(el);
  });

  const names = api.names();
  names.forEach((n) => {
    list.appendChild(
      row(
        'prpreset',
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
      ),
    );
  });

  if (!names.length && !api.cats().length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'Nothing saved yet.';
    list.appendChild(empty);
  }
}

/** show the name box for a preset or a set, or put it away */
function nameRow(what) {
  naming = what || naming;
  const on = !!what;
  $('presetNameRow').hidden = !on;
  $('presetActions').hidden = on;
  if (!on) return;
  const input = $in('presetNameInput');
  input.placeholder = what === 'cat' ? 'set name' : 'preset name';
  input.value = '';
  input.focus();
}

/**
 * Open the manager for one tab.
 * @param {string} title
 * @param {PresetApi} api
 */
export function openPresets(title, api) {
  box = api;
  $('presetTitle').textContent = title;
  nameRow('');
  render();
  $('presetOverlay').hidden = false;
  openScreen('presets', () => ($('presetOverlay').hidden = true));
}

$('presetAdd').addEventListener('click', () => nameRow('preset'));
$('presetAddCat').addEventListener('click', () => nameRow('cat'));
$('presetNameCancel').addEventListener('click', () => nameRow(''));
$('presetNameOk').addEventListener('click', () => {
  const n = $in('presetNameInput').value.trim();
  if (!n || !box) return;
  if (naming === 'cat') {
    box.addCat(n);
    nameRow('');
    return render(); // a new set is made here; the manager stays open
  }
  const create = box.create;
  closeScreen('presets'); // a new preset opens on the tab, blank
  create(n);
});
$('presetNameInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  $('presetNameOk').click();
});
$('presetOverlay').addEventListener('click', (e) => {
  if (e.target === $('presetOverlay')) closeScreen('presets'); // backdrop
});
