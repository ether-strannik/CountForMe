// A named-preset picker: a <select> of saved entries, New / Save / Del,
// and a name box. Two screens use one each — Intervals presets and
// Intervals2 programs. The library owns the store and the last-picked
// name; the screen owns what a preset IS (get) and what applying one
// does (apply).
import { $, $in, $sel } from './dom.js';
import { load, save, loadStr, saveStr } from './storage.js';
import { askConfirm } from './confirm.js';
import { registerCollection } from './collections.js';

/**
 * @param {object} o
 * @param {string} o.id           the collection id, for export and import
 * @param {string} o.label        the tab's name, for the transfer sheet
 * @param {{sel: string, nw: string, save: string, del: string, name: string,
 *          input: string, ok: string, cancel: string}} o.ids  element ids
 * @param {string} o.storeKey     localStorage key of the {name: preset} map
 * @param {string} o.lastKey      localStorage key of the last-picked name
 * @param {string} o.placeholder  the empty option's label
 * @param {() => any} o.get       snapshot of the current setup, to save
 * @param {(preset: any) => void} o.apply  put a saved setup on screen
 * @param {(preset: any) => boolean} [o.valid]  is this something the
 *   screen can actually use? An import is a file from anywhere, and a
 *   preset the screen cannot read must never reach the list.
 */
export function makeLibrary({ id, label, ids, storeKey, lastKey, placeholder, get, apply, valid }) {
  let items = load(storeKey, {});
  const saveItems = () => save(storeKey, items);
  const sel = $sel(ids.sel);
  const names = () => Object.keys(items).sort((a, b) => a.localeCompare(b));

  // export and import go through here; the store stays this module's
  registerCollection(id, {
    label,
    entries: () => names().map((n) => ({ label: n, item: items[n] })),
    put(name, item) {
      if (!item || typeof item !== 'object') return false;
      if (valid && !valid(item)) return false;
      items[name] = item;
      saveItems();
      render(sel.value);
      return true;
    },
  });

  function render(pick) {
    sel.innerHTML = '';
    sel.add(new Option(placeholder, ''));
    names().forEach((n) => sel.add(new Option(n, n)));
    sel.value = pick && items[pick] ? pick : '';
    saveStr(lastKey, sel.value);
  }

  sel.addEventListener('change', () => {
    const n = sel.value;
    if (n && items[n]) apply(items[n]);
    saveStr(lastKey, n);
  });
  function showName() {
    $(ids.name).hidden = false;
    $in(ids.input).value = '';
    $(ids.input).focus();
  }
  $(ids.nw).addEventListener('click', showName);
  $(ids.save).addEventListener('click', () => {
    const n = sel.value;
    if (!n) return showName(); // nothing selected — name a new one
    items[n] = get();
    saveItems();
  });
  $(ids.del).addEventListener('click', () => {
    const n = sel.value;
    if (!n) return;
    askConfirm('Delete "' + n + '"?', () => {
      delete items[n];
      saveItems();
      render('');
    });
  });
  $(ids.cancel).addEventListener('click', () => {
    $(ids.name).hidden = true;
  });
  $(ids.ok).addEventListener('click', () => {
    const n = $in(ids.input).value.trim();
    if (!n) return;
    items[n] = get();
    saveItems();
    render(n);
    $(ids.name).hidden = true;
  });

  // startup: the picker shows the last-picked name
  render(loadStr(lastKey, ''));

  /** the preset currently picked, or undefined */
  return { current: () => items[sel.value] };
}
