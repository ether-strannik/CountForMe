// Intervals domain: derive the session from the config. Pure — no DOM,
// no state; testable in Node.
//
// Two modes describe the same session from opposite ends, and both come
// out as the same nine numbers, so nothing downstream knows which was
// used.
//
//   time      Block, Cycle and Work are given. The cycle count is
//             DERIVED: cycles = ceil(block / cycle), so a block that is
//             not a whole number of cycles rounds UP to one and the
//             header shows the real length it will run. Work can't
//             exceed the cycle; the remainder of the cycle is rest.
//
//             Rounding up rather than down keeps the last cycle whole
//             instead of dropping it, and there are no ranges here to
//             be pushed out of step by the extra time: one cycle length
//             runs the whole block, and rounds repeat whatever the
//             block came to. Time is the metric being converted, not
//             the thing being promised.
//
//   standard  Work, Rest and Cycles are given. The cycle length and the
//             block are DERIVED: cycle = work + rest, block = cycles ×
//             cycle. Nothing snaps, because nothing is being divided.
//
// Rounds repeat the block in both, with `roundRest` between them —
// between, so there are one fewer rests than rounds and the session
// ends on work.

/**
 * What every mode produces, out of the four numbers they disagree about.
 * One home for the part that must not drift between them.
 */
function session(cycle, work, rest, cycles, c) {
  const blockSec = cycles * cycle;
  const sets = Math.max(1, Math.round(c.sets || 1));
  const roundRest = Math.max(0, Math.round(c.roundRest || 0));
  return {
    cycle,
    work,
    rest,
    cycles,
    blockSec,
    sets,
    roundRest,
    roundLen: blockSec + roundRest, // a round and the rest that follows it
    sessionSec: sets * blockSec + (sets - 1) * roundRest,
    approach: Math.max(0, Math.round(c.approach || 0)),
    turnaround: !!c.turnaround,
    prepare: Math.max(0, Math.round(c.prepare)),
  };
}

/**
 * Time based: a block of time cut into cycles.
 * @param {object} c
 * @param {number} c.prepare     get-ready lead-in, seconds
 * @param {number} c.block       block length, seconds
 * @param {number} c.cycle       work + rest, seconds
 * @param {number} c.work        work, seconds
 * @param {number} c.sets        rounds (repeat the block); NaN/0 → 1
 * @param {number} [c.roundRest] rest between rounds, seconds; 0 = back to back
 * @param {boolean} c.turnaround one cue halfway through work
 * @param {number} c.approach    knock seconds before a cycle ends
 */
function planTime(c) {
  const cycle = Math.max(1, Math.round(c.cycle));
  let work = Math.max(1, Math.round(c.work));
  if (work > cycle) work = cycle; // work can't exceed the cycle
  const block = Math.max(1, Math.round(c.block));
  // No clamp to 1 needed: both are at least 1, so the ceiling is too.
  // Under floor it was, which was the tell that floor was wrong.
  return session(cycle, work, cycle - work, Math.ceil(block / cycle), c);
}

/**
 * Standard: work, rest and a count — the shape most interval workouts
 * are written in.
 * @param {object} c
 * @param {number} c.prepare     get-ready lead-in, seconds
 * @param {number} c.work        work, seconds
 * @param {number} [c.rest]      rest after each work, seconds
 * @param {number} [c.cycles]    work/rest pairs in a round
 * @param {number} c.sets        rounds; NaN/0 → 1
 * @param {number} [c.roundRest] rest between rounds, seconds
 * @param {boolean} c.turnaround one cue halfway through work
 * @param {number} c.approach    knock seconds before a cycle ends
 */
function planStandard(c) {
  const work = Math.max(1, Math.round(c.work));
  const rest = Math.max(0, Math.round(c.rest || 0));
  return session(work + rest, work, rest, Math.max(1, Math.round(c.cycles || 1)), c);
}

/** the session, by whichever mode the screen is in */
export const plan = (mode, c) => (mode === 'standard' ? planStandard(c) : planTime(c));
