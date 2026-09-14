/*
 * Theme bootstrap + toggle. External (not inline) because the CSP
 * scriptSrc only allows 'self' — inline scripts are blocked.
 * Loaded synchronously in <head> so the saved theme applies before paint.
 */
(function () {
  "use strict";

  // Apply saved theme before paint to avoid a flash. Default: dark.
  try {
    var saved = localStorage.getItem("questorr-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }

  function wire() {
    var root = document.documentElement;
    var btn = document.getElementById("theme-toggle");
    function syncIcon() {
      if (!btn) return;
      var isLight = root.getAttribute("data-theme") === "light";
      var i = btn.querySelector("i");
      if (i) i.className = "bi nav-icon " + (isLight ? "bi-moon-stars" : "bi-sun");
      btn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    }
    syncIcon();
    if (btn) {
      btn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("questorr-theme", next); } catch (e) {}
        syncIcon();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
