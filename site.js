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

  /* request-access form — validates and confirms locally; sends nothing */
  const form = document.querySelector("[data-access-form]");
  if (form) {
    const note = document.querySelector("[data-access-note]");
    const input = form.querySelector('input[type="email"]');
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (input.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
        note.textContent = "Please enter a valid work email.";
        note.dataset.state = "err";
        input.focus();
        return;
      }
      note.textContent = "You're on the list — we'll be in touch shortly.";
      note.dataset.state = "ok";
      form.reset();
      input.disabled = true;
      const btn = form.querySelector("button");
      if (btn) btn.disabled = true;
    });
  }
})();
