// Pure formatters. No DOM, no state; testable in Node.

/** m:ss, seconds rounded UP (a countdown shows the second it is in) */
export const fmt = (s) => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
};

/** h:mm:ss above an hour, else m:ss; seconds rounded DOWN */
export function fmtClock(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss;
}
