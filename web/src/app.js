// Count for me: tabs and startup. Each tab is its own module; this file
// only decides which one is on screen.
import './theme.js'; // paint the saved theme before anything draws
import { $, $$ } from './dom.js';
import './settings.js'; // the gear, and the sheet behind it
import './music.js'; // the strip above the tabs
import { openPlayer } from './player.js'; // and the sheet it opens
import { getStartTab } from './prefs.js';
import { renderTimers } from './timers.js';
import { isRunning } from './intervals.js';
import { iv2RenderSetup, isIv2Running } from './intervals2.js';

// ---- tabs: Timers / Phases / Cadence ----
// The code keeps the older names `intervals` and `intervals2`: they are
// the stored keys and the ids inside exported files, and moving them
// would invalidate what users have saved.
function showTab(t) {
  $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('config').hidden = true;
  $('run').hidden = true;
  $('timers').hidden = true;
  $('intervals2').hidden = true;
  $('iv2run').hidden = true;
  if (t === 'timer') {
    $('run').hidden = !isRunning();
    $('config').hidden = isRunning();
  } else if (t === 'intervals2') {
    if (isIv2Running()) {
      $('iv2run').hidden = false;
    } else {
      $('intervals2').hidden = false;
      iv2RenderSetup();
    }
  } else {
    $('timers').hidden = false;
    renderTimers();
  }
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// The strip names the song; tapping the name opens the player over
// whatever screen is up. Wired here rather than in `music.js`, which
// would have to import the sheet that imports it.
$('mName').addEventListener('click', openPlayer);

// open on the tab the user picked in settings (default Intervals)
showTab(getStartTab());
