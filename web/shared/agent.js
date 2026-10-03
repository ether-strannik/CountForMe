// The page's end of the agent channel: run what the agent sends, answer it.
//
// Served at /shared/agent.js for every board. A page opts in with one line:
//
//     <script src="/shared/agent.js" defer></script>
//
// and from then on the agent can hand it JavaScript and get the result
// back, instead of taking a screenshot of it and tapping at coordinates.
// tools/web/lib/agent.js says what the channel is; this is the half that
// lives in the page.
//
// WHAT A SNIPPET IS. The body of an async function, so `await` works and
// `return` is the answer. It runs with these in scope, which is most of
// what driving a page is:
//
//   $(sel)            first match, or null
//   $$(sel)           every match, as an array
//   text(sel)         its textContent, trimmed
//   visible(sel|el)   is it on screen -- use this, not offsetParent, which
//                     is null for anything position:fixed
//   rect(sel|el)      its box: {x, y, w, h}, in CSS px, plus the device
//                     pixels a tap would need
//   click(sel)        a real click on it
//   type(sel, str)    set a field's value and tell the page it changed
//   wait(ms)          a pause
//   until(fn, ms)     keep asking fn() until it is truthy, up to ms
//
// WHAT COMES BACK. Whatever the snippet returns, made plain: an element
// becomes {tag, id, text, rect}, a list of them a list of those, a
// DOMRect a box. Anything JSON cannot say is returned as its string. An
// exception is the answer too, with its message, rather than silence.
//
// THE PAGE'S OWN NAME is the first path segment -- "timer" for /timer/ --
// and it answers only what is addressed to it, or to "*".
//
// WHERE IT RUNS. A board on the 8080 server, and a page served by `dev`
// -- including inside a dev build of a portable app, which is where that
// app's real data is. `dev` proxies the stream and the endpoints on to
// the 8080 server and writes the page's name into the HTML, because
// served from there every app sits at `/` and has no name to read.
//
// In a real APK it does nothing at all: no server, no name, no channel.
// A portable app ships this file in its own shared/ beside the other two
// and it stays inert there.

