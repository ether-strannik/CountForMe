// A tab's presets. The tab shows one row — `Preset: <name>  [Save]` —
// and the name button opens the shared manager (presetbox.js), which
// is where new and delete live. The library owns the store and which
// name is current; the tab owns what a preset IS (get), what applying
// one does (apply), and what an empty one looks like (blank).
//
// Nothing is written until Save. New names a preset and puts a blank
// setup on screen; the entry appears in the store the first time the
// user saves it. An abandoned name leaves nothing behind.
import { $, $btn } from './dom.js';
import { load, save, loadStr, saveStr } from './storage.js';
import { openPresets } from './presetbox.js';
import { useTheme, themeList, refOfId } from './theme.js';
import { loadThemeMusic } from './music.js';

/**
 * A store as it is now, whatever it was before.
 * @param {any} raw
 * @returns {{cats: {id: string, name: string, theme: string, music: boolean,
 *            items: Record<string, any>}[], items: Record<string, any>}}
 */
function migrate(raw) {
  if (raw && Array.isArray(raw.cats) && raw.items) {
    // a set made before sets could name a theme names none
    raw.cats.forEach((c) => (c.theme = typeof c.theme === 'string' ? c.theme : ''));
    // and one made before a theme carried music takes it: that is what
    // naming a theme meant when there was nothing else it could mean
    raw.cats.forEach((c) => (c.music = c.music !== false));
    return raw;
  }
  // v1: a flat map of presets, which are all loose until moved
  return { cats: [], items: raw && typeof raw === 'object' ? raw : {} };
}

/** a theme name as the presets file may carry it: "shipped", or a folder name */
const themeName = (v) => (typeof v === 'string' && /^[a-z0-9-]{0,120}$/.test(v) ? v : '');

/**
 * Whether a set takes the theme's music with the theme. Absent means
 * yes: a file written before the flag existed came from a time when a
 * theme's music was simply what you got.
 */
const wantsMusic = (v) => v !== false;

/**
 * Put on what a set wears: its theme, and its music if it wants it.
 *
 * The music is asked for here rather than left to follow the theme,
 * because a theme that is already on does not change and so tells
 * nobody. Picking a preset has to mean the same thing whether or not
 * the last one wore the same theme.
 * @param {{theme: string, music?: boolean}} set
 */
function wearTheme(set) {
  const want = wantsMusic(set.music);
  useTheme(set.theme, { music: false }).then((on) => on && want && loadThemeMusic());
}

/**
 * @param {object} o
 * @param {string} o.id           the collection id, for export and import
 * @param {string} o.label        the tab's name, for the transfer sheet
 * @param {{name: string, save: string}} o.ids  the two elements on the tab
 * @param {string} o.storeKey     localStorage key of the {name: preset} map
 * @param {string} o.lastKey      localStorage key of the current name
 * @param {() => any} o.get       snapshot of the current setup, to save
 * @param {(preset: any) => void} o.apply  put a saved setup on screen
 * @param {() => any} o.blank     a fresh setup, for a newly named preset
 * @param {(preset: any) => boolean} [o.valid]  is this something the
 *   screen can actually use? An import is a file from anywhere, and a
 *   preset the screen cannot read must never reach the list.
 */
