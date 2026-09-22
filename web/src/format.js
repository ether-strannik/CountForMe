// Pure formatters. No DOM, no state; testable in Node.

/** m:ss, seconds rounded UP (a countdown shows the second it is in) */
export const fmt = (s) => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
};

/**
 * h:mm:ss above an hour, else m:ss; seconds rounded UP, because a
 * countdown shows the second it is IN. A 5:00 timer reads 5:00 for its
 * first second, and the moment it reads 0:03 is the moment three
 * seconds are left — which is what lets a cue at three seconds land on
 * the number the user is looking at.
 */
export function fmtClock(sec) {
  sec = Math.ceil(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}
