// Intervals: a block of cycles (work + rest), repeated for N rounds.
// Config with the mm:ss keypad, a wall-clock run engine, and presets.
import { $, $in, $sel, fitText } from './dom.js';
import { fmt } from './format.js';
import { openKeypad } from './keypad.js';
import { makeRunner } from './runner.js';
import { makeLibrary } from './library.js';
import { plan } from './ivplan.js';
import { intervalsCues } from './cues.js';
import { loadStr, saveStr } from './storage.js';
import { approachSec } from './settings.js';

// ---- config: the time fields (seconds) live here; the counts and the
// Turnaround toggle are form controls, read when the domain needs them.
const ivT = { prepare: 10, block: 600, cycle: 60, work: 30, rest: 15, roundRest: 0 };
const turnOn = () => $('turn').getAttribute('aria-pressed') === 'true';

// Which end the user describes the session from. The tab owns it, and a
// preset carries its own, since a setup means nothing without its mode.
let mode = loadStr('timer.ivmode', 'time');

/** the config as the domain sees it: fields, form controls, setting */
const gather = () => ({
  ...ivT,
  sets: +$in('sets').value,
  cycles: +$in('cycles').value,
  turnaround: turnOn(),
  approach: approachSec(),
});

function refresh() {
  const p = plan(mode, gather());
  $('calcTop').textContent =
    fmt(p.sessionSec) + ' · ' + p.cycles * p.sets + ' cycles · ' + p.sets + (p.sets > 1 ? ' rounds' : ' round');
  $('calcBot').textContent =
    p.work + ' sec work / ' + p.rest + ' sec rest' + (p.roundRest ? ' · ' + fmt(p.roundRest) + ' between rounds' : '');
}

// config time fields open the mm:ss keypad (same as Intervals2)
function ivRenderCfg() {
  $('prepareBtn').textContent = fmt(ivT.prepare);
  $('blockBtn').textContent = fmt(ivT.block);
  $('cycleBtn').textContent = fmt(ivT.cycle);
  $('workBtn').textContent = fmt(ivT.work);
  $('restBtn').textContent = fmt(ivT.rest);
  $('roundRestBtn').textContent = fmt(ivT.roundRest);
  // the rows the other mode does not use
  const standard = mode === 'standard';
  $('rowBlock').hidden = standard;
  $('rowCycle').hidden = standard;
  $('rowRest').hidden = !standard;
  $('rowCycles').hidden = !standard;
  $sel('ivMode').value = mode;
  refresh();
}
const ivTimeField = (btn, key, title, min) =>
  $(btn).addEventListener('click', () =>
    openKeypad(title, ivT[key], (sec) => {
      ivT[key] = Math.max(min, sec);
      ivRenderCfg();
    }),
  );
ivTimeField('prepareBtn', 'prepare', 'Prepare', 0);
ivTimeField('blockBtn', 'block', 'Block', 1);
ivTimeField('cycleBtn', 'cycle', 'Cycle', 1);
ivTimeField('workBtn', 'work', 'Work', 1);
ivTimeField('restBtn', 'rest', 'Rest', 0);
ivTimeField('roundRestBtn', 'roundRest', 'Rest between rounds', 0);
$('sets').addEventListener('input', refresh);
$('cycles').addEventListener('input', refresh);
$('ivMode').addEventListener('change', () => {
  mode = $sel('ivMode').value;
  saveStr('timer.ivmode', mode);
  ivRenderCfg();
});

// Enter in a field must never start the timer — only START does. The
// preset name box is not here any more; presetbox.js owns its Enter.
$('config').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.tagName === 'INPUT') t.blur();
});

// ---- run: the shared engine keeps the clock and plays the cues;
// these hooks only draw ----
/** the round and cycle line, shrunk to fit when the numbers get long */
const setCount = (t) => {
  $('count').textContent = t;
  fitText($('count'));
};
let session = null;
let lastIdx = -1;
let turnDone = false;

