// Digit pads. makePad builds the 1-9 / 00 / 0 / ⌫ buttons into an element
// and keeps the typed digits; the display shows them as pairs. The mm:ss
// modal below uses one with 4 digits, the timer sheet one with 6.
import { $ } from './dom.js';
import { openScreen, closeScreen } from './nav.js';

/**
 * @param {HTMLElement} padEl      where the buttons go
 * @param {HTMLElement} displayEl  shows the digits as 00:00 or 00:00:00
 * @param {number} n               digits kept: 4 (mm:ss) or 6 (h:mm:ss)
 */
export function makePad(padEl, displayEl, n) {
  let digits = '';
  const pairs = () => digits.padStart(n, '0').slice(-n).match(/../g);
  const render = () => {
    displayEl.textContent = pairs().join(':');
  };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'].forEach((v) => {
    const b = document.createElement('button');
    b.textContent = v === 'del' ? '⌫' : v;
    b.addEventListener('click', () => {
      if (v === 'del') digits = digits.slice(0, -1);
      else {
        const nd = (digits + v).replace(/^0+/, '');
        if (nd.length <= n) digits = nd;
      }
      render();
    });
    padEl.appendChild(b);
  });
  return {
    /** the seconds the display shows */
    sec: () => pairs().reduce((a, p) => a * 60 + +p, 0),
    /** replace the digits ("" clears) and redraw */
    set(d) {
      digits = d;
      render();
    },
  };
}

// ---- reusable mm:ss modal: opens empty, hands the caller seconds on Set.
// Android back or the backdrop closes it (nav.js); Set closes the same way.
const kp = makePad($('kpPad'), $('kpDisplay'), 4);
let kpCb = null;
export function openKeypad(title, sec, cb) {
  kpCb = cb;
  $('kpTitle').textContent = title;
  kp.set(''); // start empty — type a fresh value, no appending
  $('kp').hidden = false;
  openScreen('kp', () => ($('kp').hidden = true));
}
$('kp').addEventListener('click', (e) => {
  if (e.target === $('kp')) closeScreen('kp');
});
$('kpSave').addEventListener('click', () => {
  const cb = kpCb;
  closeScreen('kp');
  if (cb) cb(kp.sec());
});
