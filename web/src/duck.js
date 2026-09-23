// The duck, as arithmetic. Given every sound a session has put on the
// clock, and the four numbers the user set, this says what the music's
// gain has to do. Nothing here touches audio, and nothing here has a
// dependency: it is a list in, a list out, so it runs in Node and can
// be proved before it is wired to anything.
//
// The rule it implements:
//
//   The song plays at its own level. A cue is coming, so the music is
//   taken down to the depth, arriving there as the cue starts. It
//   stays down while the cue sounds. Then the music is allowed back up
//   only if the next cue is far enough away; if it is not, the music
//   stays down and waits. So a cue every second ducks once at the
//   start of the run and lifts once at the end, not a hundred times.
//
// "Far enough away" is the user's gap, measured from the end of one
// sound to the start of the next, because that silence is what a lift
// would have to fit inside. There is a second, harder test underneath
// it: the round trip up and back down takes `up + down`, and a gap
// shorter than that has no room for it at any setting. Both have to
// pass, so a gap turned down to a second still cannot make the music
// flutter.

/** decibels as a multiplier, the same conversion the engine uses */
const fromDb = (db) => Math.pow(10, (+db || 0) / 20);

// Clock times are sums of floats, so a silence of exactly the gap
// measures as a hair under it and the lift it earned is refused. A
// microsecond of slack settles that, and is a millionth of anything
// anyone can hear.
const EPS = 1e-6;

/**
 * One sound on the audio clock: when it starts, and how long it runs.
 * @typedef {{ at: number, dur: number }} Cue
 */

/**
 * One breakpoint on the music gain: be at `v` by time `t`. Consecutive
 * points are a ramp; two points of equal `v` are a hold.
 * @typedef {{ t: number, v: number }} Point
 */

/**
 * The stretches of time the music has to be down for, with every run
 * of sounds too close together merged into one.
 * @param {Cue[]} cues
 * @param {number} gap   seconds of silence that earn a lift
 * @param {number} floor seconds a lift physically needs: up + down
 * @returns {{ s: number, e: number }[]}
 */
function windows(cues, gap, floor) {
  const inOrder = cues.filter((c) => c && isFinite(c.at)).sort((a, b) => a.at - b.at);
  const room = Math.max(gap, floor);
  /** @type {{ s: number, e: number }[]} */
  const out = [];
  for (const c of inOrder) {
    const end = c.at + Math.max(0, c.dur || 0);
    const open = out[out.length - 1];
    // Close enough to the one before that a lift would not fit, or
    // would not last: the same window goes on.
    if (open && c.at - open.e < room - EPS) open.e = Math.max(open.e, end);
    else out.push({ s: c.at, e: end });
  }
  return out;
}

/**
 * What the music's gain does over a whole session.
 *
 * The fall lands exactly on the cue, so it happens before it rather
 * than over it: the cue's attack is already in the clear. The lift
 * starts the moment the last sound of a window ends.
 *
 * @param {Cue[]} cues  every sound the session has scheduled
 * @param {{ from: number, depth: number, gap: number, down: number, up: number }} o
 *   `from` is the clock time this is written at; nothing is placed
 *   before it. `depth` is in decibels and never a lift. `gap` is in
 *   seconds, `down` and `up` in milliseconds.
 * @returns {Point[]} in time order, the first one full level
 */
export function duckEnvelope(cues, o) {
  const down = Math.max(0, o.down) / 1000;
  const up = Math.max(0, o.up) / 1000;
  const depth = fromDb(Math.min(0, o.depth));
  if (!cues.length || depth >= 1) return [];

  /** @type {Point[]} */
  const pts = [];
  const put = (t, v) => {
    const last = pts[pts.length - 1];
    // Same instant as the one before, or earlier: the later value wins
    // rather than time going backwards.
    if (last && last.t >= t) {
      last.v = v;
    } else {
      pts.push({ t, v });
    }
  };

  for (const w of windows(cues, o.gap, up + down)) {
    // A window whose fall would start before now is already upon us:
    // it falls from wherever the gain is, over what time is left.
    const fall = Math.max(o.from, w.s - down);
    put(fall, 1);
    put(Math.max(fall, w.s), depth);
    put(w.e, depth);
    put(w.e + up, 1);
  }
  return pts;
}
