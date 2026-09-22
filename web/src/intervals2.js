// Intervals 2: the block-first builder, the program library, and the
// run screen that plays the expanded timeline.
import { $, $in, $btn, MINUS_SVG, fitText } from './dom.js';
import { fmt } from './format.js';
import { openKeypad } from './keypad.js';
import { makeRunner } from './runner.js';
import { makeLibrary } from './library.js';
import { IV2_DEFAULT, iv2Clean, iv2Expand } from './iv2expand.js';
import { intervals2Cues } from './cues.js';
import { approachSec } from './prefs.js';

// The program on screen. It lives in memory only: Save is the one
// thing that writes, so closing the app with unsaved edits loses them,
// the same as Phases. On startup the last-used preset is loaded back.
let iv2Prog = JSON.parse(JSON.stringify(IV2_DEFAULT));

// ---- builder ----
/** "1 cycle" or "12 cycles" */
const count = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

const warn = (t) => "<span class='iv2warn'>" + t + '</span>';

/**
 * A range that does not divide, said plainly, with the ends that
 * would. The app never picks one: it names them and waits.
 *
 * An end is only offered if it can be reached. Below the range's own
 * start is a range of no length, and past the block is a number the
 * keypad will clamp straight back.
 */
function raggedNote(r, blockSec) {
  const ends = [];
  if (r.lower > r.from) ends.push(fmt(r.lower));
  if (r.higher <= blockSec) ends.push(fmt(r.higher));
  const head = 'Range ' + r.index + ': ' + fmt(r.to) + ' is not a whole number of ' + r.every + 's. ';
  if (!ends.length) return warn(head + 'Nothing fits inside the block at that cadence.');
  return warn(head + 'Use ' + ends.join(' or ') + '.');
}

function iv2Over() {
  const x = iv2Expand(iv2Prog);
  const ok = x.complete && !x.ragged;
  if (x.ragged) {
    // Wrong the moment it is typed, and it moves every range after it,
    // so it is said before anything about coverage.
    $('iv2over').innerHTML = raggedNote(x.ragged, x.blockSec);
  } else if (!x.complete) {
    $('iv2over').innerHTML = warn(fmt(x.blockSec - x.covered) + ' of the block still undefined');
  } else {
    // Cycles and rounds, the same two the run screen counts and the
    // same two Phases shows. Reps only while they are being counted:
    // with that switch off a rep is a cue, and the line would print
    // one number twice under two names.
    const bits = [count(x.perRound, 'cycle'), count(iv2Prog.rounds, 'round')];
    if (iv2Prog.showReps) bits.push(count(x.totalReps, 'rep'));
    $('iv2over').innerHTML = '<b>' + fmt(x.sessionSec) + '</b> · ' + bits.join(' · ');
  }
  $btn('iv2start').disabled = !ok;
}

