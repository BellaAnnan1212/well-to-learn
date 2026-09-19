/* Well to Learn · site.js · the C2 motion, and the phone menu. No dependency, no third-party call.
   Nothing here is needed to read the page: with scripting off every band, row and answer is already
   visible, because the hidden start states live behind html.js, which only the inline head gate adds.
   Durations are read from the tokens, so CSS stays the one place a timing is written. */
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
      toggle.textContent = open ? 'Menu' : 'Close';
    });
  }
  if (!root.classList.contains('js')) { return; } /* no motion asked for: nothing was ever hidden */

  var els = [].slice.call(document.querySelectorAll('[data-rv]'));
  var queue = [], calling = false, reported = false, io = null, css = getComputedStyle(root);
  function ms(name, fallback) { return parseInt(css.getPropertyValue(name), 10) || fallback; }

  /* the roll is called in order, one answer every --wtl-step-roll */
  function callNext() {
    var row = queue.shift();
    while (row && row.classList.contains('called')) { row = queue.shift(); }
    if (!row) { calling = false; return; }
    calling = true;
    row.classList.add('called');
    setTimeout(callNext, ms('--wtl-step-roll', 450));
  }
  /* now = revealed by the keyboard or by the safety timer: instant, no transition */
  function show(el, now) {
    if (io) { io.unobserve(el); }
    if (now) { el.classList.add('now', 'called'); }
    if (el.classList.contains('in')) { return; }
    el.classList.add('in');
    if (!now && el.matches('.roll, .state')) {
      queue.push(el);
      if (!calling) { callNext(); }
    }
  }
  function showAll() { els.forEach(function (el) { show(el, true); }); }

  /* a keyboard reader never waits: focus inside a group reveals it at once */
  document.addEventListener('focusin', function (e) {
    var group = e.target.closest ? e.target.closest('[data-rv]') : null;
    if (group) { show(group, true); }
  });
  /* the observer wakes after the hero has landed, so a row already on screen closes the load
     sequence instead of competing with it */
  setTimeout(function () {
    try {
      io = new IntersectionObserver(function (entries) {
        reported = true;
        entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); } });
      });
      els.forEach(function (el) { io.observe(el); });
    } catch (err) { showAll(); } /* no observer, or one that throws: everything shows */
  }, ms('--wtl-wait-observe', 900));
  /* safety at 2500ms, whatever the observer does: a silent one reveals everything, a working one
     still reveals whatever is on screen or above it. A very tall viewport is a capture, not a reader */
  setTimeout(function () {
    if (!reported || window.innerHeight > 2000) { showAll(); return; }
    els.forEach(function (el) {
      if (!el.classList.contains('in') && el.getBoundingClientRect().top < window.innerHeight) { show(el, true); }
    });
  }, 2500);
})();
