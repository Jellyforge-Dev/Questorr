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
