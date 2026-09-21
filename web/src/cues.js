// When every cue in a session fires: one flat list of {at, event}, `at`
// in seconds from START with the lead-in included. Pure — no DOM, no
// clock, no sound. The caller maps an event key to a sound and a
// vibration, so this is the single home for *when*, shared by the run
// screens and the notification service. Two answers to "when" is the bug
// this file exists to prevent.
//
// Events:
//   prepare   the lead-in has begun; get ready
//   main      a rep, or the work phase of a cycle beginning
//   turn      halfway through work
//   rest      work gives way to rest
//   approach  one knock per second before what comes next
//   end       the session is over

/**
 * The lead-in: one cue the moment it starts, then knocks over its last
 * `approach` seconds. No prepare, no cue — the session's own first cue
 * is at the same instant and two at once is one muddle.
 */
function leadIn(prepare, approach, out) {
  if (prepare > 0) out.push({ at: 0, event: 'prepare' });
  for (let k = Math.min(approach, prepare); k >= 1; k--) out.push({ at: prepare - k, event: 'approach' });
}

/** ascending by time; equal times keep the order they were pushed in */
const byTime = (list) => list.slice().sort((a, b) => a.at - b.at);

/**
 * Intervals: cycles of work then rest, the block repeated for N rounds.
 * The plan carries its own prepare and approach, so nothing else is needed.
 * @param {ReturnType<import("./ivplan.js").plan>} p
 * @returns {{at: number, event: string}[]}
 */
export function intervalsCues(p) {
  const out = [];
  leadIn(p.prepare, p.approach, out);
  for (let r = 0; r < p.sets; r++) {
    const roundAt = p.prepare + r * p.roundLen;
    for (let i = 0; i < p.cycles; i++) {
      const base = roundAt + i * p.cycle;
      out.push({ at: base, event: 'main' });
      if (p.turnaround) out.push({ at: base + p.work / 2, event: 'turn' });
      if (p.rest > 0) out.push({ at: base + p.work, event: 'rest' });
      if (p.approach > 0) {
        for (let j = Math.max(0, p.cycle - p.approach); j < p.cycle; j++) out.push({ at: base + j, event: 'approach' });
      }
    }
    // the rest BETWEEN rounds: none after the last one, and the knocks
    // at its end are the get-ready for the round about to start
    if (p.roundRest > 0 && r < p.sets - 1) {
      const restAt = roundAt + p.blockSec;
      out.push({ at: restAt, event: 'rest' });
      if (p.approach > 0) {
        for (let j = Math.max(0, p.roundRest - p.approach); j < p.roundRest; j++) {
          out.push({ at: restAt + j, event: 'approach' });
        }
      }
    }
  }
  out.push({ at: p.prepare + p.sessionSec, event: 'end' });
  return byTime(out);
}

/**
 * Intervals 2: a rep at every ding in the expanded timeline. The
 * expansion has no approach setting in it — that lives in settings, not
 * in the program — so it comes in as an argument.
 * @param {ReturnType<import("./iv2expand.js").iv2Expand>} x
 * @param {number} approach  knock seconds before a rep; 0 = off
 * @param {boolean} [voice]  speak the rep count at each cue that has one
 * @returns {{at: number, event: string, say?: number}[]}
 */
export function intervals2Cues(x, approach, voice) {
  const out = [];
  const prepare = Math.max(0, Math.round(x.prog.prepare || 0));
  leadIn(prepare, approach, out);
  x.dings.forEach((d, i) => {
    // `reps` is already zero unless the program counts them, so voice
    // needs both switches on before anything is said
    const say = voice && d.reps >= 1 ? d.reps : 0;
    out.push(say ? { at: prepare + d.start, event: 'main', say } : { at: prepare + d.start, event: 'main' });
    // knocks lead up to the NEXT rep, and never reach back to this one
    const nextStart = i + 1 < x.dings.length ? x.dings[i + 1].start : x.sessionSec;
    for (let m = Math.min(approach, nextStart - d.start - 1); m >= 1; m--) {
      out.push({ at: prepare + nextStart - m, event: 'approach' });
    }
  });
  out.push({ at: prepare + x.sessionSec, event: 'end' });
  return byTime(out);
}
