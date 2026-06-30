/*
 * Questorr dashboard motion layer (GSAP + ScrollTrigger, vanilla).
 *
 * Design constraints:
 *  - Config forms are NOT scroll-animated (daily-use tool).
 *  - Every reveal uses gsap.from, so if GSAP fails to load or the user
 *    prefers reduced motion, content stays fully visible (nothing is
 *    hidden by CSS that only JS reverses).
 *  - Scroll accents are limited to the hero + About (read-once areas).
 */
(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce || typeof window.gsap === "undefined") return;

  var gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  var ST = window.ScrollTrigger;

  gsap.defaults({ ease: "power2.out" });

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function all(sel, ctx) {
    return gsap.utils.toArray(sel, ctx || document);
  }

  // Debounced ScrollTrigger refresh — layout changes a lot in this SPA
  // (login → dashboard, section toggles).
  var refreshTimer = null;
  function scheduleRefresh() {
    if (!ST) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      ST.refresh();
    }, 120);
  }

  // ── 1. Login entrance ───────────────────────────────────────────────
  // script.js reveals the auth card only after an async auth check. Playing
  // at DOMContentLoaded races that and looks half-done, so we wait until the
  // card is actually visible, THEN run a full fade+slide timeline. Everything
  // uses clearProps + a failsafe so the login UI can never stay hidden.
  function playLoginIntro() {
    var card = $(".auth-container");
    if (!card) return;
    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if ($(".auth-logo")) tl.from(".auth-logo", { y: -30, autoAlpha: 0, duration: 0.55, clearProps: "all" });
    if ($(".hero-title")) tl.from(".hero-title", { y: 26, autoAlpha: 0, duration: 0.55, clearProps: "all" }, "-=0.25");
    if ($(".hero-subtitle")) tl.from(".hero-subtitle", { y: 18, autoAlpha: 0, duration: 0.5, clearProps: "all" }, "-=0.30");
    tl.from(card, { y: 36, autoAlpha: 0, duration: 0.6, clearProps: "all" }, "-=0.25");
    var fields = all(".auth-form:not([style*='display: none']) .form-group, .auth-switch, .language-selector-auth");
    if (fields.length) tl.from(fields, { y: 16, autoAlpha: 0, duration: 0.4, stagger: 0.07, clearProps: "all" }, "-=0.2");

    // Failsafe: never leave login UI hidden.
    gsap.delayedCall(2.8, function () {
      var el = document.querySelectorAll(
        ".auth-logo, .auth-container, .hero-title, .hero-subtitle, .auth-form .form-group, .auth-switch, .language-selector-auth"
      );
      if (el.length) gsap.set(el, { clearProps: "opacity,visibility" });
    });
  }

  function loginIntro() {
    if (!document.body.classList.contains("auth-mode")) return;
    var card = $(".auth-container");
    if (!card) return;
    function visible() {
      var cs = getComputedStyle(card);
      return cs.display !== "none" && cs.visibility !== "hidden";
    }
    if (visible()) { playLoginIntro(); return; }
    if (window.MutationObserver) {
      var played = false;
      var mo = new MutationObserver(function () {
        if (!played && visible()) {
          played = true;
          mo.disconnect();
          playLoginIntro();
        }
      });
      mo.observe(card, { attributes: true, attributeFilter: ["style", "class"] });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      setTimeout(function () {
        if (!played) { played = true; mo.disconnect(); playLoginIntro(); }
      }, 1500);
    } else {
      setTimeout(playLoginIntro, 400);
    }
  }

  // ── 2. Config pane fade on tab switch (NOT scroll-driven) ───────────
  function paneSwitchFade() {
    var nav = $(".dashboard-nav");
    if (!nav) return;
    nav.addEventListener("click", function (e) {
      if (!e.target.closest(".nav-item")) return;
      // Let the app swap .active first, then animate the now-visible pane.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var pane = $(".config-pane.active");
          if (!pane) return;
          gsap.from(pane, { y: 14, autoAlpha: 0, duration: 0.4, clearProps: "opacity,visibility,transform" });
          var cards = all(".stats-card, .about-card", pane);
          if (cards.length) {
            gsap.from(cards, {
              y: 18,
              autoAlpha: 0,
              duration: 0.45,
              stagger: 0.06,
              delay: 0.05,
              clearProps: "opacity,visibility,transform",
            });
          }
        });
      });
    });
  }

  // ── 3. About: scroll accents (parallax + scrub reveals) ─────────────
  function aboutScroll() {
    if (!ST) return;
    var about = $("#about");
    if (!about) return;

    // Decorative parallax on the section heading (no opacity → can't hide text).
    var heading = $("#about h2, .features-title", about);
    if (heading) {
      gsap.to(heading, {
        yPercent: -18,
        ease: "none",
        scrollTrigger: { trigger: about, start: "top bottom", end: "top top", scrub: 0.5 },
      });
    }

    // Scrub-linked reveals for cards (About is non-critical, read-once content).
    all(".about-card", about).forEach(function (card) {
      gsap.from(card, {
        y: 48,
        autoAlpha: 0,
        ease: "power2.out",
        scrollTrigger: { trigger: card, start: "top 88%", end: "top 60%", scrub: 0.6 },
      });
    });

    // Feature list items: light staggered one-shot reveal.
    var items = all(".features-list li", about);
    if (items.length) {
      gsap.from(items, {
        y: 24,
        autoAlpha: 0,
        duration: 0.5,
        stagger: 0.05,
        scrollTrigger: { trigger: ".features-list", start: "top 85%", once: true },
      });
    }
  }

  // ── 4. Dashboard entrance (once, when it first becomes visible) ─────
  function watchDashboard() {
    var dash = document.getElementById("dashboard-content");
    if (!dash) return;
    var played = false;
    function maybePlay() {
      if (played) return;
      if (getComputedStyle(dash).display === "none") return;
      played = true;
      var targets = [".dashboard-header", ".dashboard-sidebar", ".config-pane.active"].filter($);
      if (targets.length) {
        gsap.from(targets, {
          y: 20,
          autoAlpha: 0,
          duration: 0.5,
          stagger: 0.08,
          clearProps: "opacity,visibility,transform",
        });
      }
      scheduleRefresh();
    }
    maybePlay();
    if (window.MutationObserver) {
      var mo = new MutationObserver(maybePlay);
      mo.observe(dash, { attributes: true, attributeFilter: ["style", "class"] });
    }
  }

  // ── Wire up ─────────────────────────────────────────────────────────
  function init() {
    loginIntro();
    paneSwitchFade();
    aboutScroll();
    watchDashboard();

    // Refresh after top-level section changes (heights shift).
    document.addEventListener("click", function (e) {
      if (e.target.closest(".about-link, .about-button, #logout-btn, .logs-tab-btn, .nav-item")) {
        scheduleRefresh();
      }
    });
    window.addEventListener("load", scheduleRefresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