const runner = makeRunner({
  onScreen: () => !$('run').hidden,
  ready(left) {
    $('run').classList.add('prep');
    $('phaseLabel').textContent = 'READY';
    setCount('');
    $('big').textContent = String(left);
    $('total').textContent = fmt(session.sessionSec);
  },
  frame(elapsed) {
    $('run').classList.remove('prep');
    // which round, and how far into it (the block, then the rest after)
    const round = Math.min(session.sets - 1, Math.floor(elapsed / session.roundLen));
    const inRound = elapsed - round * session.roundLen;
    $('total').textContent = fmt(session.sessionSec - elapsed);

    // past the block: the rest between this round and the next
    if (inRound >= session.blockSec) {
      $('run').classList.add('phase-rest');
      $('phaseLabel').textContent = 'REST';
      $('big').textContent = String(Math.ceil(session.roundLen - inRound));
      setCount(round + 2 + '/' + session.sets + ' · 1/' + session.cycles);
      return;
    }

    // inside the block: where in the cycle, and which phase
    const idx = Math.floor(inRound / session.cycle); // 0-based cycle in the round
    const inCycle = inRound - idx * session.cycle;
    const inWork = inCycle < session.work; // work phase, else rest
    const phaseRem = inWork ? session.work - inCycle : session.cycle - inCycle;

    // new cycle → flash, and the turnaround is due again
    const nth = round * session.cycles + idx; // across the whole session
    if (nth !== lastIdx) {
      lastIdx = nth;
      turnDone = false;
      $('run').classList.add('go');
      setTimeout(() => $('run').classList.remove('go'), 500);
    }
    // turnaround: halfway through the WORK phase
    if (session.turnaround && inWork && !turnDone && inCycle >= session.work / 2) {
      turnDone = true;
      $('run').classList.add('turn');
      setTimeout(() => $('run').classList.remove('turn'), 600);
    }
    $('phaseLabel').textContent = inWork ? 'WORK' : 'REST';
    $('run').classList.toggle('phase-rest', !inWork);
    $('big').textContent = String(Math.ceil(phaseRem));
    setCount(round + 1 + '/' + session.sets + ' · ' + (idx + 1) + '/' + session.cycles);
  },
  done() {
    $('run').classList.add('done');
    $('run').classList.remove('prep', 'phase-rest');
    $('phaseLabel').textContent = 'DONE';
    $('big').textContent = '✓';
    setCount(session.sets + '/' + session.sets + ' · ' + session.cycles + '/' + session.cycles);
    $('total').textContent = '0:00';
  },
  reset() {
    $('pauseBtn').textContent = 'PAUSE';
    $('pauseBtn').classList.remove('resume');
    // Only take over the screen if this tab HAS the screen. A session
    // can end while the user is on another tab, and app.js shows the
    // setup screen on its own when they come back to this one.
    const showing = !$('run').hidden;
    $('run').hidden = true;
    $('run').classList.remove('done', 'go', 'prep', 'phase-rest');
    if (showing) $('config').hidden = false;
  },
  paused(p) {
    $('pauseBtn').textContent = p ? 'RESUME' : 'PAUSE';
    $('pauseBtn').classList.toggle('resume', p);
  },
});

/** true while a session is on the run screen (running, paused or done) */
export const isRunning = () => runner.running();

async function start() {
  session = plan(mode, gather());
  const cues = intervalsCues(session);
  await runner.arm(cues); // decode everything the session plays, first
  lastIdx = -1;
  turnDone = false;
  $('pauseBtn').textContent = 'PAUSE';
  $('pauseBtn').classList.remove('resume');
  $('config').hidden = true;
  $('run').hidden = false;
  $('run').classList.remove('done', 'phase-rest');
  runner.go({
    prepare: session.prepare,
    sessionSec: session.sessionSec,
    title: 'Phases',
    cues,
  });
}

$('turn').addEventListener('click', () => {
  const on = $('turn').getAttribute('aria-pressed') !== 'true';
  $('turn').setAttribute('aria-pressed', String(on));
  $('turn').textContent = on ? 'ON' : 'OFF';
});
$('startBtn').addEventListener('click', start);
$('stopBtn').addEventListener('click', runner.stop);
$('pauseBtn').addEventListener('click', runner.togglePause);

// ---- presets: save a whole setup and pick it later ----
function getConfig() {
  return {
    mode,
    prepare: ivT.prepare,
    block: ivT.block,
    cycle: ivT.cycle,
    work: ivT.work,
    rest: ivT.rest,
    cycles: Math.max(1, Math.round(+$in('cycles').value || 1)),
    sets: Math.max(1, Math.round(+$in('sets').value || 1)),
    roundRest: ivT.roundRest,
    turn: turnOn(),
  };
}
function setConfig(c) {
  // a preset carries the mode it was built in; one saved before modes
  // existed is time based, which is all there was
  mode = c.mode === 'standard' ? 'standard' : 'time';
  saveStr('timer.ivmode', mode);
  if (c.prepare != null) ivT.prepare = c.prepare;
  if (c.block != null) ivT.block = c.block;
  else if (c.time != null) ivT.block = c.time * 60; // migrate old presets
  if (c.cycle != null) ivT.cycle = c.cycle;
  if (c.work != null) ivT.work = c.work;
  if (c.rest != null) ivT.rest = c.rest;
  if (c.cycles != null) $in('cycles').value = String(c.cycles);
  ivT.roundRest = c.roundRest || 0; // a preset saved before this existed has none
  if (c.sets != null) $in('sets').value = String(c.sets);
  const on = !!c.turn;
  $('turn').setAttribute('aria-pressed', String(on));
  $('turn').textContent = on ? 'ON' : 'OFF';
  ivRenderCfg();
}

/** what a newly named preset starts from: the tab's own defaults */
const blankConfig = () => ({
  mode: 'time',
  prepare: 10,
  block: 600,
  cycle: 60,
  work: 30,
  rest: 15,
  cycles: 8,
  sets: 1,
  roundRest: 0,
  turn: false,
});

const presets = makeLibrary({
  id: 'intervals',
  label: 'Phases', // what the transfer sheet shows; the id stays, it is in saved files
  ids: { name: 'ivPresetName', save: 'ivPresetSave' },
  storeKey: 'timer.presets',
  lastKey: 'timer.lastPreset',
  get: getConfig,
  apply: setConfig,
  blank: blankConfig,
});

// startup: draw the config and restore the last-used preset
ivRenderCfg();
const lastPreset = presets.current();
if (lastPreset) setConfig(lastPreset);
