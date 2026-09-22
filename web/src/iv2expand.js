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

/** a whole number no smaller than `min`; anything unreadable is `min` */
const atLeast = (min, v) => Math.max(min, Math.round(+v || 0));

/**
 * A program in the shape the expansion takes it: whole seconds, rounds
 * at least one, every range ending inside the block and no earlier
 * than the one before, a cadence of at least a second. The builder
 * holds a program to this as it is typed. This is the same rule for
 * one that arrives whole, from the library or a file, applied once at
 * the door. Anything else on the program passes through untouched.
 */
export function iv2Clean(p) {
  const blockSec = atLeast(1, p.blockSec);
  let from = 0;
  const segs = (p.segs || []).map((s) => {
    const to = Math.min(blockSec, Math.max(from, atLeast(0, s.to)));
    from = to;
    const seg = { ...s, to, every: atLeast(1, s.every) };
    if (s.reps !== undefined) seg.reps = atLeast(1, s.reps);
    return seg;
  });
  return { ...p, blockSec, prepare: atLeast(0, p.prepare), rounds: atLeast(1, p.rounds), segs };
}

// Expand into a flat list of DINGS at absolute times, plus totals and
// how much of the block the segments cover. A ding is one cue.
//
// The numbers are taken as given, in the shape `iv2Clean` makes. The
// arithmetic here has no guard of its own: a cadence of zero would
// never end.
//
// `reps` is the count the cue announces on screen, and it is zero
// unless the program has rep counting switched on. That switch is the
// off state, so a range never has to mean "none" with a zero in it.
// The rep TOTAL always counts at least one per cue, because a cue is a
// rep whether or not it says so.
export function iv2Expand(prog) {
  const dings = [];
  const block = prog.blockSec;
  const segs = prog.segs || [];
  const counting = !!prog.showReps;
  let rep = 0;
  for (let r = 0; r < prog.rounds; r++) {
    const base = r * block;
    let from = 0;
    segs.forEach((seg) => {
      const reps = counting ? seg.reps || 1 : 0;
      const n = Math.floor((seg.to - from) / seg.every);
      for (let k = 0; k < n; k++) {
        rep += reps || 1;
        dings.push({ start: base + from + k * seg.every, round: r, rep, reps });
      }
      from = seg.to;
    });
  }
  let covered = 0;
  for (const seg of segs) covered = Math.max(covered, seg.to);
  return {
    prog,
    dings,
    sessionSec: prog.rounds * block,
    totalReps: rep,
    // Cues in one round — the work intervals. Not the same as reps
    // once a range asks for more than one rep per cue, which is why
    // the run screen counts these and not the reps.
    perRound: prog.rounds ? dings.length / prog.rounds : 0,
    blockSec: block,
    covered,
    complete: covered >= block,
  };
}
