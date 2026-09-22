// The run engine both interval screens share: the session's cues, the
// screen wake lock, and pause/resume.
//
// One clock. Every cue in the list `cues.js` built is placed on the
// AUDIO clock the moment the session starts, so it plays whether or not
// the page is on screen: the audio thread keeps time when the animation
// frame loop is suspended. Drawing reads that same clock. A frame and
// the sound due in it come from one number, so what is seen and what is
// heard cannot come apart, whatever the clock itself does. Date.now()
// is not consulted; the two were drifting by seconds a minute.
//
// What a frame LOOKS like is the screen's job, handed in as hooks; the
// screens make no sound of their own.
import { audioCtx, ensureBuffers, ensureCounts, playAt, sayAt, buzz, holdClock, releaseClock } from './sound.js';
import { sessionStart, sessionPause, sessionResume, sessionStop } from './session.js';

/** a cue key from `cues.js` → the buzz that goes with it */
const BUZZ = {
  prepare: 120,
  main: 180,
  turn: [60, 60, 60],
  rest: 120,
  approach: 60,
  end: [200, 100, 200],
};

// A buzz further behind than this is dropped, not delivered late.
const STALE = 0.5;

// A spoken rep count lands just after its cue, so the cue stays the
// thing that marks the moment and the number follows it.
const SAY_AFTER = 0.3;

// How long DONE stays before the setup screen comes back. Long enough
// to read, short enough that the user is not left tapping STOP on a
// session that is already over.
const LINGER = 3000;

/**
 * @param {object} hooks
 * @param {(left: number) => void} hooks.ready     draw the lead-in, `left` s to go
 * @param {(elapsed: number) => void} hooks.frame  draw a frame, `elapsed` s in
 * @param {() => void} hooks.done                  draw the finish
 * @param {() => void} hooks.reset                 put the setup screen back
 * @param {(paused: boolean) => void} hooks.paused reflect pause/resume
 * @param {() => boolean} hooks.onScreen           is the run screen visible
 */
export function makeRunner(hooks) {
  let raf = 0;
  let wake = null;
  /** audio time of run second 0; moved forward by every pause */
  let base = 0;
  let paused = false;
  /** run seconds elapsed when the pause began */
  let pausedAt = 0;
  let running = false;
  let finished = false;
  let prepare = 0;
  let sessionSec = 0;
  /** @type {{at: number, event: string, say?: number}[]} */
  let cues = [];
  let cueIdx = 0;
  /** @type {AudioScheduledSourceNode[]} sounds placed on the audio clock */
  let sources = [];
  let lingerId;

  async function keepAwake() {
    try {
      wake = await navigator.wakeLock.request('screen');
    } catch {
      /* no wake lock on this device — the screen may sleep */
    }
  }
  function releaseAwake() {
    try {
      wake && wake.release();
    } catch {
      /* already released */
    }
    wake = null;
  }

  /**
   * Arm audio on the user's gesture and decode everything the session
   * will play, before the clock starts. Nothing can be fetched later:
   * every sound is scheduled the moment the run begins.
   * @param {{at: number, event: string, say?: number}[]} [list]
   */
  function arm(list = []) {
    audioCtx();
    return Promise.all([ensureBuffers(), ensureCounts(list.filter((c) => c.say).map((c) => c.say))]);
  }

  /**
   * start the clock: `s.prepare` seconds of lead-in, then `s.sessionSec`
   * @param {{prepare: number, sessionSec: number, title: string,
   *          cues: {at: number, event: string, say?: number}[]}} s
   */
  function go(s) {
    clearTimeout(lingerId);
    prepare = s.prepare;
    sessionSec = s.sessionSec;
    cues = s.cues;
    cueIdx = 0;
    paused = false;
    finished = false;
    running = true;
    holdClock(); // before scheduling: the clock must not stall mid-session
    keepAwake();
    sessionStart(prepare + sessionSec, s.title);
    schedule(0);
    tick();
  }

  /** seconds into the run, on the clock the cues are on */
  const elapsedNow = () => audioCtx().currentTime - base;

  /**
   * Put every cue still to come on the audio clock. `from` is where the
   * run is now, in seconds; anything earlier has already happened.
   * Called at START and again on resume, since a pause moves them all.
   */
  function schedule(from) {
    cancel();
    base = audioCtx().currentTime - from;
    /** what the cue before this one placed, still able to be sounding */
    let earlier = [];
    for (const c of cues) {
      if (c.at < from) continue;
      const at = base + c.at;
      cutAt(earlier, at);
      const group = playAt(c.event, at);
      if (c.say) group.push(...sayAt(c.say, at + SAY_AFTER));
      sources.push(...group);
      earlier = group; // a cue and its spoken count end together
    }
  }

  /**
   * End the previous cue where this one begins. A file plays to its own
   * end otherwise, so a sound longer than the gap would still be ringing
   * underneath the next cue. Decided here, at schedule time, so it holds
   * with the app in the background like everything else.
   *
   * Only sampled sounds. The synth fallback already carries its own stop
   * time, and a second `stop()` later than that would extend it.
   */
  function cutAt(group, at) {
    for (const s of group) {
      if (!(/** @type {AudioBufferSourceNode} */ (s).buffer)) continue;
      try {
        s.stop(at);
      } catch {
        /* already over */
      }
    }
  }

  /** drop every sound not yet played */
  function cancel() {
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        /* already finished */
      }
    }
    sources = [];
  }

  /**
   * The buzz that goes with each cue. Sound is already scheduled; this
   * only vibrates, and only while the page is on screen — Android
   * ignores vibration from a hidden page, and the frame loop that calls
   * this is suspended then anyway.
   */
  function fireCues(now) {
    while (cueIdx < cues.length && cues[cueIdx].at <= now) {
      const c = cues[cueIdx++];
      if (now - c.at < STALE) buzz(BUZZ[c.event]);
    }
  }

  function tick() {
    const now = elapsedNow();
    fireCues(now);

    // PREPARE: a get-ready lead-in before the session
    if (now < prepare) {
      hooks.ready(Math.ceil(prepare - now));
      raf = requestAnimationFrame(tick);
      return;
    }

    const elapsed = now - prepare;
    if (elapsed >= sessionSec) {
      finished = true;
      hooks.done();
      releaseAwake();
      sessionStop();
      // the session is over: show it, then put the setup screen back
      lingerId = setTimeout(stop, LINGER);
      return;
    }
    hooks.frame(elapsed);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    clearTimeout(lingerId);
    cancelAnimationFrame(raf);
    cancel();
    releaseClock();
    releaseAwake();
    sessionStop();
    running = false;
    paused = false;
    hooks.reset();
  }

  function togglePause() {
    if (!running || finished) return; // nothing to pause
    if (!paused) {
      paused = true;
      cancelAnimationFrame(raf);
      cancel(); // the rest of the session is no longer due when it was
      pausedAt = elapsedNow();
      sessionPause();
    } else {
      paused = false;
      schedule(pausedAt); // run second 0 moves forward by the pause's length
      sessionResume(prepare + sessionSec - pausedAt);
    }
    hooks.paused(paused);
    if (!paused) tick();
  }

  // re-arm the wake lock if the tab was hidden and comes back mid-run
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && hooks.onScreen() && !wake) keepAwake();
  });

  return { arm, go, stop, togglePause, running: () => running };
}
