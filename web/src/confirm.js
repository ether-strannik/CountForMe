// Universal confirm dialog — reused for every delete. Android back,
// Cancel and the backdrop all close it through nav.js.
import { $ } from './dom.js';
import { openScreen, closeScreen } from './nav.js';

let confirmCb = null;
export function askConfirm(msg, onYes) {
  confirmCb = onYes;
  $('confirmMsg').textContent = msg;
  $('confirm').hidden = false;
  openScreen('confirm', () => {
    $('confirm').hidden = true;
    confirmCb = null;
  });
}
const closeConfirm = () => closeScreen('confirm');
$('confirmNo').addEventListener('click', closeConfirm);
$('confirm').addEventListener('click', (e) => {
  if (e.target === $('confirm')) closeConfirm();
});
$('confirmYes').addEventListener('click', () => {
  const cb = confirmCb;
  closeConfirm();
  if (cb) cb();
});