(() => {
  // WHO THIS PAGE IS, asked in the two places it can be answered.
  //
  // On the 8080 server the name is the first path segment: /timer/ is
  // "timer". Served by `dev` every app sits at `/`, so there is nothing
  // to read -- and that is why the dev config writes the name into a
  // meta tag at serve time. Injected, never on disk.
  const told = document.querySelector('meta[name="agent-page"]')?.getAttribute('content')?.trim() ?? '';
  const page = told || location.pathname.split('/')[1] || '';

  // ONLY WHERE THE CHANNEL EXISTS. Inside an APK there is no server to
  // carry it: nothing injects a name, and the page is served at `/` so
  // the path says nothing either. A Capacitor bridge with no name told
  // to it is exactly that case, and the honest thing is to do nothing
  // rather than retry a stream that will never answer.
  //
  // A dev build is the other way round: the bridge is present AND the
  // page came from `dev`, which proxies the stream and the endpoints on
  // to the 8080 server. That one does have a channel, and being able to
  // drive it is the whole point -- a portable app's real data lives in
  // its dev build.
  if (!page) return;
  if (!told && /** @type {any} */ (globalThis).Capacitor) return;

  /** @param {string} path @param {unknown} data */
  const post = (path, data) =>
    fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});

  // ---- what a snippet can say --------------------------------------------

  /** @param {string} sel @returns {Element|null} */
  const $ = (sel) => document.querySelector(sel);
  /** @param {string} sel @returns {Element[]} */
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  /** @param {string|Element|null} what @returns {Element|null} */
  const el = (what) => (typeof what === 'string' ? $(what) : what);

  /** A box in CSS px, and the device px a tap on its centre would need.
   *  @param {string|Element|null} what */
  const rect = (what) => {
    const e = el(what);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      tap: { x: Math.round((r.x + r.width / 2) * dpr), y: Math.round((r.y + r.height / 2) * dpr) },
    };
  };

  /** @param {string|Element|null} what @returns {string} */
  const text = (what) => (el(what)?.textContent ?? '').trim();

  /** Is it actually on screen? NOT offsetParent: that is null for anything
   *  position:fixed, which is exactly where a page keeps its gear button.
   *  @param {string|Element|null} what @returns {boolean} */
  const visible = (what) => {
    const e = el(what);
    if (!e) return false;
    if (typeof e.checkVisibility === 'function') return e.checkVisibility();
    return e.getClientRects().length > 0;
  };

  /** @param {string|Element|null} what @returns {boolean} */
  const click = (what) => {
    const e = el(what);
    if (!(e instanceof HTMLElement)) return false;
    e.click();
    return true;
  };

  /** Set a field and say so, the way typing would.
   *  @param {string|Element|null} what @param {string} value @returns {boolean} */
  const type = (what, value) => {
    const e = el(what);
    if (!(e instanceof HTMLInputElement) && !(e instanceof HTMLTextAreaElement)) return false;
    e.focus();
    e.value = value;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  /** @param {number} ms */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** @param {() => unknown} fn @param {number} [ms] */
  const until = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`still false after ${ms} ms`);
      await wait(50);
    }
  };

  // ---- making an answer plain --------------------------------------------

  /** @param {unknown} v @param {number} depth @returns {unknown} */
  const plain = (v, depth = 0) => {
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return v;
    if (depth > 6) return String(v);
    if (v instanceof Element) {
      return {
        tag: v.tagName.toLowerCase(),
        id: v.id || undefined,
        text: (v.textContent ?? '').trim().slice(0, 200),
        rect: rect(v),
      };
    }
    if (v instanceof DOMRect) return { x: v.x, y: v.y, w: v.width, h: v.height };
    if (Array.isArray(v) || v instanceof NodeList || v instanceof HTMLCollection) {
      return [...v].map((x) => plain(x, depth + 1));
    }
    if (v instanceof Map) return plain([...v.entries()], depth + 1);
    if (v instanceof Set) return plain([...v], depth + 1);
    const out = /** @type {Record<string, unknown>} */ ({});
    for (const [k, x] of Object.entries(v)) out[k] = plain(x, depth + 1);
    try {
      JSON.stringify(out);
      return out;
    } catch {
      return String(v);
    }
  };

  // ---- the wire ----------------------------------------------------------

  const AsyncFunction = /** @type {any} */ (async () => {}).constructor;

  /** @param {string} js */
  const run = async (js) => {
    const fn = new AsyncFunction('$', '$$', 'text', 'visible', 'rect', 'click', 'type', 'wait', 'until', js);
    return await fn($, $$, text, visible, rect, click, type, wait, until);
  };

  /** @param {MessageEvent} e */
  const onAgent = async (e) => {
    /** @type {{ id: string, page: string, js: string }} */
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.page !== page && msg.page !== '*') return;

    try {
      const value = await run(msg.js);
      await post('/agent/api/result', { id: msg.id, ok: true, value: plain(value) });
    } catch (err) {
      const error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.trim() : String(err);
      await post('/agent/api/result', { id: msg.id, ok: false, error });
    }
  };

  // A STREAM THAT DIED WHILE THE PAGE WAS AWAY STAYS DEAD, QUIETLY. The
  // kiosk goes to the background, Android freezes it, and the socket under
  // the EventSource is gone by the time the page is back -- but nothing
  // says so. The server writes to /events only when there is news, so a
  // half-open stream and a healthy idle one look the same from here, and
  // EventSource reconnects only on an error it never gets. Measured: two
  // answers, then ten-second silences, with the page on screen and fine.
  //
  // So the stream is opened fresh every time the page comes back into
  // view. Closing the old one is what lets the server drop its end.

  /** @type {EventSource|null} */
  let events = null;

  const connect = () => {
    events?.close();
    events = new EventSource('/events');
    events.addEventListener('agent', (e) => void onAgent(/** @type {MessageEvent} */ (e)));
    post('/agent/api/hello', { page });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') connect();
  });
  window.addEventListener('pageshow', connect);
  connect();
})();
