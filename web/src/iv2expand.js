// Intervals 2 domain: a program and its expansion into a timeline.
// Pure — no DOM, no state; testable in Node.
// A program: prepare lead-in, a block of ROWS, and rounds that repeat
// the block. A row is dead simple: do a rep EVERY X seconds, for a
// Duration. No work/rest. Sample = Sandbag Berserker Level 1.1
// (should read 30:00, 36 reps).
// The block is a fixed boundary (seconds). Segments tile it as ranges
// [from, to] (from auto-chains) each with its own cadence — a rep every
// N seconds. Rounds repeat the block. Default = Sandbag Level 1.1.
export const IV2_DEFAULT = {
  prepare: 10,
  blockSec: 300,
  rounds: 6,
  segs: [
    { to: 60, every: 30 }, // 00:00–01:00, a rep every 30s
    { to: 300, every: 60 }, // 01:00–05:00, a rep every 60s
  ],
};

// Expand into a flat list of DINGS at absolute times, plus totals and
// how much of the block the segments cover. A ding is one cue.
//
// `reps` is the count the cue announces on screen, and it is zero
// unless the program has rep counting switched on. That switch is the
// off state, so a range never has to mean "none" with a zero in it.
// The rep TOTAL always counts at least one per cue, because a cue is a
// rep whether or not it says so.
export function iv2Expand(prog) {
  const dings = [];
  const block = Math.max(1, Math.round(prog.blockSec || 0));
  const segs = prog.segs || [];
  const counting = !!prog.showReps;
  let rep = 0;
  for (let r = 0; r < prog.rounds; r++) {
    const base = r * block;
    let from = 0;
    segs.forEach((seg) => {
      const to = Math.min(block, Math.max(from, Math.round(seg.to)));
      const every = Math.max(1, Math.round(seg.every));
      const reps = counting ? Math.max(1, Math.round(seg.reps || 1)) : 0;
      const n = Math.floor((to - from) / every);
      for (let k = 0; k < n; k++) {
        rep += Math.max(1, reps);
        dings.push({ start: base + from + k * every, round: r, rep, reps });
      }
      from = to;
    });
  }
  let covered = 0;
  for (const seg of segs) covered = Math.min(block, Math.max(covered, Math.round(seg.to)));
  return {
    prog,
    dings,
    sessionSec: prog.rounds * block,
    totalReps: rep,
    blockSec: block,
    covered,
    complete: covered >= block,
  };
}
