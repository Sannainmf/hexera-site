/* ============================================================
   Hexera — site interactions: smooth in-page nav, footer year,
   additive scroll-reveal (content is visible without JS), and the
   client-side request-access form (no data leaves the page).
   ============================================================ */
(() => {
  "use strict";
  const root = document.documentElement;
  root.classList.add("js");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* smooth scroll for in-page anchors */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute("href");
    if (href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  /* footer year */
  const yr = document.querySelector("[data-year]");
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* footer live clock — ticking UTC, the console's heartbeat */
  const clock = document.querySelector("[data-clock]");
  if (clock) {
    const p = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      clock.textContent = p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " UTC";
    };
    tick();
    setInterval(tick, 1000);
  }

  /* scroll reveal — additive only; if anything fails, content still shows */
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  const showAll = () => reveals.forEach((el) => el.classList.add("in"));
  if (reduce || !("IntersectionObserver" in window)) {
    showAll();
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
    // safety net: never leave a section hidden (e.g. background/headless tabs)
    window.addEventListener("load", () => setTimeout(showAll, 800));
    setTimeout(showAll, 3000);
  }

  /* request-access forms are handled by waitlist.js (Supabase capture) */
})();
