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

    /* ---- wind tunnel background: potential flow around a cylinder ----
       the dial is treated as a body in a uniform stream; streamlines are
       integrated from the exact analytic velocity field (u − iv = 1 − a²/z²),
       so they bend and part around the ring the way a real flow would */
    const flowSvg = ring.querySelector(".ring-flow");
    if (flowSvg) {
      const SVGNS = "http://www.w3.org/2000/svg";
      const buildFlow = () => {
        const host = flowSvg.parentElement;
        const dial = ring.querySelector(".ring-dial");
        if (!host || !dial) return;
        const w = host.clientWidth, h = host.clientHeight;
        if (w < 10 || h < 10) return;
        flowSvg.setAttribute("viewBox", "0 0 " + w + " " + h);
        const hr = host.getBoundingClientRect(), dr = dial.getBoundingClientRect();
        const cx = dr.left - hr.left + dr.width / 2;
        const cy = dr.top - hr.top + dr.height / 2;
        const a = Math.max(dr.width, dr.height) / 2 + 26;   // body radius: ring + clearance
        const vel = (x, y) => {
          const dx = x - cx, dy = y - cy;
          const r2 = dx * dx + dy * dy;
          if (r2 < 1) return [1, 0];
          const f = (a * a) / (r2 * r2);
          return [1 - f * (dx * dx - dy * dy), -f * 2 * dx * dy];
        };
        // mask follows the dial so the flow lives around the body, not over the copy
        flowSvg.style.setProperty("--fcx", cx.toFixed(0) + "px");
        flowSvg.style.setProperty("--fcy", cy.toFixed(0) + "px");
        while (flowSvg.firstChild) flowSvg.removeChild(flowSvg.firstChild);
        const NL = 12, STEP = 7;
        for (let k = 0; k < NL; k++) {
          const y0 = (k + 0.5) * (h / NL) + (k % 2 ? 3 : -3);
          if (Math.abs(y0 - cy) < 6) continue;               // skip the dead stagnation line
          let px = -30, py = y0, d = "M " + px + " " + py.toFixed(1);
          for (let s = 0; s < 340 && px < w + 30; s++) {
            const k1 = vel(px, py);
            const k2 = vel(px + k1[0] * STEP * 0.5, py + k1[1] * STEP * 0.5);
            const mx = px + k2[0] * STEP, my = py + k2[1] * STEP;
            const ddx = mx - cx, ddy = my - cy;
            if (ddx * ddx + ddy * ddy < a * a * 0.96) break;  // never draw inside the body
            px = mx; py = my;
            d += " L " + px.toFixed(1) + " " + py.toFixed(1);
          }
          const path = document.createElementNS(SVGNS, "path");
          path.setAttribute("d", d);
          path.setAttribute("id", "ringflow-" + k);
          flowSvg.appendChild(path);
          // tracer particle gliding along every other streamline, wind-tunnel style
          if (k % 2 === 0) {
            const tr = document.createElementNS(SVGNS, "circle");
            tr.setAttribute("class", "ring-tracer" + (k === 6 ? " ring-tracer--gold" : ""));
            tr.setAttribute("r", "1.8");
            const mo = document.createElementNS(SVGNS, "animateMotion");
            mo.setAttribute("dur", Math.max(7, path.getTotalLength() / 90).toFixed(1) + "s");
            mo.setAttribute("repeatCount", "indefinite");
            mo.setAttribute("begin", (-(k * 1.7)).toFixed(1) + "s");
            const mp = document.createElementNS(SVGNS, "mpath");
            mp.setAttribute("href", "#ringflow-" + k);
            mo.appendChild(mp);
            tr.appendChild(mo);
            flowSvg.appendChild(tr);
          }
        }
      };
      buildFlow();
      window.addEventListener("load", buildFlow);   // rebuild once layout/fonts settle
      let flowTmr;
      window.addEventListener("resize", () => { clearTimeout(flowTmr); flowTmr = setTimeout(buildFlow, 150); });
    }

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
     Four REAL 3D wireframe models pinned in a sticky wind-tunnel stage,
     each CAD'd procedurally: a lofted swept wing, a deployed coronary
     stent, a low-poly terrain tile, and a vented brake rotor. Scroll
     drives a scan gate that wipes one finished mesh into the next; the
     copy deck, HUD readouts, ghost index and rail swap in step. */
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

    const GOLD = "255,186,0", TEAL = "15,182,172";
    const sstep = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * k * (k * (k * 6 - 15) + 10));
    const MW = 0.11;                                 // gate window, in total-scroll units

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
      // Mach cone: conical shock lines off the tip, flaring downstream
      const shock = [];
      const tanB = Math.tan(0.42);
      for (const ang of [0.5, 1.6, 2.7, 3.8, 4.9, 6.0]) {
        const seg = [[L0, 0, 0]];
        for (const dd of [0.5, 1.0, 1.5, 2.1]) {
          const rr = dd * tanB;
          seg.push([L0 + dd, rr * Math.cos(ang), rr * Math.sin(ang)]);
        }
        shock.push(seg);
      }
      return {
        scale: 0.42, tilt: 0.52, sweep: 0.85, wob: 0.05,
        groups: [
          { pl: shock, col: TEAL, a: 0.14, w: 0.8, flat: true },
          { pl: fins, col: TEAL, a: 0.22, w: 0.8, flat: true },
          { pl: lattice, col: TEAL, a: 0.26, w: 0.8, flat: true },
          { pl: accents, col: GOLD, a: 0.85, w: 1.4, glow: true, track: true },
        ],
      };
    };

    // 02 · coronary stent — dense laser-cut lattice: 13 crown rings in
    //      antiphase with the peaks nearly kissing (gap ≈ strut width scale),
    //      S-bridges on alternating crowns, inside a quiet artery tube
    const buildStent = () => {
      const R = 0.30, LEN = 1.9, NR = 13, PK = 8, A = 0.052, KS = 120;
      const bend = (x) => 0.15 * x * x - 0.09;
      const gap = LEN / (NR - 1);
      const rings = [], bridges = [];
      for (let i = 0; i < NR; i++) {
        const x0 = -LEN / 2 + gap * i;
        const flip = (i % 2) * Math.PI;
        const ring = [];
        for (let k = 0; k <= KS; k++) {
          const th = (k / KS) * Math.PI * 2;
          const x = x0 + A * Math.sin(th * PK + flip);
          ring.push([x, R * Math.cos(th) + bend(x), R * Math.sin(th)]);
        }
        rings.push(ring);
      }
      for (let i = 0; i < NR - 1; i++) {
        for (let b = 0; b < 4; b++) {
          const th = ((b + (i % 2) * 0.5) / 4) * Math.PI * 2 + Math.PI / PK;
          const xa = -LEN / 2 + gap * i + A * Math.sin(th * PK + (i % 2) * Math.PI);
          const xb = -LEN / 2 + gap * (i + 1) + A * Math.sin(th * PK + ((i + 1) % 2) * Math.PI);
          bridges.push([
            [xa, R * Math.cos(th) + bend(xa), R * Math.sin(th)],
            [xb, R * Math.cos(th) + bend(xb), R * Math.sin(th)],
          ]);
        }
      }
      // the wall mesh ENCAPSULATES the device: the inner surface sits just
      // off the stent (deployed against the wall), ring spacing halves
      // through the stented span, and a sparser outer surface carries the
      // wall thickness — intima tight on the device, adventitia around it
      const VRi = R * 1.10, VRo = R * 1.30, vessel = [], outer = [];
      const vring = (xr, VR2, arr) => {
        const ring = [];
        for (let k = 0; k <= 28; k++) {
          const th = (k / 28) * Math.PI * 2;
          ring.push([xr, VR2 * Math.cos(th) + bend(xr), VR2 * Math.sin(th)]);
        }
        arr.push(ring);
      };
      for (let i = 0; i <= 48; i++) {
        const xr = -0.95 + (i / 48) * 1.9;
        vring(xr, VRi, vessel);
        if (Math.abs(xr) < 0.62 && i < 48) vring(xr + 1.9 / 96, VRi, vessel);
        if (i % 3 === 0) vring(xr, VRo, outer);
      }
      for (let j = 0; j < 24; j++) {
        const th = (j / 24) * Math.PI * 2;
        const rail = [];
        for (let k = 0; k <= 48; k++) {
          const x = -0.95 + (k / 48) * 1.9;
          rail.push([x, VRi * Math.cos(th) + bend(x), VRi * Math.sin(th)]);
        }
        vessel.push(rail);
      }
      for (let j = 0; j < 8; j++) {
        const th = (j / 8) * Math.PI * 2;
        const rail = [];
        for (let k = 0; k <= 24; k++) {
          const x = -0.95 + (k / 24) * 1.9;
          rail.push([x, VRo * Math.cos(th) + bend(x), VRo * Math.sin(th)]);
        }
        outer.push(rail);
      }
      const path = [];
      for (let k = 0; k <= 24; k++) {
        const x = -1.02 + (k / 24) * 2.04;
        path.push([x, bend(x), 0]);
      }
      return {
        scale: 0.40, tilt: 0.35, sweep: 0.8, wob: 0.07, path,
        groups: [
          { pl: outer, col: TEAL, a: 0.11, w: 0.8, flat: true },
          { pl: vessel, col: TEAL, a: 0.22, w: 0.8, flat: true },
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

    /* ---- state + ambient particle systems ---- */
    let W = 0, H = 0, sref = 0, lastBB = null, lastPj = null;
    const FP = [];
    const newFP = (anywhere) => ({
      x: anywhere ? Math.random() * W : -10 - Math.random() * 60,
      y: H * (0.05 + 0.90 * Math.random()),
      trail: [],
    });
    const initFlow = () => { FP.length = 0; for (let i = 0; i < 38; i++) FP.push(newFP(true)); };
    const BLOOD = Array.from({ length: 14 }, (_, i) => ({
      u: i / 14, oy: (Math.random() - 0.5) * 0.30, oz: (Math.random() - 0.5) * 0.30,
    }));
    const PL = Array.from({ length: 12 }, () => ({ x: Math.random(), life: Math.random() }));
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
      initFlow();
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
            const cr = Math.round(15 + 240 * mix), cg2 = Math.round(182 + 4 * mix), cb = Math.round(172 - 172 * mix);
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
          // glow = cheap two-pass halo (wide faint + narrow bright); the
          // canvas shadowBlur API is far too slow for long paths
          const passes = g.glow ? [[3.2, 0.20], [1, 1]] : [[1, 1]];
          for (const ps of passes) {
            ctx.lineWidth = g.w * ps[0];
            for (let pi = 0; pi < g.pl.length; pi++) {
              const pl = g.pl[pi];
              let kSum = 0;
              ctx.beginPath();
              for (let k = 0; k < pl.length; k++) {
                const p2 = pj(pl[k], spun);
                kSum += p2[2];
                if (tk) tb(p2);
                k ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1]);
              }
              const dep = clamp(0.45 + (kSum / pl.length - 0.96) * 5, 0.30, 1.15);
              ctx.strokeStyle = "rgba(" + g.col + "," + (g.a * ps[1] * dep * alphaMul).toFixed(3) + ")";
              ctx.stroke();
            }
          }
        }
      }
    };

    /* ---- one frame: flow → model (or gate-wiped pair) → ambient ---- */
    const drawFrame = (s, t, dt, pNow) => {
      const iA = Math.min(Math.floor(s), 2);
      const f = clamp(s - iA, 0, 1);
      const morph = f > 0.001 && f < 0.999;
      const morphAct = Math.sin(Math.PI * f);
      const cur = Math.round(s);
      const dA = [0, 1, 2, 3].map((i) => clamp(1 - Math.abs(s - i) * 2.4, 0, 1));
      ctx.clearRect(0, 0, W, H);

      /* free-stream: particles through potential flow around an ellipse
         fitted to the projected silhouette — they part, pinch and rejoin */
      const flowA = Math.max(dA[0], dA[3]);
      if (flowA > 0.003) {
        const ecx = (lastBB.x0 + lastBB.x1) / 2, ecy = (lastBB.y0 + lastBB.y1) / 2;
        const ea = Math.max((lastBB.x1 - lastBB.x0) * 0.60, 24);
        const eb = Math.max((lastBB.y1 - lastBB.y0) * 0.66, 20);
        const U = sref * 0.26 * dt * (0.7 + flowA * 0.6);
        ctx.lineWidth = 1;
        for (const q of FP) {
          const xp = (q.x - ecx) / ea, yp = (q.y - ecy) / eb;
          const r2 = xp * xp + yp * yp;
          let u = 1, v = 0;
          if (r2 > 1e-4) {
            const r4 = r2 * r2;
            u = 1 - (xp * xp - yp * yp) / r4;
            v = (-2 * xp * yp) / r4;
          }
          if (r2 < 1.10) {
            const rr = Math.sqrt(r2) || 1;
            q.x += (xp / rr) * 90 * dt; q.y += (yp / rr) * 90 * dt;
          }
          const mag = Math.hypot(u, v) || 1;
          if (mag > 2.3) { u = (u / mag) * 2.3; v = (v / mag) * 2.3; }
          if (u < 0.10) u = 0.10;
          q.x += u * U;
          q.y += v * U * (eb / ea);
          q.acc = (q.acc || 0) + dt;
          if (q.acc >= 0.016) {
            q.acc = 0;
            q.trail.unshift([q.x, q.y]);
            if (q.trail.length > 14) q.trail.pop();
          }
          if (q.x > W + 20 || q.y < -20 || q.y > H + 20) {
            const np = newFP(false);
            q.x = np.x; q.y = np.y; q.trail.length = 0;
          }
          for (let k = 0; k + 1 < q.trail.length; k++) {
            ctx.strokeStyle = "rgba(" + TEAL + "," + ((1 - k / 14) * 0.30 * flowA).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(q.trail[k][0], q.trail[k][1]);
            ctx.lineTo(q.trail[k + 1][0], q.trail[k + 1][1]);
            ctx.stroke();
          }
        }
      }

      // rotation sweeps across the plateau, clamps face-on at the gate
      const local = pNow >= 0.999 ? 1 : (pNow % 0.25) / 0.25;
      const sweepLocal = (local - 0.5) * (1 - morphAct);
      const gx = W * 0.06 + W * 0.88 * f;

      if (!morph) {
        drawModel(cur, t, sweepLocal, 1, true);
      } else {
        // the gate wipes the finished old mesh into the finished new one
        ctx.save(); ctx.beginPath(); ctx.rect(gx, -H, W - gx + H * 2, H * 3); ctx.clip();
        drawModel(iA, t, 0, 1 - morphAct * 0.3, f < 0.5);
        ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(-H, -H, gx + H, H * 3); ctx.clip();
        drawModel(iA + 1, t, 0, 1 - morphAct * 0.3, f >= 0.5);
        ctx.restore();
        const gA = clamp(morphAct * 1.8, 0, 1);
        const gy0 = H * 0.06, gy1 = H * 0.94;
        const grad = ctx.createLinearGradient(gx - 70, 0, gx, 0);
        grad.addColorStop(0, "rgba(" + TEAL + ",0)");
        grad.addColorStop(1, "rgba(" + TEAL + "," + (0.10 * gA).toFixed(3) + ")");
        ctx.fillStyle = grad;
        ctx.fillRect(gx - 70, gy0, 70, gy1 - gy0);
        ctx.strokeStyle = "rgba(" + TEAL + "," + (0.8 * gA).toFixed(3) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx, gy0); ctx.lineTo(gx, gy1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx - 7, gy0); ctx.lineTo(gx + 7, gy0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx - 7, gy1); ctx.lineTo(gx + 7, gy1); ctx.stroke();
        for (let i2 = 0; i2 < 26; i2++) {       // re-mesh sparks at the cut
          const yy = H * (0.10 + 0.80 * Math.random());
          const xx = gx + (Math.random() - 0.5) * 26;
          ctx.fillStyle = "rgba(" + (Math.random() < 0.62 ? GOLD : TEAL) + "," + (Math.random() * gA).toFixed(3) + ")";
          ctx.fillRect(xx, yy, 2, 2);
        }
      }

      /* ambient, per phase */
      const pulse = Math.pow(Math.max(Math.sin(t * 0.00754), 0), 2);   // 72 bpm systole
      // 02 · blood cells streaming through the stent lumen
      if (dA[1] > 0.01 && lastPj) {
        for (const bp of BLOOD) {
          bp.u += dt * (0.06 + 0.26 * pulse);
          for (let k2 = 0; k2 < 3; k2++) {
            const pos = pathAt(MODELS[1].path, bp.u - k2 * 0.02);
            const scr = lastPj.pj([pos[0], pos[1] + bp.oy * 0.5, pos[2] + bp.oz * 0.5], false);
            const al = (1 - k2 / 3) * (0.30 + 0.55 * pulse) * dA[1] * (1 - morphAct);
            ctx.fillStyle = "rgba(" + TEAL + "," + al.toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(scr[0], scr[1], (2.3 - k2 * 0.5) * scr[2], 0, 7); ctx.fill();
          }
        }
      }
      // 04 · buoyant heat plumes rising off the rotor
      if (dA[3] > 0.01) {
        const bw = Math.max(lastBB.x1 - lastBB.x0, 1);
        for (const pl2 of PL) {
          pl2.life -= dt * 0.30;
          if (pl2.life <= 0) { pl2.life = 1; pl2.x = 0.25 + 0.75 * Math.random(); }
          const rise = (1 - pl2.life) * H * 0.30;
          const px = lastBB.x0 + pl2.x * bw + Math.sin(t * 0.003 + pl2.x * 21) * 7;
          const py = lastBB.y0 + H * 0.02 - rise;
          const al = Math.sin(Math.PI * (1 - pl2.life)) * 0.26 * dA[3] * (1 - morphAct);
          ctx.strokeStyle = "rgba(" + GOLD + "," + al.toFixed(3) + ")";
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px, py - 4); ctx.stroke();
        }
      }
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
      if (ctx) { build(); drawFrame(0, 0, 0, 0.125); }
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
