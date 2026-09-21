// Undo the WebView's text inflation, so the page is laid out as designed
// whatever the phone's font scale is set to.
//
// The page opts in with one line:
//
//     <script src="/shared/textzoom.js" defer></script>
//
// THE PROBLEM. A WebView obeys Android's system font scale (Settings ->
// Display -> Font size) for web content: every font size is multiplied,
// boxes are not. Turn the scale up and the text outgrows the buttons and
// panes holding it, while a browser, which ignores the setting, shows the
// same page correctly. Raising that scale is an accessibility choice, and
// no app should ask the user to give it up to be usable.
//
// THE FIX. The inflation is measurable: at a scale of 1.3, a span with
// `font-size: 100px; line-height: 1` renders 130px tall while a box
// declared 100px stays 100px. Measure that ratio, then divide every px
// font size in the page's own stylesheets by it. Text lands where it was
// designed; boxes, targets and paddings never move, because they were
// never touched.
//
// It does nothing where there was no inflation — the ratio is 1, and the
// script returns before changing a rule.

const EPSILON = 0.02; // below this the ratio is noise, not inflation

/** How much bigger than declared this engine renders text.
 *  @returns {number} */
function inflation() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;' +
    'font-size:100px;line-height:1;margin:0;padding:0;border:0;';
  probe.textContent = 'M';
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height > 0 ? height / 100 : 1;
}

/** Divide one rule's font size, and recurse into the grouping rules that
 *  hold more of them (@media is the one this page uses).
 *  @param {CSSRule} rule @param {number} by */
function shrink(rule, by) {
  const style = /** @type {CSSStyleRule} */ (rule).style;
  if (style && style.fontSize && style.fontSize.endsWith('px')) {
    const px = parseFloat(style.fontSize);
    if (px > 0) style.fontSize = `${px / by}px`;
  }
  const inner = /** @type {CSSGroupingRule} */ (rule).cssRules;
  if (inner) for (const child of inner) shrink(child, by);
}

const by = inflation();
if (by > 1 + EPSILON) {
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules; // a cross-origin sheet throws; we have none
    } catch {
      continue;
    }
    for (const rule of rules) shrink(rule, by);
  }
}
