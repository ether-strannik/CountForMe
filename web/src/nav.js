// Android back closes what is open. A screen that opens over the page
// pushes one history entry; the system back pops it, and popstate closes
// the screen. Closing from code goes the same way — through history — so
// there is one path out and the stack never drifts from what is shown.

/** @type {{ id: string, close: () => void }[]} */
const stack = [];

/** show something over the page: `close` runs when back pops it */
export function openScreen(id, close) {
  stack.push({ id, close });
  history.pushState({ depth: stack.length }, '');
}

/** close from code: pops history back to below this screen */
export function closeScreen(id) {
  const i = stack.findIndex((s) => s.id === id);
  if (i >= 0) history.go(i - stack.length);
}

window.addEventListener('popstate', () => {
  const depth = (history.state && history.state.depth) || 0;
  while (stack.length > depth) stack.pop().close();
});
