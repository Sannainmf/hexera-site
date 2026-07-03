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
    const centerTele = ring.querySelector("[data-ring-tele]");
    const tails = Array.from(ring.querySelectorAll(".ring-tail"));
    const TAIL_DEG = [30, 19, 9];   // arc length per tail layer, in degrees
    const glyphs = Array.from(ring.querySelectorAll(".ring-glyph .glyph"));
    const nodePulse = ring.querySelector(".ring-nodepulse");
    const spoke = ring.querySelector(".ring-spoke");
    const logLines = Array.from(ring.querySelectorAll(".ring-log__ln"));
    const NODE_POS = [[200, 50], [350, 200], [200, 350], [50, 200]];
    /* run log copy: present-tense while running, past-tense result + duration once done */
    const LOG = [
      { run: "opening cad · sealing gaps", done: "geometry sealed · 2.4s" },
      { run: "growing boundary layers", done: "prisms at y+ 1.0 · 14.9s" },
      { run: "grading skew & ortho", done: "2 weak cells re-meshed · 6.1s" },
      { run: "packing solver deck", done: "exported .cgns · 1.8s" },
    ];
    const statBar = ring.querySelector("[data-ring-bar]");
    const statCells = ring.querySelector("[data-ring-cells]");
    const statQual = ring.querySelector("[data-ring-quality]");
    const statTime = ring.querySelector("[data-ring-time]");

    /* ---- centre glyph geometry: a true NACA 0012, computed not drawn ----
       cosine-spaced stations, thickness from the NACA formula, boundary-layer
       shells offset along exact vertex normals — the same recipe a real
       structured mesher uses, so nothing crosses or misaligns */
    const glyphRoot = ring.querySelector(".ring-glyph");
    if (glyphRoot) {
      const SVGNS = "http://www.w3.org/2000/svg";
      const CHX = 126, CHY = 152, CHORD = 154, THICK = 1.9;
      const M = 36;
      const yt = (t) => 5 * 0.12 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);
      const upper = [], lower = [];
      for (let i = 0; i <= M; i++) {
        const xc = 0.5 * (1 - Math.cos(Math.PI * i / M));   // cosine spacing packs points at LE/TE
        const y = yt(xc) * CHORD * THICK;
        upper.push([CHX + xc * CHORD, CHY - y]);
        lower.push([CHX + xc * CHORD, CHY + y]);
      }
      // closed loop: TE → upper surface → LE → lower surface (Z closes back to TE)
      const outline = upper.slice().reverse().concat(lower.slice(1, M));
      const toPath = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";
      const nrm = outline.map((p, i) => {
        const a = outline[(i - 1 + outline.length) % outline.length];
        const b = outline[(i + 1) % outline.length];
        const tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        return [-ty / l, tx / l];   // tangent rotated to point outward for this winding
      });
      const shellPts = (d) => outline.map((p, i) => [p[0] + nrm[i][0] * d, p[1] + nrm[i][1] * d]);
      const foilD = toPath(outline);
      glyphRoot.querySelectorAll(".g-foil, .g0-broken, .g0-heal").forEach((el) => el.setAttribute("d", foilD));
      // ingest: gap markers sit exactly on the skin
      const gapsG = glyphRoot.querySelector(".g0-gaps");
      if (gapsG) [10, 28, 52].forEach((i) => {
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("class", "g0-gap");
        c.setAttribute("cx", outline[i][0].toFixed(1));
        c.setAttribute("cy", outline[i][1].toFixed(1));
        c.setAttribute("r", "2.6");
        gapsG.appendChild(c);
      });
      // mesh: three exact offset shells + normals through them
      const SHELLS = [4, 8.5, 14];
      const shells = SHELLS.map(shellPts);
      const shellsG = glyphRoot.querySelector(".g1-shells");
      if (shellsG) shells.forEach((pts, k) => {
        const path = document.createElementNS(SVGNS, "path");
        path.setAttribute("d", toPath(pts));
        path.style.setProperty("--i", k);
        shellsG.appendChild(path);
      });
      const normalsG = glyphRoot.querySelector(".g1-normals");
      if (normalsG) {
        let n = 0;
        for (let i = 2; i < outline.length - 1; i += 3) {
          const ln = document.createElementNS(SVGNS, "line");
          ln.setAttribute("x1", outline[i][0].toFixed(1));
          ln.setAttribute("y1", outline[i][1].toFixed(1));
          ln.setAttribute("x2", shells[2][i][0].toFixed(1));
          ln.setAttribute("y2", shells[2][i][1].toFixed(1));
          ln.style.setProperty("--i", n++);
          normalsG.appendChild(ln);
        }
      }
      // verify: real mesh cells — quads between the first two shells
      const cellsG = glyphRoot.querySelector(".g2-cells");
      if (cellsG) {
        const quads = [];
        for (let i = 4; i <= 30; i += 4) quads.push(i);          // upper surface
        for (let i = 40; i <= 66; i += 4) quads.push(i);         // lower surface
        const cells = quads.map((i) => {
          const pts = [shells[0][i], shells[1][i], shells[1][i + 2], shells[0][i + 2]];
          return { pts, x: (pts[0][0] + pts[2][0]) / 2 };
        }).sort((a, b) => a.x - b.x);                            // grade in behind the scan gate
        cells.forEach((cell, k) => {
          const poly = document.createElementNS(SVGNS, "polygon");
          poly.setAttribute("points", cell.pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "));
          poly.style.setProperty("--i", k);
          if (k === 4 || k === 9) poly.setAttribute("class", "flag");
          cellsG.appendChild(poly);
        });
      }
    }
    const phaseNames = phaseItems.map((el) => (el.querySelector("[data-phase-name]") || el).textContent.trim());

    const CX = 200, CY = 200, R = 150;
    const CIRC = 2 * Math.PI * R;
    if (prog) { prog.style.strokeDasharray = CIRC; prog.style.strokeDashoffset = CIRC; }

    /* each minor tick's position as degrees clockwise from the top, so the
       sweep can light them up in its wake */
    const tickEls = Array.from(ring.querySelectorAll(".ring-tick--min")).map((el) => {
      const a = Math.atan2(parseFloat(el.getAttribute("y1")) - CY, parseFloat(el.getAttribute("x1")) - CX) * 180 / Math.PI;
      return { el, deg: (a + 90 + 360) % 360 };
    });

    /* one-line instrument readout per phase, under the counter —
       each reads as "what the agent just did" */
    const TELE = [
      "gaps healed · walls tagged",
      "boundary layers grown · y+ 1.0",
      "skew graded · weak cells re-meshed",
      "packed solver-ready · .cgns",
    ];

    /* terminal-style decode: characters resolve left-to-right into the target */
    const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+·/";
    const scrambleTo = (el, str) => {
      if (reduce) { el.textContent = str; return; }
      const t0 = performance.now(), dur = 420;
      const gen = (el._scrambleGen = (el._scrambleGen || 0) + 1);
      const tick = (t) => {
        if (el._scrambleGen !== gen) return;   // superseded by a newer decode
        const k = Math.min((t - t0) / dur, 1);
        const n = Math.floor(k * str.length);
        let tail = "";
        for (let i = n; i < str.length; i++) tail += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
        el.textContent = str.slice(0, n) + tail;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // rAF stalls in throttled/background tabs — guarantee the final text lands
      setTimeout(() => { if (el._scrambleGen === gen) el.textContent = str; }, dur + 80);
    };

    let phaseIdx = -1;
    const setPhase = (idx) => {
      if (idx === phaseIdx) return;
      phaseIdx = idx;
      phaseItems.forEach((el, i) => el.classList.toggle("active", i === idx));
      tabs.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodes.forEach((el, i) => el.classList.toggle("active", i === idx));
      nodeLabels.forEach((el, i) => el.classList.toggle("active", i === idx));
      if (centerWord && phaseNames[idx]) scrambleTo(centerWord, phaseNames[idx]);
      if (centerCount) centerCount.textContent = String(idx + 1).padStart(2, "0") + " / " + String(N).padStart(2, "0");
      if (centerTele && TELE[idx]) scrambleTo(centerTele, TELE[idx]);
      glyphs.forEach((el, i) => el.classList.toggle("on", i === idx));
      logLines.forEach((el, i) => {
        el.classList.toggle("done", i < idx);
        el.classList.toggle("run", i === idx);
        const st = el.querySelector(".st"), tx = el.querySelector(".tx");
        if (st) st.textContent = i < idx ? "✓" : i === idx ? "▶" : "·";
        if (tx && LOG[i]) {
          const target = i < idx ? LOG[i].done : i === idx ? LOG[i].run : "queued";
          if (tx.textContent !== target) scrambleTo(tx, target);
        }
      });
      if (nodePulse && NODE_POS[idx]) {
        nodePulse.setAttribute("cx", NODE_POS[idx][0]);
        nodePulse.setAttribute("cy", NODE_POS[idx][1]);
      }
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
      if (spoke) {
        spoke.setAttribute("x1", (CX + 96 * Math.cos(ang)).toFixed(2));
        spoke.setAttribute("y1", (CY + 96 * Math.sin(ang)).toFixed(2));
        spoke.setAttribute("x2", (CX + 142 * Math.cos(ang)).toFixed(2));
        spoke.setAttribute("y2", (CY + 142 * Math.sin(ang)).toFixed(2));
      }
      const sweep = p * 360;
      tickEls.forEach((t) => t.el.classList.toggle("lit", sweep > 0.5 && t.deg <= sweep));
      // comet tail: position each arc layer's dash segment to end at the marker
      tails.forEach((el, k) => {
        const seg = Math.max(Math.min(TAIL_DEG[k], sweep), 0.01);
        el.style.strokeDasharray = seg + " " + (360 - seg);
        el.style.strokeDashoffset = String(seg + 90 - sweep);
        el.classList.toggle("live", sweep > 1);
      });
      // run telemetry: cells climb during meshing, quality grades in during verify
      if (statBar) statBar.style.transform = "scaleX(" + p.toFixed(4) + ")";
      if (statCells) {
        let cells;
        if (p < 0.25) cells = Math.round(84200 * (p / 0.25));
        else {
          const q = clamp((p - 0.25) / 0.4, 0, 1);
          const s = q * q * (3 - 2 * q);
          cells = Math.round(84200 + (12418304 - 84200) * s);
        }
        statCells.textContent = cells.toLocaleString("en-US");
      }
      if (statQual) {
        if (p < 0.5) statQual.textContent = "—";
        else {
          const q = clamp((p - 0.5) / 0.2, 0, 1);
          statQual.textContent = (91 + 8.8 * q).toFixed(1) + "% pass";
        }
      }
      if (statTime) {
        const secs = Math.round(p * 47);
        statTime.textContent = "00:" + String(secs).padStart(2, "0");
      }
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
    let ambPad = 0, loopH = 0;
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
      // INFINITE LOOP: a slow, continuous translate that wraps at one set height, so
      // the list never reaches an end — it keeps scrolling even as the section exits.
      const loopRate = 0.30;
      const ty = loopH > 0 ? -(scrolled * loopRate) % loopH : 0;
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

  /* ---------- Industries: the specimen chamber ----------
     One canvas mesh pinned in a sticky wind-tunnel stage. Scroll drives a
     scan gate that re-meshes the specimen from one industry's geometry to
     the next: airfoil → vessel → gem → coupe. The copy deck, HUD readouts,
     ghost index and progress rail swap in step. Every outline is computed
     (NACA maths, tube offsets, hand-set silhouettes), resampled to one
     shared point count, and morphed point-wise behind the moving gate. */
  const spec = document.querySelector("[data-spec]");
  if (spec) {
    const canvas = spec.querySelector("[data-spec-canvas]");
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    const cards = Array.from(spec.querySelectorAll("[data-spec-card]"));
    const ghost = spec.querySelector("[data-spec-ghost]");
    const hud = {
      id: spec.querySelector("[data-spec-id]"),
      name: spec.querySelector("[data-spec-name]"),
      status: spec.querySelector("[data-spec-status]"),
      regime: spec.querySelector("[data-spec-regime]"),
      out: spec.querySelector("[data-spec-out]"),
    };
    const railFill = spec.querySelector("[data-spec-fill]");
    const railStops = Array.from(spec.querySelectorAll("[data-spec-go]"));

    const N = 220;                                   // shared outline point count
    const GOLD = "255,186,0", TEAL = "15,182,172";
    const sstep = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * k * (k * (k * 6 - 15) + 10));
    const MW = 0.11;                                 // morph window, in total-scroll units

    /* ---- specimen outlines, unit space (y down) ---- */
    // 01 · a true NACA 0012, cosine-spaced (thickness lifted a touch for stage presence)
    const rawAirfoil = () => {
      const M = 64, yt = (t) => 5 * 0.12 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);
      const up = [], lo = [];
      for (let i = 0; i <= M; i++) {
        const x = 0.5 * (1 - Math.cos(Math.PI * i / M));
        const y = yt(x) * 1.5;
        up.push([x, 0.5 - y]); lo.push([x, 0.5 + y]);
      }
      return up.slice().reverse().concat(lo.slice(1, M));
    };
    // 02 · curved vessel with a saccular aneurysm bulging off the top wall
    const rawVessel = () => {
      const M = 72, C = [];
      for (let i = 0; i <= M; i++) {
        const t = i / M;
        C.push([0.03 + t * 0.94, 0.56 + 0.09 * Math.sin((t - 0.45) * 4.2)]);
      }
      const up = [], lo = [];
      for (let i = 0; i <= M; i++) {
        const t = i / M;
        const a = C[Math.max(i - 1, 0)], b = C[Math.min(i + 1, M)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        const cap = Math.min(1, Math.min(t, 1 - t) * 10 + 0.3);     // blunt open ends
        const bulge = 0.16 * Math.exp(-Math.pow((t - 0.56) / 0.10, 2));
        const ru = (0.085 + bulge) * cap, rl = (0.085 + bulge * 0.12) * cap;
        up.push([C[i][0] - nx * ru, C[i][1] - ny * ru]);
        lo.push([C[i][0] + nx * rl, C[i][1] + ny * rl]);
      }
      return up.concat(lo.reverse().slice(1, M));
    };
    // 03 · brilliant-cut gem silhouette; facet wireframe drawn as deco when settled
    const GEM_V = [
      [0.500, 0.960], [0.115, 0.470], [0.075, 0.400], [0.160, 0.235],
      [0.330, 0.130], [0.670, 0.130], [0.840, 0.235], [0.925, 0.400], [0.885, 0.470],
    ];
    const GEM_LINES = [[0, 2], [0, 3], [0, 6], [0, 7], [1, 8], [4, 2], [5, 7]];
    // 04 · coupe silhouette with wheel arches cut into the rocker line
    const rawCar = () => {
      const P = [
        [0.030, 0.755], [0.020, 0.640], [0.075, 0.565], [0.300, 0.520],
        [0.415, 0.395], [0.520, 0.360], [0.655, 0.372], [0.790, 0.455],
        [0.885, 0.492], [0.938, 0.487], [0.952, 0.542], [0.965, 0.660],
        [0.940, 0.755], [0.905, 0.800],
      ];
      const arch = (cx) => {
        const a = [];
        for (let k = 0; k <= 10; k++) {
          const t = (Math.PI * k) / 10;
          a.push([cx + 0.085 * Math.cos(t), 0.800 - 0.085 * Math.sin(t)]);
        }
        return a;
      };
      return P.concat(arch(0.775), [[0.330, 0.800]], arch(0.245), [[0.085, 0.800]]);
    };
    const CAR_WHEELS = [[0.245, 0.800, 0.058], [0.775, 0.800, 0.058]];

    /* ---- geometry utils ---- */
    const bbOf = (pts) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      return { x0, y0, x1, y1 };
    };
    const resample = (pts, n) => {                   // closed polyline → n evenly spaced points
      const m = pts.length, cum = [0];
      let tot = 0;
      for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % m];
        tot += Math.hypot(b[0] - a[0], b[1] - a[1]);
        cum.push(tot);
      }
      const out = []; let seg = 0;
      for (let k = 0; k < n; k++) {
        const d = (tot * k) / n;
        while (seg < m - 1 && cum[seg + 1] < d) seg++;
        const a = pts[seg], b = pts[(seg + 1) % m];
        const u = (d - cum[seg]) / Math.max(cum[seg + 1] - cum[seg], 1e-9);
        out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      }
      return out;
    };
    const orient = (pts) => {                        // one shared winding for clean morphs
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p[0] * q[1] - q[0] * p[1];
      }
      return a < 0 ? pts.slice().reverse() : pts;
    };
    const fitTf = (raw, rect) => {                   // contain + centre a raw outline in a px rect
      const bb = bbOf(raw);
      const s = Math.min(rect.w / Math.max(bb.x1 - bb.x0, 1e-6), rect.h / Math.max(bb.y1 - bb.y0, 1e-6));
      const ox = rect.x + (rect.w - (bb.x1 - bb.x0) * s) / 2 - bb.x0 * s;
      const oy = rect.y + (rect.h - (bb.y1 - bb.y0) * s) / 2 - bb.y0 * s;
      return { map: (p) => [p[0] * s + ox, p[1] * s + oy], s };
    };
    const bestOffset = (A, B) => {                   // start-index rotation minimising point travel
      let best = 0, bestD = Infinity;
      for (let off = 0; off < N; off += 2) {
        let d = 0;
        for (let i = 0; i < N; i += 5) {
          const a = A[i], b = B[(i + off) % N];
          const dx = a[0] - b[0], dy = a[1] - b[1];
          d += dx * dx + dy * dy;
          if (d >= bestD) break;
        }
        if (d < bestD) { bestD = d; best = off; }
      }
      return best;
    };

    /* ---- build: size the canvas, fit + resample + align all four specimens ---- */
    let W = 0, H = 0, shapes = [], deco = null;
    const PTS = Array.from({ length: N }, () => [0, 0]);
    const NRM = Array.from({ length: N }, () => [0, 0]);
    const RJ = Array.from({ length: N }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1]);
    const streaks = [];
    const initStreaks = () => {
      streaks.length = 0;
      for (let i = 0; i < 26; i++) streaks.push({
        y: 0.08 + 0.84 * Math.random(), x: Math.random() * 1.4 - 0.2,
        v: 0.10 + Math.random() * 0.10, l: 0.05 + Math.random() * 0.05,
        a: 0.05 + Math.random() * 0.07,
      });
    };
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rect = { x: W * 0.13, y: H * 0.16, w: W * 0.74, h: H * 0.68 };
      const raws = [rawAirfoil(), rawVessel(), GEM_V.slice(), rawCar()];
      const tfs = raws.map((raw) => fitTf(raw, rect));
      shapes = raws.map((raw, i) => {
        const pts = orient(resample(raw.map(tfs[i].map), N));
        return { pts, bb: bbOf(pts) };
      });
      for (let i = 1; i < shapes.length; i++) {
        const off = bestOffset(shapes[i - 1].pts, shapes[i].pts);
        if (off) shapes[i].pts = shapes[i].pts.slice(off).concat(shapes[i].pts.slice(0, off));
      }
      deco = {
        chord: [tfs[0].map([0, 0.5]), tfs[0].map([1, 0.5])],
        gemLines: GEM_LINES.map(([a, b]) => [tfs[2].map(GEM_V[a]), tfs[2].map(GEM_V[b])]),
        gemVerts: GEM_V.map((v) => tfs[2].map(v)),
        wheels: CAR_WHEELS.map((w) => {
          const c = tfs[3].map([w[0], w[1]]);
          return { x: c[0], y: c[1], r: w[2] * tfs[3].s };
        }),
        groundY: tfs[3].map([0, 0.800])[1] + CAR_WHEELS[0][2] * tfs[3].s + 3,
      };
      initStreaks();
    };

    /* ---- one frame: streaks → shells → outline → gate → per-phase deco ---- */
    const drawFrame = (s, t, dt) => {
      const iA = Math.min(Math.floor(s), 2);
      const f = clamp(s - iA, 0, 1);
      const A = shapes[iA], B = shapes[iA + 1];
      const morph = f > 0.001 && f < 0.999;
      const bb = {
        x0: Math.min(A.bb.x0, B.bb.x0), y0: Math.min(A.bb.y0, B.bb.y0),
        x1: Math.max(A.bb.x1, B.bb.x1), y1: Math.max(A.bb.y1, B.bb.y1),
      };
      const dA = [0, 1, 2, 3].map((i) => clamp(1 - Math.abs(s - i) * 2.4, 0, 1));
      ctx.clearRect(0, 0, W, H);

      // ambient tunnel streaks, bowing around whatever is in the chamber
      const bowAt = (x, y, cy) => {
        if (x < bb.x0 - 60 || x > bb.x1 + 60) return 0;
        const u = clamp((x - (bb.x0 - 60)) / (bb.x1 - bb.x0 + 120), 0, 1);
        const dyc = y - cy;
        const fall = Math.max(0, 1 - Math.abs(dyc) / (H * 0.42));
        return Math.sign(dyc || 1) * Math.sin(Math.PI * u) * fall * H * 0.06;
      };
      const cyGuess = (bb.y0 + bb.y1) / 2;
      const speedUp = 1 + dA[0] * 0.9 + dA[3] * 0.6;
      for (const st of streaks) {
        st.x += st.v * speedUp * dt;
        if (st.x > 1.15) { st.x = -0.18 - Math.random() * 0.1; st.y = 0.08 + 0.84 * Math.random(); }
        const y = st.y * H, x1 = st.x * W, x0 = x1 - st.l * W;
        ctx.strokeStyle = "rgba(" + TEAL + "," + (st.a * (0.5 + dA[0] * 0.7 + dA[3] * 0.5)).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y + bowAt(x0, y, cyGuess));
        ctx.lineTo(x1, y + bowAt(x1, y, cyGuess));
        ctx.stroke();
      }

      // the specimen hangs in the tunnel with a slow bob
      ctx.save();
      ctx.translate(0, Math.sin(t * 0.0011) * 3);

      // blended outline: points convert behind the gate, with mid-flight scatter
      for (let i = 0; i < N; i++) {
        const a = A.pts[i], b = B.pts[i];
        const nx = ((a[0] + b[0]) * 0.5 - bb.x0) / Math.max(bb.x1 - bb.x0, 1);
        let mk = clamp(f * 1.45 - nx * 0.45, 0, 1);
        mk = mk * mk * (3 - 2 * mk);
        let x = a[0] + (b[0] - a[0]) * mk, y = a[1] + (b[1] - a[1]) * mk;
        if (morph) { const j = Math.sin(Math.PI * mk) * 5; x += RJ[i][0] * j; y += RJ[i][1] * j; }
        PTS[i][0] = x; PTS[i][1] = y;
      }

      // biomedical: the vessel breathes with the pulse
      let cx = 0, cy = 0;
      for (let i = 0; i < N; i++) { cx += PTS[i][0]; cy += PTS[i][1]; }
      cx /= N; cy /= N;
      if (dA[1] > 0.01) {
        const k = 1 + 0.009 * Math.sin(t * 0.0045) * dA[1];
        for (let i = 0; i < N; i++) {
          PTS[i][0] = cx + (PTS[i][0] - cx) * k;
          PTS[i][1] = cy + (PTS[i][1] - cy) * k;
        }
      }

      // outward normals: fixed perpendicular, sign checked at the topmost point
      let minI = 0;
      for (let i = 1; i < N; i++) if (PTS[i][1] < PTS[minI][1]) minI = i;
      for (let i = 0; i < N; i++) {
        const a = PTS[(i - 1 + N) % N], b = PTS[(i + 1) % N];
        const tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        NRM[i][0] = -ty / l; NRM[i][1] = tx / l;
      }
      if (NRM[minI][1] > 0) for (let i = 0; i < N; i++) { NRM[i][0] *= -1; NRM[i][1] *= -1; }

      // boundary-layer shells retract while re-meshing, regrow when locked
      const shellA = 1 - 0.8 * Math.sin(Math.PI * f);
      const sref = Math.min(W, H);
      for (const [dk, al] of [[0.030, 0.30], [0.058, 0.19], [0.092, 0.11]]) {
        ctx.strokeStyle = "rgba(" + TEAL + "," + (al * shellA).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const x = PTS[i][0] + NRM[i][0] * dk * sref, y = PTS[i][1] + NRM[i][1] * dk * sref;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // the skin: gold, glowing
      ctx.save();
      ctx.shadowColor = "rgba(" + GOLD + ",0.55)"; ctx.shadowBlur = 16;
      ctx.strokeStyle = "rgba(" + GOLD + ",0.95)"; ctx.lineWidth = 1.7;
      ctx.beginPath();
      for (let i = 0; i < N; i++) (i ? ctx.lineTo(PTS[i][0], PTS[i][1]) : ctx.moveTo(PTS[i][0], PTS[i][1]));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // mesh vertices on the skin
      ctx.fillStyle = "rgba(" + TEAL + ",0.55)";
      for (let i = 0; i < N; i += 5) {
        ctx.beginPath(); ctx.arc(PTS[i][0], PTS[i][1], 1.3, 0, 7); ctx.fill();
      }

      /* per-industry deco, faded by proximity to its phase */
      // 01 · aero: dashed chord LE→TE
      if (dA[0] > 0.01) {
        ctx.strokeStyle = "rgba(" + GOLD + "," + (0.28 * dA[0]).toFixed(3) + ")";
        ctx.lineWidth = 1; ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.moveTo(deco.chord[0][0], deco.chord[0][1]); ctx.lineTo(deco.chord[1][0], deco.chord[1][1]); ctx.stroke();
        ctx.setLineDash([]);
      }
      // 02 · bio: a bright pulse travelling the vessel wall
      if (dA[1] > 0.01) {
        const head = Math.floor((t * 0.02) % N);
        for (let k = 14; k >= 0; k--) {
          const i = (head - k + N) % N;
          const al = (1 - k / 15) * 0.85 * dA[1];
          ctx.fillStyle = "rgba(" + TEAL + "," + al.toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(PTS[i][0], PTS[i][1], 2.4 - k * 0.09, 0, 7); ctx.fill();
        }
      }
      // 03 · gaming: facet wireframe + highlighted verts (the LOD look)
      if (dA[2] > 0.01) {
        ctx.strokeStyle = "rgba(" + TEAL + "," + (0.30 * dA[2]).toFixed(3) + ")";
        ctx.lineWidth = 1;
        for (const [a, b] of deco.gemLines) {
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        ctx.fillStyle = "rgba(" + GOLD + "," + (0.8 * dA[2]).toFixed(3) + ")";
        for (const v of deco.gemVerts) { ctx.beginPath(); ctx.arc(v[0], v[1], 2, 0, 7); ctx.fill(); }
      }
      // 04 · auto: wheels with slow-spinning spokes + a speed-dash ground line
      if (dA[3] > 0.01) {
        for (const wl of deco.wheels) {
          ctx.strokeStyle = "rgba(" + GOLD + "," + (0.55 * dA[3]).toFixed(3) + ")";
          ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(wl.x, wl.y, wl.r, 0, 7); ctx.stroke();
          const a0 = t * 0.004;
          for (let k = 0; k < 5; k++) {
            const a = a0 + (k * Math.PI * 2) / 5;
            ctx.beginPath(); ctx.moveTo(wl.x, wl.y);
            ctx.lineTo(wl.x + Math.cos(a) * wl.r * 0.82, wl.y + Math.sin(a) * wl.r * 0.82);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = "rgba(" + TEAL + "," + (0.28 * dA[3]).toFixed(3) + ")";
        ctx.lineWidth = 1; ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -((t * 0.12) % 24);
        ctx.beginPath(); ctx.moveTo(W * 0.06, deco.groundY); ctx.lineTo(W * 0.94, deco.groundY); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }

      // the scan gate: a teal wall sweeping the conversion across the chamber
      if (morph) {
        const gx = bb.x0 - 24 + (bb.x1 - bb.x0 + 48) * f;
        const gA = clamp(Math.sin(Math.PI * f) * 1.8, 0, 1);
        const gy0 = H * 0.07, gy1 = H * 0.93;
        const grad = ctx.createLinearGradient(gx - 70, 0, gx, 0);
        grad.addColorStop(0, "rgba(" + TEAL + ",0)");
        grad.addColorStop(1, "rgba(" + TEAL + "," + (0.10 * gA).toFixed(3) + ")");
        ctx.fillStyle = grad;
        ctx.fillRect(gx - 70, gy0, 70, gy1 - gy0);
        ctx.strokeStyle = "rgba(" + TEAL + "," + (0.8 * gA).toFixed(3) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx, gy1); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx - 7, gy0); ctx.lineTo(gx + 7, gy0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx - 7, gy1); ctx.lineTo(gx + 7, gy1); ctx.stroke();
        // cells re-knitting right at the gate
        for (let i = 0; i < N; i += 2) {
          const d = Math.abs(PTS[i][0] - gx);
          if (d < 34) {
            ctx.fillStyle = "rgba(" + GOLD + "," + ((1 - d / 34) * gA).toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(PTS[i][0], PTS[i][1], 2.1, 0, 7); ctx.fill();
          }
        }
      }

      ctx.restore();
    };

    /* ---- HUD decode: characters resolve left-to-right into the target ---- */
    const CHARS = "abcdefghjkmnpqrstuvwxyz0123456789·";
    const decode = (el, str) => {
      if (!el || el.textContent === str) return;
      if (reduce) { el.textContent = str; return; }
      const t0 = performance.now(), dur = 380;
      const gen = (el._dg = (el._dg || 0) + 1);
      const tick = (t) => {
        if (el._dg !== gen) return;
        const k = Math.min((t - t0) / dur, 1);
        const n = Math.floor(k * str.length);
        let tail = "";
        for (let i = n; i < str.length; i++) tail += str[i] === " " ? " " : CHARS[(Math.random() * CHARS.length) | 0];
        el.textContent = str.slice(0, n) + tail;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => { if (el._dg === gen) el.textContent = str; }, dur + 80);
    };

    /* ---- phase swap: cards, rail, HUD, ghost index ---- */
    let cIdx = -1, statusBusy = null, ghostGen = 0;
    const setIdx = (idx) => {
      if (idx === cIdx) return;
      cIdx = idx;
      cards.forEach((c, i) => c.classList.toggle("is-active", i === idx));
      railStops.forEach((b, i) => b.classList.toggle("active", i === idx));
      const d = cards[idx] ? cards[idx].dataset : null;
      if (d) {
        decode(hud.id, d.sid); decode(hud.name, d.sname);
        decode(hud.regime, d.regime); decode(hud.out, d.out);
      }
      if (ghost) {
        const gen = ++ghostGen;
        ghost.classList.add("swap");
        setTimeout(() => {
          if (gen !== ghostGen) return;
          ghost.textContent = "0" + (idx + 1);
          ghost.classList.remove("swap");
        }, 230);
      }
    };
    const setBusy = (b) => {
      if (b === statusBusy || !hud.status) return;
      statusBusy = b;
      hud.status.classList.toggle("busy", b);
      hud.status.textContent = b ? "re-meshing" : "mesh locked";
    };

    if (reduce || !ctx) {
      /* static fallback: unpin the stage, show all four cards, draw specimen 01 once */
      spec.classList.add("spec--static");
      if (ctx) { build(); drawFrame(0, 0, 0); }
    } else {
      build();

      let p = 0;
      const onScroll = () => {
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
        // shape position: plateaus at 0..3, smootherstep ramps across each boundary
        let s = 0;
        for (let b = 1; b < 4; b++) s += sstep((p - (b * 0.25 - MW / 2)) / MW);
        setIdx(Math.round(s));
        const frac = s - Math.floor(s);
        setBusy(frac > 0.02 && frac < 0.98);
        if (railFill) railFill.style.transform = "scaleY(" + p.toFixed(4) + ")";
        drawFrame(s, t, dt);
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