export function iv2RenderSetup() {
  $('iv2block').textContent = fmt(iv2Prog.blockSec);
  $('iv2prep').textContent = fmt(iv2Prog.prepare);
  $in('iv2rounds').value = String(iv2Prog.rounds);
  $('iv2repcount').setAttribute('aria-checked', String(!!iv2Prog.showReps));
  $('iv2voice').setAttribute('aria-checked', String(!!iv2Prog.voice));
  const box = $('iv2rows');
  box.innerHTML = '';
  let from = 0;
  iv2Prog.segs.forEach((seg, i) => {
    const fromHere = from;
    const el = document.createElement('div');
    el.className = 'iv2row';
    el.innerHTML =
      '<span class="iv2rowlab">' +
      (i + 1) +
      '</span>' +
      '<span class="iv2from">' +
      fmt(fromHere) +
      '</span>' +
      '<span class="iv2dash">–</span>' +
      '<button class="iv2timebtn iv2to">' +
      fmt(seg.to) +
      '</button>' +
      '<label class="iv2ev">every <input class="iv2in" data-k="every" inputmode="numeric" />s</label>' +
      (iv2Prog.showReps
        ? '<label class="iv2rp"><input class="iv2in" data-k="reps" inputmode="numeric" /> rep</label>'
        : '') +
      '<button class="iv2del">' +
      MINUS_SVG +
      '</button>';
    el.querySelector('.iv2to').addEventListener('click', () =>
      openKeypad('Range end', seg.to, (sec) => {
        seg.to = Math.min(iv2Prog.blockSec, Math.max(fromHere + 1, sec));
        iv2RenderSetup();
      }),
    );
    const eEvery = /** @type {HTMLInputElement} */ (el.querySelector('[data-k="every"]'));
    eEvery.value = String(seg.every);
    eEvery.addEventListener('input', () => {
      seg.every = Math.max(1, Math.round(+eEvery.value || 0));
      iv2Over();
    });
    const eReps = /** @type {HTMLInputElement} */ (el.querySelector('[data-k="reps"]'));
    if (eReps) {
      eReps.value = String(seg.reps || 1);
      eReps.addEventListener('input', () => {
        seg.reps = Math.max(1, Math.round(+eReps.value || 1));
        iv2Over();
      });
    }
    el.querySelector('.iv2del').addEventListener('click', () => {
      iv2Prog.segs.splice(i, 1);
      iv2RenderSetup();
    });
    box.appendChild(el);
    from = seg.to;
  });
  const add = document.createElement('button');
  add.className = 'iv2add';
  add.textContent = '+ Add range';
  add.addEventListener('click', () => {
    const f = iv2Prog.segs.length ? iv2Prog.segs[iv2Prog.segs.length - 1].to : 0;
    if (f >= iv2Prog.blockSec) return; // block already full
    iv2Prog.segs.push({ to: iv2Prog.blockSec, every: 30 }); // fill to end
    iv2RenderSetup();
  });
  box.appendChild(add);
  iv2Over();
}

$('iv2block').addEventListener('click', () =>
  openKeypad('Block length', iv2Prog.blockSec, (sec) => {
    iv2Prog.blockSec = Math.max(1, sec);
    iv2Prog.segs.forEach((s) => (s.to = Math.min(s.to, iv2Prog.blockSec)));
    iv2RenderSetup();
  }),
);
$('iv2prep').addEventListener('click', () =>
  openKeypad('Prepare', iv2Prog.prepare, (sec) => {
    iv2Prog.prepare = Math.max(0, sec);
    iv2RenderSetup();
  }),
);
// Rep counting off is the off state, so a range never has to say zero.
// Turning it on gives every range that has no count one rep.
$('iv2repcount').addEventListener('click', () => {
  iv2Prog.showReps = !iv2Prog.showReps;
  iv2RenderSetup();
});
// Voice: the switch holds the setting and nothing reads it yet.
$('iv2voice').addEventListener('click', () => {
  iv2Prog.voice = !iv2Prog.voice;
  iv2RenderSetup();
});
$('iv2rounds').addEventListener('input', () => {
  iv2Prog.rounds = Math.max(1, Math.round(+$in('iv2rounds').value || 1));
  iv2Over();
});
$('intervals2').addEventListener('keydown', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (e.key === 'Enter' && t.tagName === 'INPUT') {
    e.preventDefault();
    t.blur();
  }
});

// ---- Intervals 2 program library (save/load) ----
/**
 * Put a saved program on screen. The handlers above keep a program in
 * shape as it is typed; one that arrives whole, from the library or a
 * file, is put in shape here, at the door, and nowhere later.
 */
function applyProg(p) {
  if (!p || !Array.isArray(p.segs)) return;
  iv2Prog = iv2Clean(JSON.parse(JSON.stringify(p)));
  iv2RenderSetup();
}

const iv2Presets = makeLibrary({
  id: 'intervals2',
  label: 'Cadence', // what the transfer sheet shows; the id stays, it is in saved files
  ids: { name: 'iv2PresetName', save: 'iv2PresetSave' },
  storeKey: 'timer.iv2programs',
  lastKey: 'timer.iv2lastprog',
  get: () => JSON.parse(JSON.stringify(iv2Prog)),
  blank: () => JSON.parse(JSON.stringify(IV2_DEFAULT)),
  // a program is its ranges; anything without them is not one
  valid: (p) => Array.isArray(p.segs),
  apply: applyProg,
});

// ---- run: the shared engine keeps the clock and plays the cues;
// these hooks only draw ----
/** the round and rep line, shrunk to fit when the numbers get long */
const setCount = (t) => {
  $('iv2count').textContent = t;
  fitText($('iv2count'));
};

