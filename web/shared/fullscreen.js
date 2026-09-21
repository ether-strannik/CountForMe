// Double-tap anywhere to go full screen, and again to come back.
//
// The page opts in with one line and gets the whole behaviour:
//
//     <script src="/shared/fullscreen.js" defer></script>
//
// Why it is worth having: Android's system bars eat about a fifth of a
// phone screen, and a running timer is read at arm's length. Full screen
// needs a user gesture, which is exactly what a tap is, so it cannot be
// done for the user on load.
//
// Two guards, because the page has buttons and lists to scroll:
//
//   - a tap on anything you can operate is not a page tap, so a fast
//     double-press on START or a list row cannot flip the screen
//   - a tap that moved is a scroll, not a tap
//
// `touch-action: manipulation` is set here rather than in the page's CSS:
// it turns off the browser's own double-tap-to-zoom (so the gesture is
// ours) and drops the 300ms click delay with it.

const DOUBLE_MS = 300; // two taps closer than this are a double-tap
const MOVE_PX = 12; // farther than this and the finger was scrolling

for (const node of [document.documentElement, document.body]) {
  if (node) node.style.touchAction = 'manipulation';
}

/** Things a tap operates rather than lands on. */
const CONTROLS = 'a, button, input, select, textarea, label, [role=button]';

let last = 0;
/** @type {{x: number, y: number} | null} */
let from = null;

document.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.changedTouches[0];
    from = touch ? { x: touch.clientX, y: touch.clientY } : null;
  },
  { passive: true },
);

document.addEventListener(
  'touchend',
  (event) => {
    const touch = event.changedTouches[0];
    const target = event.target;
    const onControl = target instanceof Element && target.closest(CONTROLS) !== null;
    const moved = from && touch ? Math.hypot(touch.clientX - from.x, touch.clientY - from.y) > MOVE_PX : false;
    if (onControl || moved) {
      last = 0;
      return;
    }

    const now = Date.now();
    if (now - last < DOUBLE_MS) {
      last = 0;
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      last = now;
    }
  },
  { passive: true },
);
