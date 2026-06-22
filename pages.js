/* ============================================================
   Hexera — shared page interactions for the inner pages.
   Everything here is feature-detected: a block only runs if its
   markup exists, so one file safely serves every page.
     · sticky nav state + mobile drawer
     · zoo-style sticky feature scroller (pin left, swap right)
     · orbital process ring (scroll-driven marker + phases + tabs)
     · scroll count-up for [data-count]
     · typed terminal for [data-term]
   Reveal animations + the contact form live in site.js.
   ============================================================ */
(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- smooth (inertia) scrolling via Lenis ----------
     Lenis still drives the real window scroll, so every scroll-linked
     set-piece (airfoil mesh, ring, sticky feature) keeps working — it
     just feels eased instead of 1:1 with the wheel. Off for reduced motion. */
  if (window.Lenis && !reduce) {
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, touchMultiplier: 1.6 });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    window.__lenis = lenis;
    // keep in-page anchor jumps smooth through Lenis
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (target) { e.preventDefault(); lenis.scrollTo(target, { offset: -80 }); }
    });
  }

  /* ---------- nav: stuck state + mobile drawer ---------- */
  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const toggle = nav.querySelector(".nav__toggle");
    if (toggle) {
      toggle.addEventListener("click", () => nav.classList.toggle("is-open"));
      nav.querySelectorAll(".nav__links a").forEach((a) =>
        a.addEventListener("click", () => nav.classList.remove("is-open"))
      );
    }
  }

  /* ---------- back-to-top (smooth via Lenis when present) ---------- */
  document.querySelectorAll("[data-totop]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.1 });
      else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    })
  );

  /* ---------- parallax fade: opacity + gentle drift tied to scroll ----------
     The element peaks (opacity 1, no offset) at viewport centre and fades +
     drifts away as it leaves — a calm, brutalist transition. */
  const pfade = Array.from(document.querySelectorAll("[data-parallax-fade]"));
  if (pfade.length) {
    if (reduce) {
      pfade.forEach((el) => { el.style.opacity = "1"; });
    } else {
      const upd = () => {
        const vh = window.innerHeight;
        pfade.forEach((el) => {
          const r = el.getBoundingClientRect();
          const n = (r.top + r.height / 2 - vh / 2) / (vh * 0.6); // 0 at centre
          el.style.opacity = clamp(1 - Math.abs(n), 0, 1).toFixed(3);
          el.style.transform = "translateY(" + (n * 42).toFixed(1) + "px)";
        });
      };
      window.addEventListener("scroll", upd, { passive: true });
      window.addEventListener("resize", upd);
      upd();
    }
  }

  /* ---------- zoo-style sticky feature: pin left, swap right ----------
     Each .sf-panel has data-sf="N"; the matching .sf-item[data-sf="N"]
     in the pinned column lights up while that panel owns the viewport. */
  const sfItems = Array.from(document.querySelectorAll(".sf-item"));
  const sfPanels = Array.from(document.querySelectorAll(".sf-panel"));
  if (sfItems.length && sfPanels.length) {
    const setActive = (idx) => sfItems.forEach((it) =>
      it.classList.toggle("active", it.dataset.sf === String(idx)));
    setActive(sfPanels[0].dataset.sf);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.dataset.sf); });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    sfPanels.forEach((p) => io.observe(p));
  }

  /* ---------- orbital process ring ----------
     The section is tall (≈360vh) with a sticky stage. Scroll progress
     drives a marker around the ring; four phases drive the copy, the
     active node, and the tab bar. */
  const ring = document.querySelector(".ring-sec");
  if (ring) {
    const svgMarker = ring.querySelector(".ring-marker");
    const prog = ring.querySelector(".ring-prog");
    const nodes = Array.from(ring.querySelectorAll(".ring-node"));
    const nodeLabels = Array.from(ring.querySelectorAll(".ring-node-label"));
    const phaseItems = Array.from(ring.querySelectorAll(".ring-phase__item"));
    const tabs = Array.from(ring.querySelectorAll(".ring-tab"));
    const N = phaseItems.length || 4;

    const CX = 200, CY = 200, R = 150;
    const CIRC = 2 * Math.PI * R;
    if (prog) { prog.style.strokeDasharray = CIRC; prog.style.strokeDashoffset = CIRC; }

    const setPhase = (idx) => {
      phaseItems.forEach((el, i) => el.classList.toggle("active", i === idx));
      tabs.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodes.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodeLabels.forEach((el, i) => el.classList.toggle("active", i === idx));
    };

    const update = () => {
      const rect = ring.getBoundingClientRect();
      const scrollable = ring.offsetHeight - window.innerHeight;
      const p = clamp(-rect.top / Math.max(scrollable, 1), 0, 1);
      // marker travels the full circle starting at the top (-90°)
      const ang = (-90 + p * 360) * (Math.PI / 180);
      if (svgMarker) {
        svgMarker.setAttribute("cx", CX + R * Math.cos(ang));
        svgMarker.setAttribute("cy", CY + R * Math.sin(ang));
      }
      if (prog) prog.style.strokeDashoffset = CIRC * (1 - p);
      const idx = clamp(Math.floor(p * N - 1e-6), 0, N - 1);
      setPhase(idx);
    };
    setPhase(0);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- home industries datasheet: mark the row nearest viewport centre ----------
     A quiet "reading marker" travels the rows as you scroll; hovering a row
     marks it directly (CSS handles the hover visuals). */
  const dsheet = document.querySelector(".dsheet");
  if (dsheet) {
    const rows = Array.from(dsheet.querySelectorAll(".dsheet__row"));
    const setActive = (idx) => rows.forEach((r, i) => r.classList.toggle("is-active", i === idx));
    const update = () => {
      const mid = window.innerHeight / 2;
      let best = 0, bestD = Infinity;
      rows.forEach((r, i) => {
        const b = r.getBoundingClientRect();
        const d = Math.abs(b.top + b.height / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      setActive(best);
    };
    setActive(0);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    rows.forEach((r, i) => r.addEventListener("mouseenter", () => setActive(i)));
  }

  /* ---------- count-up for [data-count] (fires once when seen) ---------- */
  const counters = Array.from(document.querySelectorAll("[data-count]"));
  if (counters.length) {
    const run = (el) => {
      const end = parseFloat(el.dataset.count);
      const dur = 1100, dec = (el.dataset.dec ? +el.dataset.dec : 0), t0 = performance.now();
      const suffix = el.dataset.suffix || "";
      if (reduce) { el.textContent = end.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix; return; }
      const tick = (t) => {
        const k = Math.min((t - t0) / dur, 1);
        const v = end * (1 - Math.pow(1 - k, 3));
        el.textContent = v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach((c) => io.observe(c));
  }

  /* ---------- typed terminal for [data-term] ---------- */
  const term = document.querySelector("[data-term]");
  if (term) {
    const script = [
      { t: "$ hexera run --geometry wing_v7.step --intent \"external aero, M0.85\"", c: "pr" },
      { t: "→ reading geometry … 1 solid, 2,114 faces, 18 trailing edges", c: "dim" },
      { t: "✓ defactored CAD · healed 6 sliver faces", c: "ok" },
      { t: "→ translating intent → boundary layer y+ ≈ 1, prism stack ×24", c: "dim" },
      { t: "→ writing mesh script · running · inspecting", c: "dim" },
      { t: "⚠ skewness 0.81 on TE — refining locally", c: "warn" },
      { t: "✓ mesh passed: 8.4M cells · max skew 0.62 · orthogonality 0.94", c: "ok" },
      { t: "✓ exported wing_v7.msh · openfoam-ready · 4h12m saved", c: "ok" },
    ];
    let started = false;
    const type = () => {
      let li = 0;
      const cursor = document.createElement("span"); cursor.className = "term__cursor";
      const next = () => {
        if (li >= script.length) { term.appendChild(cursor); return; }
        const line = document.createElement("div");
        line.className = "term__line";
        term.appendChild(line); term.appendChild(cursor);
        const { t, c } = script[li];
        if (reduce) { line.innerHTML = `<span class="${c}">${t}</span>`; li++; setTimeout(next, 0); return; }
        let ci = 0;
        const tick = () => {
          ci += 2;
          line.innerHTML = `<span class="${c}">${t.slice(0, ci)}</span>`;
          term.appendChild(cursor);
          if (ci < t.length) setTimeout(tick, 12);
          else { li++; setTimeout(next, 320); }
        };
        tick();
      };
      next();
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && !started) { started = true; type(); io.disconnect(); } });
    }, { threshold: 0.4 });
    io.observe(term);
  }
})();
