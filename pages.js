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
    const phaseItems = Array.from(ring.querySelectorAll(".ring-label"));
    const tabs = Array.from(ring.querySelectorAll(".ring-tab"));
    const N = phaseItems.length || 4;
    const centerWord = ring.querySelector("[data-ring-word]");
    const centerCount = ring.querySelector("[data-ring-count]");
    const logLines = Array.from(ring.querySelectorAll(".ring-log__ln"));
    const phaseNames = phaseItems.map((el) => (el.querySelector("[data-phase-name]") || el).textContent.trim());

    const CX = 200, CY = 200, R = 150;
    const CIRC = 2 * Math.PI * R;
    if (prog) { prog.style.strokeDasharray = CIRC; prog.style.strokeDashoffset = CIRC; }

    const setPhase = (idx) => {
      phaseItems.forEach((el, i) => el.classList.toggle("active", i === idx));
      tabs.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodes.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodeLabels.forEach((el, i) => el.classList.toggle("active", i === idx));
      logLines.forEach((el, i) => el.classList.toggle("on", i === idx));
      if (centerWord && phaseNames[idx]) centerWord.textContent = phaseNames[idx];
      if (centerCount) centerCount.textContent = String(idx + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
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

  /* ---------- "Our ambition": scroll the ghosted list through the centre line ----------
     The tall section pins; scroll progress slides the giant list upward and the
     item crossing the centre line lights up. Scroll-driven (no rAF needed). */
  const amb = document.querySelector(".amb");
  if (amb) {
    const stage = amb.querySelector(".amb__stage");
    const list = amb.querySelector(".amb__list");
    let ambPad = 0, loopH = 0, listD = 0, lastScr = null;
    const measure = () => {
      ambPad = parseFloat(getComputedStyle(list).paddingLeft) || 0;
      loopH = list.scrollHeight / 2;   // list is two identical sets of 30 — one set is the seamless loop period
    };
    measure();
    const update = () => {
      const rect = amb.getBoundingClientRect();
      const vh = window.innerHeight;
      // UNCOVER: the stage is fixed in the viewport; clip it to the slice of the
      // section currently on screen. As the edge rises it "uncovers" the fixed
      // content (line + labels appear once it passes their position), and as the
      // section leaves the bottom it covers back up.
      const topCut = clamp(rect.top, 0, vh);
      const botCut = vh - clamp(rect.bottom, 0, vh);
      stage.style.clipPath = "inset(" + topCut.toFixed(1) + "px 0 " + botCut.toFixed(1) + "px 0)";
      // REVEAL: zoom-out, fade-in and centre-drift complete over the first ~1.3
      // viewports (entry + a touch), then hold while the list keeps scrolling.
      const scrolled = Math.max(vh - rect.top, 0);
      // ZOOM + CENTRE-DRIFT both run on WHOLE-SECTION progress, in step with each
      // other, so they ramp the entire way down — never finishing up front.
      const pFull = clamp(scrolled / amb.offsetHeight, 0, 1);
      const zStart = 3.0, zEnd = 0.56;
      // geometric (constant-ratio) zoom so the shrink reads as EVEN from the very first
      // scroll, instead of a linear ramp that looks like little happens early then
      // lurches mid-way once the scale gets small.
      const zoom = zStart * Math.pow(zEnd / zStart, pFull);
      const centerShift = pFull * Math.max(window.innerWidth * 0.5 - ambPad, 0) * 0.5;
      // INFINITE LOOP, zoom-compensated: the translate is scaled by the zoom,
      // so a fixed model-space rate dies visually as the list shrinks (5x
      // slower by the end — read as "stopped"). Integrate travel with a rate
      // divided by the current zoom instead: on-screen speed starts fast
      // (~2.2px per scroll px) and tapers gently to ~1.1, never stalling.
      // Wraps at one set height either direction, so the loop stays seamless.
      if (lastScr === null) lastScr = scrolled;
      /* geometric decay: decelerates continuously with the zoom-out and
         ends significantly slower — ~16% of the starting speed */
      const screenRate = 2.2 * Math.pow(0.16, pFull);
      listD += (scrolled - lastScr) * (screenRate / Math.max(zoom, 0.2));
      lastScr = scrolled;
      const ty = loopH > 0 ? (((listD % loopH) + loopH) % loopH) - loopH : 0;
      // fade in early (invisible -> visible) so the text is readable while it keeps zooming.
      const fadeP = clamp(scrolled / (vh * 2), 0, 1);
      list.style.transform = "translateX(" + centerShift.toFixed(1) + "px) scale(" + zoom.toFixed(3) + ") translateY(" + ty.toFixed(1) + "px)";
      list.style.opacity = clamp(fadeP / 0.8, 0, 1).toFixed(3);   // invisible → visible, gradual
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", () => { measure(); update(); });
    update();
  }

  /* ---------- "Inside the pipeline": subtle parallax drift on the heading ---------- */
  const bizHead = document.querySelector("[data-biz-head]");
  if (bizHead && !reduce) {
    const sec = bizHead.closest(".biz");
    const upd = () => {
      const r = sec.getBoundingClientRect();
      const t = clamp((window.innerHeight - r.top) / (window.innerHeight + r.height), 0, 1);
      bizHead.style.transform = "translateY(" + ((t - 0.5) * 48).toFixed(1) + "px)";
    };
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  /* ---------- Industries: scroll-linked parallax rise ----------
     Each row's two cells rise from below and fade in as the row moves up through
     the viewport, at slightly different rates (parallax). Scroll-driven (not the
     reveal timeout), so it always plays when you reach it, however far down. */
  const riseEls = Array.from(document.querySelectorAll("[data-ind-rows] [data-rise]"));
  if (riseEls.length && !reduce) {
    const updInd = () => {
      const vh = window.innerHeight;
      riseEls.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        // 0 when the cell's top sits at the bottom of the viewport, 1 once it has risen ~half up
        const p = clamp((vh - r.top) / (vh * 0.5), 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const slack = 1 - eased;
        const depth = (i % 2 === 0) ? 64 : 100;   // alternate -> subtle parallax across the pair
        el.style.transform = "translate3d(0," + (slack * depth).toFixed(1) + "px,0)";
        el.style.opacity = (0.05 + eased * 0.95).toFixed(3);
      });
    };
    updInd();
    window.addEventListener("scroll", updInd, { passive: true });
    window.addEventListener("resize", updInd);
  }

  /* ---------- Industries: four workbenches ----------
     Four real 3D wireframe models pinned in one full-viewport stage,
     each CAD'd procedurally: a lofted swept wing, a deployed coronary
     stent, a low-poly terrain tile, and a vented brake rotor. Each
     phase dresses the stage as that discipline's software viewport
     (CFD tunnel, hemodynamics, DCC grid, FEA thermal); scroll
     crossfades one environment into the next. */
  const spec = document.querySelector("[data-spec]");
  if (spec) {
    const canvas = spec.querySelector("[data-spec-canvas]");
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    const envs = Array.from(spec.querySelectorAll("[data-spec-env]"));
    const stage = spec.querySelector(".spec__sticky");
    const railStops = Array.from(spec.querySelectorAll("[data-spec-go]"));
    const cssRGB = (name, fallback) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v) ? v.replace(/\s+/g, "") : fallback;
    };
    const GOLD = cssRGB("--mesh-accent-rgb", "255,186,0");
    const TEAL = cssRGB("--mesh-line-rgb", "15,182,172");
    const INK = cssRGB("--mesh-ink-rgb", "236,234,229");
    const LINE3 = TEAL.split(",").map(Number), ACC3 = GOLD.split(",").map(Number);
    const sstep = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * k * (k * (k * 6 - 15) + 10));
    const MW = 0.16;                                 // blend window, in total-scroll units

    /* ================= real 3D specimens =================
       Every specimen is a genuine 3D wireframe model, CAD'd procedurally in
       unit space: grouped polylines (gold skin / teal mesh), optional
       per-vertex polar coords for the rotor's thermal field, optional
       per-vertex altitude for terrain shading. The scan gate no longer
       deforms outlines — it wipes one finished mesh into the next. */

    const yt12 = (t) => 5 * 0.12 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);

    // 01 · wind-tunnel launch vehicle — a scale sounding rocket, nose into
    //      the flow: revolved surface mesh with nose-clustered stations,
    //      four swept fin lattices, and Mach-cone shock lines flaring off
    //      the tip. The supersonic tunnel classic.
    const buildWing = () => {
      const L0 = -1.05, LEN = 2.0, RB = 0.155, NS = 40, NA = 20;
      const prof = (t) => {
        if (t < 0.30) return RB * Math.pow(Math.sin((Math.PI / 2) * (t / 0.30)), 0.85);
        if (t > 0.94) return RB * (1 - 0.35 * ((t - 0.94) / 0.06));
        return RB;
      };
      const secs = [];
      for (let i = 0; i < NS; i++) {
        const t = Math.pow(i / (NS - 1), 1.30);        // cluster stations at the nose
        const x = L0 + LEN * t;
        const r = Math.max(prof(t), 0.004);
        const ring = [];
        for (let k = 0; k <= NA; k++) {
          const a2 = (k / NA) * Math.PI * 2;
          ring.push([x, r * Math.cos(a2), r * Math.sin(a2)]);
        }
        secs.push(ring);
      }
      const lattice = secs.slice();
      for (let k = 0; k < NA; k++) lattice.push(secs.map((rg) => rg[k]));
      // four fins, each its own swept quad lattice
      const fins = [], finAcc = [];
      for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const FS2 = 6, FC2 = 7, rows2 = [];
        for (let si = 0; si < FS2; si++) {
          const sp = si / (FS2 - 1);
          const rr = RB + 0.30 * sp;
          const le = 0.52 + 0.28 * sp;
          const cc = 0.40 - 0.22 * sp;
          const row = [];
          for (let ci = 0; ci <= FC2; ci++) {
            const x = le + (cc * ci) / FC2;
            row.push([x, rr * ca, rr * sa]);
          }
          rows2.push(row);
          lattice.push(row);
        }
        for (let ci = 0; ci <= FC2; ci++) fins.push(rows2.map((rw) => rw[ci]));
        finAcc.push(rows2.map((rw) => rw[0]));
        finAcc.push(rows2[FS2 - 1]);
      }
      const accents = finAcc.concat([
        secs[3], secs[NS - 1],
        secs.map((rg) => rg[10]),
        secs.map((rg) => rg[0]),
      ]);
      return {
        scale: 0.42, tilt: 0.52, sweep: 0.85, wob: 0.05,
        groups: [
          { pl: fins, col: TEAL, a: 0.22, w: 0.8, flat: true },
          { pl: lattice, col: TEAL, a: 0.26, w: 0.8, flat: true },
          { pl: accents, col: GOLD, a: 0.85, w: 1.4, glow: true, track: true },
        ],
      };
    };

    // 02 · stented artery, longitudinal section — one continuous half-pipe
    //      like the published clip views: THICK wall (inner + outer half
    //      surfaces), wide flat cut decks meshed through the thickness the
    //      whole length, meshed cross-sections at both ends, and the stent
    //      deployed openly in the trough. Nothing overlaps, nothing hides.
    const buildStent = () => {
      const RS = 0.28, PK = 8, A = 0.048, KS = 110;
      const bend = (x) => 0.12 * x * x - 0.07;
      const VRi = 0.34, VRo = 0.52, XE = 1.0;
      const H1 = Math.PI, PI2 = Math.PI * 2;
      // the device: crowns across the middle of the trough
      const SLEN = 1.1, NR = 13, gap = SLEN / (NR - 1);
      const rings = [], bridges = [];
      for (let i = 0; i < NR; i++) {
        const x0 = -SLEN / 2 + gap * i;
        const flip = (i % 2) * Math.PI;
        const ring = [];
        for (let k = 0; k <= KS; k++) {
          const th = (k / KS) * PI2;
          const x = x0 + A * Math.sin(th * PK + flip);
          ring.push([x, RS * Math.cos(th) + bend(x), RS * Math.sin(th)]);
        }
        rings.push(ring);
      }
      for (let i = 0; i < NR - 1; i++) {
        for (let b2 = 0; b2 < 4; b2++) {
          const th = ((b2 + (i % 2) * 0.5) / 4) * PI2 + Math.PI / PK;
          const xa = -SLEN / 2 + gap * i + A * Math.sin(th * PK + (i % 2) * Math.PI);
          const xb = -SLEN / 2 + gap * (i + 1) + A * Math.sin(th * PK + ((i + 1) % 2) * Math.PI);
          bridges.push([
            [xa, RS * Math.cos(th) + bend(xa), RS * Math.sin(th)],
            [xb, RS * Math.cos(th) + bend(xb), RS * Math.sin(th)],
          ]);
        }
      }
      // deployment contact ties from crown peaks to the inner wall
      for (let i = 0; i < NR; i += 2) {
        const x0 = -SLEN / 2 + gap * i;
        for (let b2 = 0; b2 < 4; b2++) {
          const th = ((b2 + 0.5) / 4) * PI2;
          const xp = x0 + A * Math.sin(th * PK + (i % 2) * Math.PI);
          bridges.push([
            [xp, RS * Math.cos(th) + bend(xp), RS * Math.sin(th)],
            [xp, VRi * Math.cos(th) + bend(xp), VRi * Math.sin(th)],
          ]);
        }
      }
      // the sectioned wall: kept half is z <= 0 (we look into the trough)
      const NX = 64, NA2 = 28;                     // near-square surface quads
      const GR = [0, 0.08, 0.19, 0.34, 0.55, 0.78, 1]; // wall layers graded to the lumen
      const innerG = [], outerG = [], ledge = [], ledgeEdge = [], endFace = [];
      const half = (VR2, arr, xStep, aStep) => {
        for (let i = 0; i <= NX; i += xStep) {
          const xr = -XE + (2 * XE * i) / NX;
          const ring = [];
          for (let k = 0; k <= NA2; k++) {
            const th = H1 + (H1 * k) / NA2;
            ring.push([xr, VR2 * Math.cos(th) + bend(xr), VR2 * Math.sin(th)]);
          }
          arr.push(ring);
        }
        for (let j = 0; j <= NA2; j += aStep) {
          const th = H1 + (H1 * j) / NA2;
          const rail = [];
          for (let k = 0; k <= NX; k++) {
            const x = -XE + (2 * XE * k) / NX;
            rail.push([x, VR2 * Math.cos(th) + bend(x), VR2 * Math.sin(th)]);
          }
          arr.push(rail);
        }
      };
      // inner lumen surface: every station, plus half-spacing refinement
      // rings through the stented span (grade where the device contacts)
      for (let i = 0; i <= NX; i++) {
        const xr = -XE + (2 * XE * i) / NX;
        const mk = (x2) => {
          const ring = [];
          for (let k = 0; k <= NA2; k++) {
            const th = H1 + (H1 * k) / NA2;
            ring.push([x2, VRi * Math.cos(th) + bend(x2), VRi * Math.sin(th)]);
          }
          innerG.push(ring);
        };
        mk(xr);
        if (Math.abs(xr) < 0.62 && i < NX) mk(xr + XE / NX);
      }
      for (let j = 0; j <= NA2; j++) {
        const th = H1 + (H1 * j) / NA2;
        const rail = [];
        for (let k = 0; k <= NX; k++) {
          const x = -XE + (2 * XE * k) / NX;
          rail.push([x, VRi * Math.cos(th) + bend(x), VRi * Math.sin(th)]);
        }
        innerG.push(rail);
      }
      half(VRo, outerG, 2, 2);
      // flat cut decks along both lips, meshed through the wall thickness
      for (const sgn of [-1, 1]) {
        for (let q = 0; q < GR.length; q++) {
          const r2 = VRi + (VRo - VRi) * GR[q];
          const ln = [];
          for (let k = 0; k <= NX; k++) {
            const x = -XE + (2 * XE * k) / NX;
            ln.push([x, sgn * r2 + bend(x), 0]);
          }
          (q === 0 || q === GR.length - 1 ? ledgeEdge : ledge).push(ln);
        }
        for (let k = 0; k <= NX; k++) {
          const x = -XE + (2 * XE * k) / NX;
          ledge.push([[x, sgn * VRi + bend(x), 0], [x, sgn * VRo + bend(x), 0]]);
        }
      }
      // end cross-sections: wall annulus with the SAME graded layers as the
      // decks, and a lumen polar grid clustered toward the wall (y+ rule)
      for (const xe of [-XE, XE]) {
        const be = bend(xe);
        for (let q = 0; q < GR.length; q++) {
          const VR2 = VRi + (VRo - VRi) * GR[q];
          const arc = [];
          for (let k = 0; k <= 24; k++) {
            const th = H1 + (H1 * k) / 24;
            arc.push([xe, VR2 * Math.cos(th) + be, VR2 * Math.sin(th)]);
          }
          (q === 0 || q === GR.length - 1 ? ledgeEdge : endFace).push(arc);
        }
        for (let j = 0; j <= 24; j++) {
          const th = H1 + (H1 * j) / 24;
          endFace.push([
            [xe, VRi * Math.cos(th) + be, VRi * Math.sin(th)],
            [xe, VRo * Math.cos(th) + be, VRo * Math.sin(th)],
          ]);
        }
        for (const fr of [0.30, 0.55, 0.75, 0.88, 0.96]) {
          const arc = [];
          for (let k = 0; k <= 16; k++) {
            const th = H1 + (H1 * k) / 16;
            arc.push([xe, fr * VRi * Math.cos(th) + be, fr * VRi * Math.sin(th)]);
          }
          endFace.push(arc);
        }
        for (let j = 0; j <= 12; j++) {
          const th = H1 + (H1 * j) / 12;
          endFace.push([[xe, be, 0], [xe, VRi * Math.cos(th) + be, VRi * Math.sin(th)]]);
        }
      }
      const path = [];
      for (let k = 0; k <= 24; k++) {
        const x = -0.98 + (k / 24) * 1.96;
        path.push([x, bend(x), 0]);
      }
      return {
        scale: 0.42, tilt: 0.55, sweep: 0.8, wob: 0.07, path,
        groups: [
          { pl: outerG, col: TEAL, a: 0.16, w: 0.8, flat: true },
          { pl: innerG, col: TEAL, a: 0.26, w: 0.8, flat: true },
          { pl: endFace, col: TEAL, a: 0.34, w: 0.9, flat: true },
          { pl: ledge, col: TEAL, a: 0.42, w: 0.8, flat: true },
          { pl: ledgeEdge, col: INK, a: 0.55, w: 1.1, flat: true },
          { pl: bridges, col: GOLD, a: 0.60, w: 1.1 },
          { pl: rings, col: GOLD, a: 0.85, w: 1.2, glow: true, track: true },
        ],
      };
    };

    // 03 · game terrain — 29×29 heightfield, ridged noise + island falloff,
    //      altitude-tinted wireframe, and marching-squares CONTOUR LINES so
    //      the tile reads like real topo/level data, framed on a base plate
    const buildTerrain = () => {
      const G = 29;
      const n2 = (a, b) => { const s2 = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s2 - Math.floor(s2); };
      const smp = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        return n2(xi, yi) * (1 - u) * (1 - v) + n2(xi + 1, yi) * u * (1 - v) + n2(xi, yi + 1) * (1 - u) * v + n2(xi + 1, yi + 1) * u * v;
      };
      const HT = [], V = [];
      let maxE = 0;
      for (let i = 0; i < G; i++) {
        HT.push([]); V.push([]);
        for (let j = 0; j < G; j++) {
          let e = 0.58 * smp(i * 0.16, j * 0.16) + 0.30 * smp(i * 0.34 + 7.3, j * 0.34 + 3.1) + 0.12 * smp(i * 0.65 + 13.7, j * 0.65 + 5.9);
          e = Math.pow(e, 1.6) * 1.5;
          const dx = (i / (G - 1) - 0.5) * 2, dy = (j / (G - 1) - 0.5) * 2;
          e *= clamp(1.3 - Math.max(Math.abs(dx), Math.abs(dy)) * 1.25, 0, 1);
          if (e > maxE) maxE = e;
          HT[i].push(e);
          V[i].push([-0.95 + (1.9 * i) / (G - 1), 0.42 - e * 0.95, -0.95 + (1.9 * j) / (G - 1)]);
        }
      }
      const rows = [], cols = [], dias = [], hRows = [], hCols = [];
      for (let j = 0; j < G; j++) { rows.push(V.map((col) => col[j])); hRows.push(HT.map((col) => col[j])); }
      for (let i = 0; i < G; i++) { cols.push(V[i]); hCols.push(HT[i]); }
      for (let i = 0; i < G - 1; i++) for (let j = 0; j < G - 1; j++) dias.push([V[i + 1][j], V[i][j + 1]]);
      // marching squares: iso-height contour segments at three levels
      const contours = [];
      const gx = (i) => -0.95 + (1.9 * i) / (G - 1);
      for (const lf of [0.35, 0.55, 0.75]) {
        const L = lf * maxE, y = 0.42 - L * 0.95;
        for (let i = 0; i < G - 1; i++) {
          for (let j = 0; j < G - 1; j++) {
            const h00 = HT[i][j], h10 = HT[i + 1][j], h01 = HT[i][j + 1], h11 = HT[i + 1][j + 1];
            const pts = [];
            if ((h00 < L) !== (h10 < L)) { const q = (L - h00) / (h10 - h00); pts.push([gx(i) + q * (gx(i + 1) - gx(i)), y, gx(j)]); }
            if ((h01 < L) !== (h11 < L)) { const q = (L - h01) / (h11 - h01); pts.push([gx(i) + q * (gx(i + 1) - gx(i)), y, gx(j + 1)]); }
            if ((h00 < L) !== (h01 < L)) { const q = (L - h00) / (h01 - h00); pts.push([gx(i), y, gx(j) + q * (gx(j + 1) - gx(j))]); }
            if ((h10 < L) !== (h11 < L)) { const q = (L - h10) / (h11 - h10); pts.push([gx(i + 1), y, gx(j) + q * (gx(j + 1) - gx(j))]); }
            if (pts.length >= 2) contours.push([pts[0], pts[1]]);
            if (pts.length === 4) contours.push([pts[2], pts[3]]);
          }
        }
      }
      const base = [[-0.97, 0.425, -0.97], [0.97, 0.425, -0.97], [0.97, 0.425, 0.97], [-0.97, 0.425, 0.97], [-0.97, 0.425, -0.97]];
      return {
        scale: 0.46, tilt: 0.82, sweep: 0.7, wob: 0.10,
        groups: [
          { pl: [base], col: GOLD, a: 0.35, w: 1.2 },
          { pl: dias, col: TEAL, a: 0.09, w: 0.8, flat: true },
          { pl: rows, col: TEAL, a: 0.22, w: 0.8, hgt: hRows, track: true },
          { pl: cols, col: TEAL, a: 0.22, w: 0.8, hgt: hCols },
          { pl: contours, col: GOLD, a: 0.40, w: 1, flat: true },
        ],
      };
    };

    // 04 · vented rotor — dense polar mesh: 9 face rings × 48 spokes plus 48
    //      half-spokes refining the outer friction band (refine where the
    //      gradients live), 12-seg drilled holes each with a local refinement
    //      halo, hub + bore + 5-bolt circle, spinning under a fixed caliper
    const buildRotor = () => {
      const WZ = 0.10;
      const RD = [0.42, 0.50, 0.58, 0.66, 0.74, 0.80, 0.86, 0.92, 0.97];
      const hotPl = [], hotPol = [], backR = [], rim = [], holes = [], hub = [], vanes = [], cal = [];
      for (const r of RD) {
        const ring = [], pol = [];
        for (let k = 0; k <= 48; k++) {
          const th = (k / 48) * Math.PI * 2;
          ring.push([r * Math.cos(th), r * Math.sin(th), WZ]);
          pol.push([r, th]);
        }
        hotPl.push(ring); hotPol.push(pol);
      }
      for (let k = 0; k < 48; k++) {
        const th = (k / 48) * Math.PI * 2;
        const sp = [], pol = [];
        for (let q = 0; q <= 5; q++) {
          const r = 0.42 + ((0.97 - 0.42) * q) / 5;
          sp.push([r * Math.cos(th), r * Math.sin(th), WZ]);
          pol.push([r, th]);
        }
        hotPl.push(sp); hotPol.push(pol);
      }
      for (let k = 0; k < 48; k++) {           // outer-band refinement
        const th = ((k + 0.5) / 48) * Math.PI * 2;
        const sp = [], pol = [];
        for (let q = 0; q <= 3; q++) {
          const r = 0.80 + ((0.97 - 0.80) * q) / 3;
          sp.push([r * Math.cos(th), r * Math.sin(th), WZ]);
          pol.push([r, th]);
        }
        hotPl.push(sp); hotPol.push(pol);
      }
      for (let ri = 0; ri < RD.length; ri += 2) {
        const r = RD[ri], ring = [];
        for (let k = 0; k <= 48; k++) {
          const th = (k / 48) * Math.PI * 2;
          ring.push([r * Math.cos(th), r * Math.sin(th), -WZ]);
        }
        backR.push(ring);
      }
      for (let k = 0; k < 36; k++) {
        const th = (k / 36) * Math.PI * 2;
        rim.push([[0.97 * Math.cos(th), 0.97 * Math.sin(th), WZ], [0.97 * Math.cos(th), 0.97 * Math.sin(th), -WZ]]);
      }
      for (let k = 0; k < 16; k++) {
        const th = (k / 16) * Math.PI * 2 + 0.1;
        const hr = k % 2 ? 0.715 : 0.585;
        const cx2 = hr * Math.cos(th), cy2 = hr * Math.sin(th);
        for (const [rr, seg] of [[0.040, 12], [0.068, 12]]) {
          const hole = [];
          for (let q = 0; q <= seg; q++) {
            const a2 = (q / seg) * Math.PI * 2;
            hole.push([cx2 + rr * Math.cos(a2), cy2 + rr * Math.sin(a2), WZ]);
          }
          holes.push(hole);
        }
      }
      for (const z of [WZ, -WZ]) {
        const ring = [];
        for (let k = 0; k <= 32; k++) {
          const th = (k / 32) * Math.PI * 2;
          ring.push([0.30 * Math.cos(th), 0.30 * Math.sin(th), z]);
        }
        hub.push(ring);
      }
      const bore = [];
      for (let k = 0; k <= 24; k++) {
        const th = (k / 24) * Math.PI * 2;
        bore.push([0.095 * Math.cos(th), 0.095 * Math.sin(th), WZ]);
      }
      hub.push(bore);
      for (let k = 0; k < 10; k++) {
        const th = (k / 10) * Math.PI * 2;
        hub.push([[0.30 * Math.cos(th), 0.30 * Math.sin(th), WZ], [0.30 * Math.cos(th), 0.30 * Math.sin(th), -WZ]]);
      }
      for (let k = 0; k < 5; k++) {
        const th = (k / 5) * Math.PI * 2 + 0.4;
        const bx = 0.195 * Math.cos(th), by = 0.195 * Math.sin(th);
        const bolt = [];
        for (let q = 0; q <= 10; q++) {
          const a2 = (q / 10) * Math.PI * 2;
          bolt.push([bx + 0.042 * Math.cos(a2), by + 0.042 * Math.sin(a2), WZ]);
        }
        hub.push(bolt);
      }
      for (let k = 0; k < 18; k++) {
        const th = (k / 18) * Math.PI * 2;
        const vn = [];
        for (let q = 0; q <= 5; q++) {
          const r = 0.44 + ((0.94 - 0.44) * q) / 5;
          const a2 = th + 0.14 * (q / 5);
          vn.push([r * Math.cos(a2), r * Math.sin(a2), 0]);
        }
        vanes.push(vn);
      }
      for (const z of [WZ + 0.05, -WZ - 0.05]) {
        const arc = [];
        for (let k = 0; k <= 10; k++) {
          const th = -0.90 + (k / 10) * 0.56;
          arc.push([1.06 * Math.cos(th), 1.06 * Math.sin(th), z]);
        }
        cal.push(arc);
      }
      for (const th of [-0.90, -0.62, -0.34]) {
        cal.push([[1.06 * Math.cos(th), 1.06 * Math.sin(th), WZ + 0.05], [1.06 * Math.cos(th), 1.06 * Math.sin(th), -WZ - 0.05]]);
      }
      for (const th of [-0.90, -0.34]) {
        cal.push([[1.06 * Math.cos(th), 1.06 * Math.sin(th), WZ + 0.05], [0.88 * Math.cos(th), 0.88 * Math.sin(th), WZ + 0.02]]);
      }
      return {
        scale: 0.42, tilt: 0.42, sweep: 0.5, wob: 0.05, spinRate: 0.0008,
        groups: [
          { pl: backR, col: TEAL, a: 0.10, w: 0.8, flat: true },
          { pl: vanes, col: TEAL, a: 0.14, w: 0.8, flat: true },
          { pl: rim, col: GOLD, a: 0.18, w: 0.8, flat: true },
          { pl: hotPl, col: TEAL, a: 0.22, w: 0.8, pol: hotPol, track: true },
          { pl: holes, col: TEAL, a: 0.30, w: 0.8, flat: true },
          { pl: hub, col: GOLD, a: 0.55, w: 1.1 },
          { pl: cal, col: GOLD, a: 0.85, w: 1.8, glow: true, noSpin: true },
        ],
      };
    };

    const MODELS = [buildWing(), buildStent(), buildTerrain(), buildRotor()];
    const PAD_ANG = -0.62;                           // caliper pad centre angle

    /* ---- state ---- */
    let W = 0, H = 0, sref = 0, lastBB = null, lastPj = null;
    const lastRot = { y: 0, x: 0 };
    // blood cells riding the stent lumen (biomedical phase only)
    const BLOOD = Array.from({ length: 12 }, (_, i) => ({
      u: i / 12, oy: (Math.random() - 0.5) * 0.30, oz: (Math.random() - 0.5) * 0.30,
    }));
    const pathAt = (P, u) => {
      const m = P.length - 1;
      const d = clamp(u - Math.floor(u), 0, 1) * m;
      const i = Math.min(Math.floor(d), m - 1), q = d - i;
      return [
        P[i][0] + (P[i + 1][0] - P[i][0]) * q,
        P[i][1] + (P[i + 1][1] - P[i][1]) * q,
        P[i][2] + (P[i + 1][2] - P[i][2]) * q,
      ];
    };
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sref = Math.min(W, H);
      lastBB = { x0: W * 0.25, y0: H * 0.25, x1: W * 0.75, y1: H * 0.75 };
      for (const k in REAL) if (REAL[k].V) renderReal(REAL[k]);
    };

    /* ---- one 3D model pass: rotate → project → depth-shaded wireframe ---- */
    const drawModel = (mi, t, sweepLocal, alphaMul, trackBB) => {
      const M = MODELS[mi];
      const rotY = sweepLocal * M.sweep + Math.sin(t * 0.00045 + mi * 2.1) * M.wob;
      const rotX = M.tilt + Math.sin(t * 0.00032) * 0.04;
      const spin = M.spinRate ? t * M.spinRate : 0;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
      const cosS = Math.cos(spin), sinS = Math.sin(spin);
      const S = sref * M.scale, cx0 = W * 0.5, cy0 = H * 0.47, F3 = 3.1;
      const pj = (p, spun) => {
        let x = p[0], y = p[1];
        const z = p[2];
        if (spun) { const xx = x * cosS - y * sinS; y = x * sinS + y * cosS; x = xx; }
        const x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        const k = F3 / (F3 - z2);
        return [cx0 + x1 * S * k, cy0 + y1 * S * k, k];
      };
      if (trackBB) {
        lastPj = { pj };
        lastRot.y = rotY; lastRot.x = rotX;
        lastBB.x0 = 1e9; lastBB.y0 = 1e9; lastBB.x1 = -1e9; lastBB.y1 = -1e9;
      }
      const tb = (p2) => {
        if (p2[0] < lastBB.x0) lastBB.x0 = p2[0];
        if (p2[0] > lastBB.x1) lastBB.x1 = p2[0];
        if (p2[1] < lastBB.y0) lastBB.y0 = p2[1];
        if (p2[1] > lastBB.y1) lastBB.y1 = p2[1];
      };
      const breath = 0.74 + 0.26 * Math.sin(t * 0.0011);
      const NB = 8;                              // colour-quantisation buckets
      for (const g of M.groups) {
        const spun = M.spinRate ? g.noSpin !== true : false;
        const tk = trackBB && g.track === true;
        if (g.occ) {
          // hidden-line removal with the EXACT silhouette: fill the union of
          // every station ring's projected polygon (nonzero winding), so the
          // opaque region hugs the bent tube instead of hull-bridging it
          ctx.fillStyle = "rgba(9,7,3," + (0.96 * alphaMul).toFixed(3) + ")";
          ctx.beginPath();
          for (const pl of g.pl) {
            for (let k = 0; k < pl.length; k++) {
              const p3 = pj(pl[k], spun);
              k ? ctx.lineTo(p3[0], p3[1]) : ctx.moveTo(p3[0], p3[1]);
            }
            ctx.closePath();
          }
          ctx.fill();
          continue;
        }
        ctx.lineWidth = g.w;
        if (g.pol || g.hgt) {
          /* field-coloured lattice (rotor heat / terrain altitude): quantise
             the mix into NB buckets and stroke each bucket once — thousands
             of segments for the cost of eight strokes */
          if (!g._bk) g._bk = Array.from({ length: NB }, () => []);
          for (let b = 0; b < NB; b++) g._bk[b].length = 0;
          for (let pi = 0; pi < g.pl.length; pi++) {
            const pl = g.pl[pi];
            let prev = pj(pl[0], spun);
            if (tk) tb(prev);
            for (let k = 1; k < pl.length; k++) {
              const cur = pj(pl[k], spun);
              if (tk) tb(cur);
              let mix;
              if (g.pol) {
                const po = g.pol[pi][k];
                const dRev = ((((po[1] + spin) - PAD_ANG) / (Math.PI * 2)) % 1 + 1) % 1;
                mix = Math.exp(-Math.pow((po[0] - 0.72) / 0.22, 2)) * (0.16 + 0.84 * Math.exp(-dRev * 2.8)) * breath;
              } else {
                mix = clamp(g.hgt[pi][k] * 1.15, 0, 1);
              }
              const bi = Math.min(NB - 1, (mix * NB) | 0);
              g._bk[bi].push(prev[0], prev[1], cur[0], cur[1]);
              prev = cur;
            }
          }
          for (let b = 0; b < NB; b++) {
            const seg = g._bk[b];
            if (!seg.length) continue;
            const mix = (b + 0.5) / NB;
            const cr = Math.round(LINE3[0] + (ACC3[0] - LINE3[0]) * mix),
              cg2 = Math.round(LINE3[1] + (ACC3[1] - LINE3[1]) * mix),
              cb = Math.round(LINE3[2] + (ACC3[2] - LINE3[2]) * mix);
            ctx.strokeStyle = "rgba(" + cr + "," + cg2 + "," + cb + "," + ((g.a + 0.55 * mix) * alphaMul).toFixed(3) + ")";
            ctx.beginPath();
            for (let q = 0; q < seg.length; q += 4) {
              ctx.moveTo(seg[q], seg[q + 1]);
              ctx.lineTo(seg[q + 2], seg[q + 3]);
            }
            ctx.stroke();
          }
        } else if (g.flat) {
          // dense single-colour lattice: one path, one stroke
          ctx.beginPath();
          for (let pi = 0; pi < g.pl.length; pi++) {
            const pl = g.pl[pi];
            for (let k = 0; k < pl.length; k++) {
              const p2 = pj(pl[k], spun);
              if (tk) tb(p2);
              k ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1]);
            }
          }
          ctx.strokeStyle = "rgba(" + g.col + "," + (g.a * alphaMul).toFixed(3) + ")";
          ctx.stroke();
        } else {
          // glow = cheap two-pass halo (wide faint + narrow bright), built
          // as a Path2D so each polyline is projected exactly once
          const passes = g.glow ? [[3.2, 0.20], [1, 1]] : [[1, 1]];
          for (let pi = 0; pi < g.pl.length; pi++) {
            const pl = g.pl[pi];
            const path = new Path2D();
            let kSum = 0;
            for (let k = 0; k < pl.length; k++) {
              const p2 = pj(pl[k], spun);
              kSum += p2[2];
              if (tk) tb(p2);
              k ? path.lineTo(p2[0], p2[1]) : path.moveTo(p2[0], p2[1]);
            }
            const dep = clamp(0.45 + (kSum / pl.length - 0.96) * 5, 0.30, 1.15);
            for (const ps of passes) {
              ctx.lineWidth = g.w * ps[0];
              ctx.strokeStyle = "rgba(" + g.col + "," + (g.a * ps[1] * dep * alphaMul).toFixed(3) + ")";
              ctx.stroke(path);
            }
          }
        }
      }
    };


    /* ---- real CAD meshes, per industry (Gmsh / isotropic remesh): each is
       baked once to its own offscreen buffer at a fixed 3/4 pose, then blitted
       each frame so it never costs a per-frame redraw. Keyed by phase index;
       any phase without an entry falls back to the procedural drawModel. ---- */
    const REAL = {
      0: { url: "assets/rocket.json.gz", ry: 0.62, rx: -0.18, sc: 1.18, cx: 0.56, cy: 0.46, f3: 3.4 },
      1: { url: "assets/artery.json.gz?v=2", ry: 0.35, rx: -0.18, sc: 0.52, cx: 0.62, cy: 0.32, f3: 3.4, pulse: 1 },
      2: { url: "assets/scene.json.gz?v=4", ry: 0.70, rx: -0.24, sc: 0.58, cx: 0.32, cy: 0.50, f3: 3.6, scene: 1 },
      3: { url: "assets/car2.json.gz", ry: 0.72, rx: -0.30, sc: 0.37, cx: 0.60, cy: 0.29, f3: 3.4, gy: 0.322, wake: 1, drift: 1 },
    };
    for (const k in REAL) {
      const e = REAL[k];
      e.canvas = document.createElement("canvas");
      e.rctx = e.canvas.getContext("2d");
      e.ready = false; e.V = null; e.E = null; e.pj = null; e.bb = null;
    }

    const renderReal = (e, pose) => {
      if (!e.V || !W || !H) return;
      const base = e.baked || {};
      const p = pose || {};
      const ry = p.ry !== undefined ? p.ry : (base.ry !== undefined ? base.ry : e.ry);
      const rx = p.rx !== undefined ? p.rx : (base.rx !== undefined ? base.rx : e.rx);
      const scv = p.sc !== undefined ? p.sc : (base.sc !== undefined ? base.sc : e.sc);
      const cyf = p.cy !== undefined ? p.cy : (base.cy !== undefined ? base.cy : e.cy);
      e.baked = { ry: ry, rx: rx, sc: scv, cy: cyf };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      e.canvas.width = Math.round(W * dpr); e.canvas.height = Math.round(H * dpr);
      const g = e.rctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const Sc = sref * scv, cx0 = W * e.cx, cy0 = H * cyf, F3 = e.f3;
      const nv = e.V.length / 3;
      const PX = new Float32Array(nv), PY = new Float32Array(nv), PZ = new Float32Array(nv);
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, zmin = 1e9, zmax = -1e9;
      for (let i = 0; i < nv; i++) {
        const x = e.V[i * 3], y = e.V[i * 3 + 1], z = e.V[i * 3 + 2];
        const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        const k = F3 / (F3 - z2);
        const sxp = cx0 + x1 * Sc * k, syp = cy0 + y1 * Sc * k;
        PX[i] = sxp; PY[i] = syp; PZ[i] = z2;
        if (sxp < bx0) bx0 = sxp; if (sxp > bx1) bx1 = sxp;
        if (syp < by0) by0 = syp; if (syp > by1) by1 = syp;
        if (z2 < zmin) zmin = z2; if (z2 > zmax) zmax = z2;
      }
      e.bb = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
      e.pj = { pj: (p) => {
        const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
        const y1 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx, k = F3 / (F3 - z2);
        return [cx0 + x1 * Sc * k, cy0 + y1 * Sc * k, k];
      } };
      /* scene ground grid (entries with grid params from the asset): a DCC
         viewport floor under a multi-object scene, pooled falloff */
      if (e.grid) {
        const gr = e.grid, gyv = e.gy, STEP = gr.step;
        const aAt = (px2, pz2) => {
          const dx = px2 / gr.fx, dz = (pz2 - gr.fzc) / gr.fz;
          return gr.peak * Math.exp(-(dx * dx + dz * dz) * 1.5);
        };
        const seg = (p0, p1, al) => {
          if (al <= 0.004) return;
          g.strokeStyle = "rgba(" + TEAL + "," + al.toFixed(3) + ")";
          const A = e.pj.pj(p0), B = e.pj.pj(p1);
          g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
        };
        g.lineWidth = 1;
        for (let u = -gr.gx; u <= gr.gx + 1e-9; u += STEP)
          for (let w = -gr.gz; w < gr.gz - 1e-9; w += STEP)
            seg([u, gyv, w], [u, gyv, w + STEP], aAt(u, w + STEP / 2));
        for (let w = -gr.gz; w <= gr.gz + 1e-9; w += STEP)
          for (let u = -gr.gx; u < gr.gx - 1e-9; u += STEP)
            seg([u, gyv, w], [u + STEP, gyv, w], aAt(u + STEP / 2, w));
      }
      /* pooled ground grid (entries with gy): short segments whose alpha
         falls off gaussian from the model's footprint, so the floor
         dissolves into black with no edges — baked with the mesh */
      if (e.gy !== undefined && !e.grid) {
        const gyv = e.gy, GX = 3.0, GZ = 2.0, STEP = 0.24, NSEG = 20;
        const aAt = (px2, pz2) => {
          const dx = px2 / 2.0, dz = pz2 / 1.35;
          return 0.26 * Math.exp(-(dx * dx + dz * dz) * 1.6);
        };
        const seg = (p0, p1, al) => {
          if (al <= 0.004) return;
          g.strokeStyle = "rgba(" + TEAL + "," + al.toFixed(3) + ")";
          const A = e.pj.pj(p0), B = e.pj.pj(p1);
          g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
        };
        g.lineWidth = 1;
        for (let u = -GX; u <= GX + 1e-9; u += STEP)
          for (let si = 0; si < NSEG; si++) {
            const z0 = -GZ + (2 * GZ * si) / NSEG, z1b = -GZ + (2 * GZ * (si + 1)) / NSEG;
            seg([u, gyv, z0], [u, gyv, z1b], aAt(u, (z0 + z1b) / 2));
          }
        for (let w = -GZ; w <= GZ + 1e-9; w += STEP)
          for (let si = 0; si < NSEG; si++) {
            const x0 = -GX + (2 * GX * si) / NSEG, x1b = -GX + (2 * GX * (si + 1)) / NSEG;
            seg([x0, gyv, w], [x1b, gyv, w], aAt((x0 + x1b) / 2, w));
          }
        /* wake refinement boxes (entries with wake): two nested wireframe
           volumes hugging the body and trailing downstream (+x), the CFD
           domain-setup look — baked with the floor */
        if (e.wake) {
          const box = (x0, x1, yTop, zH, al) => {
            const pts = [
              [x0, gyv, -zH], [x1, gyv, -zH], [x1, gyv, zH], [x0, gyv, zH],
              [x0, yTop, -zH], [x1, yTop, -zH], [x1, yTop, zH], [x0, yTop, zH],
            ];
            const ed = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
            for (const pr of ed) seg(pts[pr[0]], pts[pr[1]], al);
          };
          box(-1.2, 1.6, -0.42, 0.55, 0.13);
          box(-1.45, 2.6, -0.66, 0.78, 0.08);
        }
      }
      const NB = 9, zr = (zmax - zmin) || 1;
      g.lineWidth = 1;
      /* scene entries: per-object material colour, depth-shaded via alpha.
         everything else: one theme colour with depth. */
      const strokeRange = (e0, e1, col) => {
        const buckets = Array.from({ length: NB }, () => []);
        for (let i = e0; i < e1; i++) {
          const a = e.E[i * 2], b = e.E[i * 2 + 1];
          const d = ((PZ[a] + PZ[b]) * 0.5 - zmin) / zr;
          buckets[Math.min(NB - 1, (d * NB) | 0)].push(PX[a], PY[a], PX[b], PY[b]);
        }
        for (let bkt = 0; bkt < NB; bkt++) {
          const seg = buckets[bkt]; if (!seg.length) continue;
          const al = col === TEAL ? 0.13 + 0.34 * (bkt / (NB - 1)) : 0.34 + 0.58 * (bkt / (NB - 1));
          g.strokeStyle = "rgba(" + col + "," + al.toFixed(3) + ")";
          g.beginPath();
          for (let q = 0; q < seg.length; q += 4) { g.moveTo(seg[q], seg[q + 1]); g.lineTo(seg[q + 2], seg[q + 3]); }
          g.stroke();
        }
      };
      if (e.groups) { for (const gr of e.groups) strokeRange(gr.e0, gr.e1, gr.col); }
      else strokeRange(0, e.E.length / 2, TEAL);
      /* editor selection furniture (scene entries): a wireframe bounding
         box per object (gold on the hero, steel otherwise) and a transform
         gizmo at the hero's base — the game-engine viewport signature */
      if (e.boxes) {
        g.lineWidth = 1;
        for (const bx of e.boxes) {
          const mn = bx.mn, mx = bx.mx;
          const c = [
            [mn[0],mn[1],mn[2]],[mx[0],mn[1],mn[2]],[mx[0],mn[1],mx[2]],[mn[0],mn[1],mx[2]],
            [mn[0],mx[1],mn[2]],[mx[0],mx[1],mn[2]],[mx[0],mx[1],mx[2]],[mn[0],mx[1],mx[2]],
          ];
          const ed = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
          g.strokeStyle = bx.h ? "rgba(" + GOLD + ",0.62)" : "rgba(" + TEAL + ",0.30)";
          for (const pr of ed) {
            const A = e.pj.pj(c[pr[0]]), B = e.pj.pj(c[pr[1]]);
            g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
          }
        }
      }
      if (e.gizmo) {
        const o = e.gizmo.o, gl = e.gizmo.len;
        const axes = [[[1,0,0],"206,96,74"],[[0,-1,0],"120,182,120"],[[0,0,1],"92,132,206"]];
        g.lineWidth = 2;
        for (const [d, col] of axes) {
          const A = e.pj.pj(o), B = e.pj.pj([o[0]+d[0]*gl, o[1]+d[1]*gl, o[2]+d[2]*gl]);
          g.strokeStyle = "rgb(" + col + ")";
          g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
        }
      }
      /* inspector tags (scene entries): name + tri-count at each object's
         top, like a game-engine outliner */
      if (e.labels) {
        g.textBaseline = "top";
        for (const L of e.labels) {
          const s = e.pj.pj(L.a), tx = s[0] + 14, ty = s[1] - 14;
          g.strokeStyle = "rgba(120,130,145,0.7)"; g.lineWidth = 1;
          g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(tx - 5, ty + 11); g.stroke();
          g.fillStyle = "rgba(214,218,224,0.94)";
          g.font = "500 15px 'Geist Mono', ui-monospace, monospace";
          g.fillText(L.n, tx, ty);
          g.fillStyle = "rgba(150,158,168,0.85)";
          g.font = "13px 'Geist Mono', ui-monospace, monospace";
          g.fillText(L.t.toLocaleString() + " tris", tx, ty + 17);
        }
      }
      e.ready = true;
    };

    const blitReal = (e, alphaMul, track, tNow) => {
      const b2 = e.baked || {};
      if (track) {
        lastPj = e.pj;
        lastRot.y = b2.ry !== undefined ? b2.ry : e.ry;
        lastRot.x = b2.rx !== undefined ? b2.rx : e.rx;
        lastBB = e.bb;
      }
      /* entries with pulse beat at the same 72bpm as the blood cells and
         the trace: a sub-1% scale throb about the model's own centre plus
         a slow ambient drift — pure bitmap transforms, no rebakes */
      if (e.pulse && tNow !== undefined && e.bb) {
        /* lub-dub waveform on the same 72bpm clock: sharp systolic bump,
           smaller dicrotic echo, long quiet diastole — very faint */
        const ph = ((tNow * 0.00754) / (2 * Math.PI)) % 1;
        const lub = Math.exp(-Math.pow((ph - 0.12) / 0.045, 2));
        const dub = 0.5 * Math.exp(-Math.pow((ph - 0.30) / 0.055, 2));
        const s = 1 + 0.0035 * (lub + dub);
        const cxm = (e.bb.x0 + e.bb.x1) / 2, cym = (e.bb.y0 + e.bb.y1) / 2;
        const dx = Math.sin(tNow * 0.00009) * 3, dy = Math.cos(tNow * 0.00008) * 2.5;
        ctx.save();
        ctx.globalAlpha = alphaMul;
        ctx.translate(cxm + dx, cym + dy); ctx.scale(s, s); ctx.translate(-cxm, -cym);
        ctx.drawImage(e.canvas, 0, 0, W, H);
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      /* entries with drift: a faint wind-buffet of the WHOLE baked scene
         (car + floor + wake boxes move together) about the canvas centre —
         reads as a gently breathing tunnel camera, not a wobbling floor.
         Horizontal bias with a second harmonic gives an air-buffet feel. */
      if (e.drift && tNow !== undefined) {
        const dx = (Math.sin(tNow * 0.00021) + 0.4 * Math.sin(tNow * 0.00053)) * 4;
        const dy = Math.cos(tNow * 0.00017) * 2.4;
        const s = 1 + 0.0022 * Math.sin(tNow * 0.00013);
        ctx.save();
        ctx.globalAlpha = alphaMul;
        ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(e.canvas, 0, 0, W, H);
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = alphaMul; ctx.drawImage(e.canvas, 0, 0, W, H); ctx.globalAlpha = 1;
    };

    if (typeof pako !== "undefined") {
      for (const k in REAL) {
        const e = REAL[k];
        fetch(e.url).then((r) => r.arrayBuffer()).then((buf) => {
          const d = JSON.parse(pako.inflate(new Uint8Array(buf), { to: "string" }));
          e.V = new Float32Array(d.v.length);
          for (let i = 0; i < d.v.length; i++) e.V[i] = d.v[i] / 32767;
          e.E = Int32Array.from(d.e);
          if (d.grid) { e.grid = d.grid; e.gy = d.gy; e.labels = d.labels; e.boxes = d.boxes; e.gizmo = d.gizmo; e.groups = d.groups; }
          renderReal(e);
        }).catch(() => {});
      }
    }

    /* ---- one frame: the current model, eased crossfade at the boundaries,
       plus each discipline's viewport furniture at its own plateau ---- */
    const drawFrame = (s, t, dt, pNow) => {
      ctx.clearRect(0, 0, W, H);
      const iA = Math.min(Math.floor(s), 2);
      const f = clamp(s - iA, 0, 1);
      const morph = f > 0.001 && f < 0.999;
      const ef = sstep(f);                       /* eased blend — no pop */
      const local = pNow >= 0.999 ? 1 : (pNow % 0.25) / 0.25;
      const dA = [0, 1, 2, 3].map((i) => clamp(1 - Math.abs(s - i) * 2.4, 0, 1));

      /* DCC floor grid under the terrain tile (gaming phase) — drawn first
         so the model sits on it. Skipped when the scene asset is loaded,
         since it bakes its own grid. */
      if (dA[2] > 0.01 && lastPj && !(REAL[2] && REAL[2].ready)) {
        const yF = 0.58, EX = 1.9, NL = 14;
        ctx.lineWidth = 1;
        for (let gi = 0; gi <= NL; gi++) {
          const u = -EX + (2 * EX * gi) / NL;
          const fade = 1 - Math.abs(gi / NL - 0.5) * 1.1;
          ctx.strokeStyle = "rgba(" + TEAL + "," + (0.10 * dA[2] * Math.max(fade, 0.15)).toFixed(3) + ")";
          let a1 = lastPj.pj([u, yF, -EX], false), a2 = lastPj.pj([u, yF, EX], false);
          ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
          a1 = lastPj.pj([-EX, yF, u], false); a2 = lastPj.pj([EX, yF, u], false);
          ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.stroke();
        }
      }


      const drawOne = (mi, sweep, alpha, track) => {
        const rm = REAL[mi];
        return (rm && rm.ready) ? blitReal(rm, alpha, track, t) : drawModel(mi, t, sweep, alpha, track);
      };
      if (!morph) {
        drawOne(Math.round(s), local - 0.5, 1, true);
      } else {
        drawOne(iA, 0, 1 - ef, f < 0.5);
        drawOne(iA + 1, 0, ef, f >= 0.5);
      }

      /* blood cells + pulse trace (biomedical phase) — ink dots riding the
         lumen on the systole rhythm; the waveform is the same function */
      const pulse = Math.pow(Math.max(Math.sin(t * 0.00754), 0), 2);       /* 72 bpm */
      if (dA[1] > 0.01 && lastPj && dt > 0 && MODELS[1].path && !(REAL[1] && REAL[1].ready)) {
        for (const bp of BLOOD) {
          bp.u += dt * (0.05 + 0.20 * pulse);
          for (let k = 0; k < 3; k++) {
            const pos = pathAt(MODELS[1].path, bp.u - k * 0.02);
            if (Math.abs(pos[0]) > 0.95) continue;
            const scr = lastPj.pj([pos[0], pos[1] + bp.oy * 0.5, pos[2] + bp.oz * 0.5], false);
            const al = (1 - k / 3) * (0.14 + 0.26 * pulse) * dA[1];
            ctx.fillStyle = "rgba(" + INK + "," + al.toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(scr[0], scr[1], (1.8 - k * 0.4) * scr[2], 0, 7); ctx.fill();
          }
        }
        /* pulse strip along the bottom: sin²-systole traced across time */
        const wy = H * 0.90, amp = H * 0.035, span = W * 0.30, x0 = W * 0.06;
        ctx.strokeStyle = "rgba(" + TEAL + "," + (0.35 * dA[1]).toFixed(3) + ")";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let px = 0; px <= span; px += 3) {
          const pt = Math.pow(Math.max(Math.sin((t - (span - px) * 6) * 0.00754), 0), 2);
          const yy = wy - pt * amp;
          px ? ctx.lineTo(x0 + px, yy) : ctx.moveTo(x0 + px, yy);
        }
        ctx.stroke();
      }

      /* axis triad, bottom-left — one instrument shared by every bench,
         rotating with the live model */
      if (lastPj) {
        const tx = W * 0.055, ty = H * 0.88, L = Math.min(W, H) * 0.045;
        const cy2 = Math.cos(lastRot.y), sy2 = Math.sin(lastRot.y);
        const cx2 = Math.cos(lastRot.x), sx2 = Math.sin(lastRot.x);
        const ax = (p3) => {
          const x1 = p3[0] * cy2 + p3[2] * sy2, z1 = -p3[0] * sy2 + p3[2] * cy2;
          const y1 = p3[1] * cx2 - z1 * sx2;
          return [tx + x1 * L, ty + y1 * L];
        };
        ctx.lineWidth = 1;
        ctx.font = "10px 'Geist Mono', monospace";
        const axes = [[[1, 0, 0], "x"], [[0, -1, 0], "y"], [[0, 0, 1], "z"]];
        for (const [dir, name] of axes) {
          const e = ax(dir);
          ctx.strokeStyle = "rgba(" + INK + ",0.34)";
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(e[0], e[1]); ctx.stroke();
          ctx.fillStyle = "rgba(" + INK + ",0.5)";
          ctx.fillText(name, e[0] + 3, e[1] + 3);
        }
      }
    };

    /* ---- phase swap: environments + rail + stage tint ---- */
    let cIdx = -1;
    const setIdx = (idx) => {
      if (idx === cIdx) return;
      cIdx = idx;
      envs.forEach((c, i) => c.classList.toggle("is-active", i === idx));
      railStops.forEach((b, i) => b.classList.toggle("active", i === idx));
      if (stage) stage.dataset.phase = String(idx);
    };

    /* real wire-edge counts off the actual models, written into the
       environments that show stats (no invented numbers) */
    spec.querySelectorAll("[data-spec-edges]").forEach((el) => {
      const mi = +el.dataset.specEdges;
      let segs = 0;
      for (const g of MODELS[mi].groups) {
        if (!g.pl) continue;
        for (const pl of g.pl) segs += Math.max(pl.length - 1, 0);
      }
      el.textContent = segs.toLocaleString();
    });

    if (reduce || !ctx) {
      /* static fallback: unpin the stage, show all four environments, draw specimen 01 once */
      spec.classList.add("spec--static");
      if (ctx) { build(); drawFrame(0, 0, 0, 0.125); }
    } else {
      build();

      /* debug override for headless verification: ?specp=0.375 pins the scrub */
      const dbgP = parseFloat(new URLSearchParams(location.search).get("specp"));
      let p = 0;
      const onScroll = () => {
        if (!isNaN(dbgP)) { p = clamp(dbgP, 0, 1); return; }
        const r = spec.getBoundingClientRect();
        const scrollable = spec.offsetHeight - window.innerHeight;
        p = clamp(-r.top / Math.max(scrollable, 1), 0, 1);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();

      let running = false, rafId = 0, lastT = 0;
      const loop = (t) => {
        if (!running) return;
        const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;
        let s = 0;
        for (let b = 1; b < 4; b++) s += sstep((p - (b * 0.25 - MW / 2)) / MW);
        setIdx(Math.round(s));
        drawFrame(s, t, dt, p);
        rafId = requestAnimationFrame(loop);
      };
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !running) {
            running = true; lastT = performance.now();
            rafId = requestAnimationFrame(loop);
          } else if (!e.isIntersecting && running) {
            running = false; cancelAnimationFrame(rafId);
          }
        });
      });
      io.observe(spec);

      // rail stops jump to the middle of that specimen's plateau
      railStops.forEach((btn) => btn.addEventListener("click", () => {
        const i = +btn.dataset.specGo;
        const scrollable = spec.offsetHeight - window.innerHeight;
        const top = spec.getBoundingClientRect().top + window.scrollY;
        const target = top + scrollable * (i * 0.25 + 0.125);
        if (window.__lenis) window.__lenis.scrollTo(target, { duration: 1.2 });
        else window.scrollTo({ top: target, behavior: "smooth" });
      }));

      let rsT = 0;
      window.addEventListener("resize", () => {
        clearTimeout(rsT);
        rsT = setTimeout(() => { build(); onScroll(); }, 120);
      });
    }
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