export function makeLibrary({ id, label, ids, storeKey, lastKey, get, apply, blank, valid }) {
  // The store is a tree: sets, each holding presets, plus the presets
  // that belong to no set. A set is the unit someone shares — a whole
  // programme of presets — so a preset lives INSIDE its set rather
  // than carrying a label that would mean nothing to anyone else.
  //
  // Version 1 was a flat {name: preset}; it becomes the loose items.
  const store = migrate(load(storeKey, {}));
  const saveStore = () => save(storeKey, store);

  const sorted = (map) => Object.keys(map).sort((a, b) => a.localeCompare(b));
  /** every preset name, wherever it lives; the flat view the rest uses */
  const names = () => sorted(flat());
  /** {name: preset} across the whole tree */
  function flat() {
    const out = { ...store.items };
    store.cats.forEach((c) => Object.assign(out, c.items));
    return out;
  }
  /** the set holding a preset, or null when it is loose */
  const setOf = (n) => store.cats.find((c) => c.items[n]) || null;

  // The name on the tab. It can name a preset not yet saved, which is
  // what New leaves behind until the user presses Save.
  let current = loadStr(lastKey, '');
  if (current && !flat()[current]) current = '';

  // Where a newly named preset will land when it is first saved. It
  // has no entry yet, so the tree cannot be asked; this remembers the
  // set the user chose while naming it.
  let pendingCat = '';

  const draw = () => ($btn(ids.name).textContent = current || 'none');
  const setCurrent = (n, catId) => {
    current = n;
    pendingCat = catId || '';
    saveStr(lastKey, n);
    draw();
  };

  $(ids.name).addEventListener('click', () =>
    openPresets(label, {
      id,
      names,
      // each set with the presets inside it, so the sheet can nest them
      cats: () =>
        store.cats.map((c) => ({
          id: c.id,
          name: c.name,
          theme: c.theme || '',
          music: wantsMusic(c.music),
          items: sorted(c.items),
        })),
      // the presets in no set: these stay at the root, unindented
      loose: () => sorted(store.items),
      // A set may name a theme. Picking a preset from it puts that
      // theme on, so the setup screen already looks and will sound
      // like the workout. A set naming none changes nothing.
      //
      // The theme's music comes with it unless the set says otherwise,
      // in which case the look and the cues arrive and whatever was
      // playing is left playing.
      pick(n) {
        const p = flat()[n];
        if (!p) return;
        const set = setOf(n);
        if (set && set.theme) wearTheme(set);
        setCurrent(n);
        apply(p);
      },
      create(n, catId) {
        const set = store.cats.find((c) => c.id === catId);
        if (set && set.theme) wearTheme(set);
        setCurrent(n, catId); // unsaved until the tab's Save is pressed
        apply(blank());
      },
      /** every theme a set may name: Nord, then the usable ones in the folder */
      async themes() {
        const list = await themeList();
        return list.filter((t) => t.ok).map((t) => ({ ref: refOfId(t.id), name: t.name }));
      },
      setCatTheme(catId, ref) {
        const set = store.cats.find((c) => c.id === catId);
        if (!set) return;
        set.theme = themeName(ref);
        saveStore();
      },
      /** does this set take the theme's music with the theme */
      setCatMusic(catId, on) {
        const set = store.cats.find((c) => c.id === catId);
        if (!set) return;
        set.music = !!on;
        saveStore();
      },
      remove(n) {
        const set = setOf(n);
        delete (set ? set.items : store.items)[n];
        saveStore();
        if (current === n) setCurrent('');
      },
      /** presets and whole sets at once, in one write */
      removeMany(picked, catIds) {
        picked.forEach((n) => {
          const set = setOf(n);
          delete (set ? set.items : store.items)[n];
          if (current === n) setCurrent('');
        });
        (catIds || []).forEach((catId) => {
          const i = store.cats.findIndex((c) => c.id === catId);
          if (i < 0) return;
          if (store.cats[i].items[current]) setCurrent(''); // it went with the set
          store.cats.splice(i, 1);
        });
        saveStore();
      },
      addCat(name, theme) {
        store.cats.push({ id: 'c' + Date.now().toString(36), name, theme: themeName(theme), music: true, items: {} });
        saveStore();
      },
      /**
       * What an export writes: the chosen categories with their
       * presets inside, and the chosen loose presets alongside.
       * @param {string[]} picked   loose preset names
       * @param {string[]} catIds
       */
      exportPicked(picked, catIds) {
        const all = flat();
        const cats = store.cats.filter((c) => catIds.includes(c.id));
        // A chosen category already carries these. Emitting them here
        // too would put the same preset in the file twice, and an
        // import would land it as both a member and a loose copy.
        const inside = new Set(cats.flatMap((c) => Object.keys(c.items)));
        return {
          cats: cats.map((c) => ({
            name: c.name,
            theme: c.theme || '',
            music: wantsMusic(c.music),
            items: sorted(c.items).map((n) => ({ label: n, item: c.items[n] })),
          })),
          items: picked
            .filter((n) => !inside.has(n))
            .map((n) => ({ label: n, item: all[n] }))
            .filter((e) => e.item !== undefined),
        };
      },
      /**
       * Bring a file in. Nothing is overwritten: a preset whose name
       * is taken arrives as "name (2)", and so does a category. What
       * the user already has is never touched.
       * @param {{cats: {name: string, theme?: string, music?: boolean,
       *            items: {label: string, item: any}[]}[],
       *          items: {label: string, item: any}[]}} doc
       * @param {{theme: boolean, music: boolean}} [opts]  how much of a
       *   set's theme to keep; all of it when nothing is said
       * @returns {{cats: number, items: number, skipped: number}}
       */
      importDoc(doc, opts) {
        // What of a set's theme to keep. Music without a theme means
        // nothing, so it cannot outlive one.
        const takeTheme = !opts || opts.theme !== false;
        const takeMusic = takeTheme && (!opts || opts.music !== false);
        let added = 0;
        let skipped = 0;
        const free = (want, taken) => {
          if (!taken.has(want)) return want;
          let n = 2;
          while (taken.has(want + ' (' + n + ')')) n++;
          return want + ' (' + n + ')';
        };
        const okItem = (it) => it && typeof it === 'object' && (!valid || valid(it));

        (doc.cats || []).forEach((c) => {
          const name = free(c.name, new Set(store.cats.map((x) => x.name)));
          const items = {};
          c.items.forEach((e) => {
            if (!okItem(e.item)) return skipped++;
            items[e.label] = e.item;
            added++;
          });
          // the theme it names comes along as a name; whether the phone
          // has that theme is found out when a preset is picked
          store.cats.push({
            id: 'c' + Date.now().toString(36) + store.cats.length,
            name,
            theme: takeTheme ? themeName(c.theme) : '',
            music: takeMusic && wantsMusic(c.music),
            items,
          });
        });

        (doc.items || []).forEach((e) => {
          if (!okItem(e.item)) return skipped++;
          store.items[free(e.label, new Set(Object.keys(flat())))] = e.item;
          added++;
        });

        saveStore();
        return { cats: (doc.cats || []).length, items: added, skipped };
      },
      /** put presets into a set, taking them out of wherever they were */
      move(picked, catId) {
        const to = store.cats.find((c) => c.id === catId);
        if (!to) return;
        picked.forEach((n) => {
          const from = setOf(n);
          const p = (from ? from.items : store.items)[n];
          if (p === undefined) return;
          delete (from ? from.items : store.items)[n];
          to.items[n] = p;
        });
        saveStore();
      },
      // A set is deleted with what is in it: the presets went in on
      // purpose and the set is the thing being thrown away.
      removeCat(catId) {
        const i = store.cats.findIndex((c) => c.id === catId);
        if (i < 0) return;
        if (store.cats[i].items[current]) setCurrent('');
        store.cats.splice(i, 1);
        saveStore();
      },
    }),
  );

  $(ids.save).addEventListener('click', () => {
    if (!current) {
      // nothing named yet: the manager is where a name comes from
      return $(ids.name).click();
    }
    // back where it already lives; a brand new one goes to the set it
    // was named into, or loose when it was named into none
    const set = setOf(current) || store.cats.find((c) => c.id === pendingCat) || null;
    (set ? set.items : store.items)[current] = get();
    pendingCat = '';
    saveStore();
    draw();
  });

  draw();

  /** the preset currently on the tab, or undefined if it was never saved */
  return { current: () => flat()[current] };
}