// How many reps this cue asks for, over the run screen for a moment.
// Only reached when the program has rep counting switched on, since
// the expansion reports zero otherwise. It closes early if the next
// cue would arrive first.
let repsId;
function showReps(n, ms) {
  clearTimeout(repsId);
  $('iv2repsval').textContent = String(n);
  $('iv2repslab').textContent = n === 1 ? 'REP' : 'REPS';
  $('iv2reps').hidden = false;
  repsId = setTimeout(() => ($('iv2reps').hidden = true), Math.max(400, Math.min(3000, ms)));
}
function hideReps() {
  clearTimeout(repsId);
  $('iv2reps').hidden = true;
}
let iv2Session = null;
let iv2LastDing = -1;

// current ding = the last one whose start has passed (time only advances)
function iv2FindDing(elapsed) {
  const d = iv2Session.dings;
  let i = Math.max(0, iv2LastDing);
  while (i + 1 < d.length && d[i + 1].start <= elapsed) i++;
  return i;
}

const runner = makeRunner({
  onScreen: () => !$('iv2run').hidden,
  ready(left) {
    $('iv2run').classList.add('prep');
    $('iv2phase').textContent = 'READY';
    setCount('');
    $('iv2big').textContent = String(left);
    $('iv2total').textContent = fmt(iv2Session.sessionSec);
  },
  frame(elapsed) {
    $('iv2run').classList.remove('prep');
    const s = iv2Session;
    const idx = iv2FindDing(elapsed);
    const d = s.dings[idx];
    const nextStart = idx + 1 < s.dings.length ? s.dings[idx + 1].start : s.sessionSec;
    const shown = Math.ceil(nextStart - elapsed);

    if (idx !== iv2LastDing) {
      iv2LastDing = idx;
      $('iv2run').classList.add('go');
      setTimeout(() => $('iv2run').classList.remove('go'), 500);
      if (d.reps >= 1) showReps(d.reps, (nextStart - d.start) * 1000 - 200);
    }
    $('iv2phase').textContent = 'NEXT';
    $('iv2big').textContent = String(shown);
    const inRound = s.perRound ? (idx % s.perRound) + 1 : 1;
    setCount(d.round + 1 + '/' + s.prog.rounds + ' · ' + inRound + '/' + s.perRound);
    $('iv2total').textContent = fmt(s.sessionSec - elapsed);
  },
  done() {
    hideReps();
    $('iv2run').classList.add('done');
    $('iv2phase').textContent = 'DONE';
    $('iv2big').textContent = '✓';
    setCount(
      iv2Session.prog.rounds + '/' + iv2Session.prog.rounds + ' · ' + iv2Session.perRound + '/' + iv2Session.perRound,
    );
    $('iv2total').textContent = '0:00';
  },
  reset() {
    hideReps();
    $('iv2pause').textContent = 'PAUSE';
    // see intervals.js: a session can end while another tab is showing
    const showing = !$('iv2run').hidden;
    $('iv2run').hidden = true;
    $('iv2run').classList.remove('done', 'go', 'prep');
    if (showing) $('intervals2').hidden = false;
    iv2RenderSetup();
  },
  paused(p) {
    $('iv2pause').textContent = p ? 'RESUME' : 'PAUSE';
  },
});

/** true while a program is on the run screen (running, paused or done) */
export const isIv2Running = () => runner.running();

async function iv2Start(prog) {
  const plan = iv2Expand(prog);
  if (!plan.complete) return; // block not fully defined yet
  iv2Session = plan;
  const cues = intervals2Cues(plan, approachSec(), !!prog.voice);
  await runner.arm(cues); // decode everything the session plays, first
  iv2LastDing = -1;
  $('iv2pause').textContent = 'PAUSE';
  $('intervals2').hidden = true;
  $('iv2run').hidden = false;
  $('iv2run').classList.remove('done', 'go', 'prep');
  runner.go({
    prepare: plan.prog.prepare,
    sessionSec: plan.sessionSec,
    title: 'Cadence',
    cues,
  });
}

// startup: draw the builder and restore the last-used preset, the
// same as Phases
iv2RenderSetup();
applyProg(iv2Presets.current());

$('iv2start').addEventListener('click', () => iv2Start(iv2Prog));
$('iv2stop').addEventListener('click', runner.stop);
$('iv2pause').addEventListener('click', runner.togglePause);
