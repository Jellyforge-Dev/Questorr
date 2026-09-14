/*
 * Small, isolated UI feedback. Additive only — no changes to the core
 * save flow in script.js. Shows a loading spinner on the Save button(s)
 * while a config save is in flight, cleared when a toast appears
 * (the save flow always toasts) or after a safety timeout.
 */
(function () {
  "use strict";

  var form = document.getElementById("config-form");
  if (!form) return;

  function saveButtons() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.btn[type="submit"][form="config-form"]')
    );
  }

  form.addEventListener("submit", function () {
    var btns = saveButtons();
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.classList.add("is-loading");
    });

    var done = false;
    var obs = null;
    function clear() {
      if (done) return;
      done = true;
      if (obs) obs.disconnect();
      btns.forEach(function (b) {
        b.classList.remove("is-loading");
      });
    }

    // Clear when the save flow surfaces a toast.
    if (window.MutationObserver) {
      obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (
              (n.classList && n.classList.contains("toast")) ||
              (n.querySelector && n.querySelector(".toast"))
            ) {
              clear();
              return;
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }

    // Safety net: never leave the button spinning.
    setTimeout(clear, 6000);
  });
})();

/*
 * Count-up on the stats summary numbers. Additive: observes the existing
 * number nodes (known IDs) and animates 0 → value when the app updates them.
 * Honors reduced motion. A guard flag prevents the observer from reacting
 * to its own intermediate writes.
 */
(function () {
  "use strict";
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  if (!window.MutationObserver) return;

  var ids = [
    "stats-total-commands",
    "stats-total-users",
    "stats-pending",
    "stats-cache-rate",
  ];

  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;

    function run() {
      var raw = el.textContent.trim();
      if (el.__animating || raw === el.__target) return;
      var m = raw.match(/^(-?\d[\d.,]*)\s*(%?)$/);
      if (!m) return;
      var target = parseFloat(m[1].replace(/,/g, ""));
      if (isNaN(target)) return;

      var suffix = m[2] || "";
      var from = el.__lastVal || 0;
      el.__animating = true;
      el.__target = raw;
      var dur = 700;
      var start = performance.now();

      function tick(now) {
        var p = Math.min(1, (now - start) / dur);
        var val = Math.round(from + (target - from) * p);
        el.textContent = (suffix ? val : val.toLocaleString()) + suffix;
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          el.textContent = raw; // snap to the app's exact formatting
          el.__lastVal = target;
          el.__animating = false;
        }
      }
      requestAnimationFrame(tick);
    }

    new MutationObserver(run).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    run();
  });
})();
