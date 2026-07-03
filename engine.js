/* ============================================================
   Hexera — engine.html: "Inside the engine"
   A scroll-scrubbed 3D wireframe story rendered on 2D canvas:
   hand-rolled perspective projection (no WebGL, no libraries).
   One sticky stage, five acts:
     00 READ   · the wing assembles from a scattered point cloud
     01 TAG    · surface groups light up as they're classified
     02 MESH   · boundary-layer shells extrude off the skin
     03 PROVE  · a scan plane sweeps the span, grading sections
     04 SHIP   · an export crate draws itself around the part
   Geometry is a real NACA 0012 lofted along a tapered, swept
   span — computed, not drawn, same as the rest of the site.
   ============================================================ */
(() => {
  "use strict";
  const stage = document.querySelector("[data-eng]");
  if (!stage) return;
  const canvas = stage.querySelector("[data-eng-canvas]");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const track = document.querySelector("[data-eng-track]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- geometry: lofted NACA 0012 wing ---------------- */
  const P = 40;              // points per section loop
  const NSEC = 21;           // spanwise sections
  const SPAN = 2.6, TAPER = 0.5, SWEEP = 0.42;
  const yt = (t) => 5 * 0.12 * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);

  // one unit section loop (chord 0..1, y up), TE → upper → LE → lower
  const secLoop = [];
  {
    const H = P / 2;
    for (let i = 0; i <= H; i++) {           // upper: TE → LE
      const xc = 0.5 * (1 + Math.cos(Math.PI * i / H));
      secLoop.push([xc, yt(xc) * 1.6]);
    }
    for (let i = 1; i < H; i++) {            // lower: LE → TE
      const xc = 0.5 * (1 - Math.cos(Math.PI * i / H));
      secLoop.push([xc, -yt(xc) * 1.6]);
    }
  }
  // per-vertex 2D outward normals of the unit loop (for shell offsets)
  const secNrm = secLoop.map((p, i) => {
    const a = secLoop[(i - 1 + P) % P], b = secLoop[(i + 1) % P];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l];
  });

  // sections: [ [x,y,z] * P ] * NSEC, centered on origin
  const sections = [], shellSections = [[], [], []];
  const SHELL_D = [0.045, 0.095, 0.16];
  const secZ = [];
  for (let s = 0; s < NSEC; s++) {
    const f = s / (NSEC - 1);                 // 0..1 across the span
    const z = (f - 0.5) * SPAN;
    const tp = Math.abs(f - 0.5) * 2;         // 0 at root, 1 at tips
    const chord = lerp(1, TAPER, tp);
    const xle = SWEEP * tp - 0.5 - chord * -0.0; // sweep back, center chord
    secZ.push(z);
    const ring = [], rings = [[], [], []];
    for (let j = 0; j < P; j++) {
      const px = xle + secLoop[j][0] * chord;
      const py = secLoop[j][1] * chord;
      ring.push([px - 0.12, py, z]);          // -0.12 recenters the swept planform
      for (let k = 0; k < 3; k++) {
        const d = SHELL_D[k] * chord;
        rings[k].push([px - 0.12 + secNrm[j][0] * d, py + secNrm[j][1] * d, z]);
      }
    }
    sections.push(ring);
    for (let k = 0; k < 3; k++) shellSections[k].push(rings[k]);
  }

  // wing wireframe segments: section loops + spanwise stringers
  // seg = [ax,ay,az,bx,by,bz, secIdx, loopIdx]
  const wingSegs = [];
  for (let s = 0; s < NSEC; s++) {
    for (let j = 0; j < P; j++) {
      const a = sections[s][j], b = sections[s][(j + 1) % P];
      wingSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], s, j]);
    }
  }
  for (let j = 0; j < P; j += 2) {
    for (let s = 0; s < NSEC - 1; s++) {
      const a = sections[s][j], b = sections[s + 1][j];
      wingSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], s, j]);
    }
  }
  // shell segments (sparser loops), tagged with shell index + section
  const shellSegs = [[], [], []];
  for (let k = 0; k < 3; k++) {
    for (let s = 0; s < NSEC; s += 1) {
      for (let j = 0; j < P; j += 2) {
        const a = shellSections[k][s][j], b = shellSections[k][s][(j + 2) % P];
        shellSegs[k].push([a[0], a[1], a[2], b[0], b[1], b[2], s, j]);
      }
    }
  }
  // assemble cloud: every section vertex + a seeded scatter origin
  const cloud = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let s = 0; s < NSEC; s++) {
    for (let j = 0; j < P; j += 2) {
      const p = sections[s][j];
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 1.9 + rnd() * 1.3;
      cloud.push({
        tx: p[0], ty: p[1], tz: p[2],
        sx: Math.sin(ph) * Math.cos(th) * r, sy: Math.cos(ph) * r * 0.7, sz: Math.sin(ph) * Math.sin(th) * r,
        st: rnd() * 0.55,
      });
    }
  }
  // export crate: bbox with margin
  let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  sections.flat().forEach((p) => {
    bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]),
          Math.max(bb[3], p[0]), Math.max(bb[4], p[1]), Math.max(bb[5], p[2])];
  });
  const M = 0.22;
  const bx0 = bb[0] - M, by0 = bb[1] - M * 1.6, bz0 = bb[2] - M, bx1 = bb[3] + M, by1 = bb[4] + M * 1.6, bz1 = bb[5] + M;
  const corners = [
    [bx0, by0, bz0], [bx1, by0, bz0], [bx1, by1, bz0], [bx0, by1, bz0],
    [bx0, by0, bz1], [bx1, by0, bz1], [bx1, by1, bz1], [bx0, by1, bz1],
  ];
  const crateEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  /* ---------------- surface tag groups for act 01 ---------------- */
  // classify each wing segment: 0 leading edge · 1 trailing edge · 2 tip caps · 3 skin
  const tagOf = (seg) => {
    const j = seg[7], s = seg[6];
    const H = P / 2;
    if (s <= 1 || s >= NSEC - 2) return 2;
    const nearLE = Math.abs(j - H) <= 3;
    const nearTE = j <= 2 || j >= P - 3;
    if (nearLE) return 0;
    if (nearTE) return 1;
    return 3;
  };
  const wingTags = wingSegs.map(tagOf);

  /* ---------------- camera timeline (keyframed on scroll) ---------------- */
  const KEYS = [
    { p: 0.00, th: 0.61, ph: 0.21, d: 4.1 },
    { p: 0.20, th: 1.13, ph: 0.31, d: 3.2 },
    { p: 0.40, th: 2.09, ph: 0.42, d: 2.55 },
    { p: 0.60, th: 3.05, ph: 0.17, d: 1.85 },
    { p: 0.80, th: 3.75, ph: 0.96, d: 2.7 },
    { p: 1.00, th: 4.36, ph: 0.28, d: 3.6 },
  ];
  const cam = (p) => {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = sstep((p - a.p) / (b.p - a.p));
    return { th: lerp(a.th, b.th, t), ph: lerp(a.ph, b.ph, t), d: lerp(a.d, b.d, t) };
  };

  /* ---------------- projection + batched wireframe rendering ---------------- */
  let W = 0, Hh = 0, DPR = 1;
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth; Hh = stage.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(Hh * DPR);
    canvas.style.width = W + "px"; canvas.style.height = Hh + "px";
  };
  resize();

  const COL = { t: "15,182,172", g: "255,186,0", i: "230,228,220", r: "216,58,48" };
  let buckets = new Map();
  const put = (x1, y1, x2, y2, col, a) => {
    if (a <= 0.012) return;
    const key = col + (Math.round(a * 20));
    let b = buckets.get(key);
    if (!b) { b = { col, a: Math.round(a * 20) / 20, seg: [] }; buckets.set(key, b); }
    b.seg.push(x1, y1, x2, y2);
  };

  // per-frame camera transform, set in draw()
  let cth = 0, cph = 0, cd = 3, sref = 300, fl = 2.0;
  let sinT = 0, cosT = 1, sinP = 0, cosP = 1;
  const proj = (x, y, z) => {
    const x1 = x * cosT + z * sinT, z1 = -x * sinT + z * cosT;
    const y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
    const zc = z2 + cd;
    if (zc < 0.35) return null;
    const s = fl / zc;
    return [W / 2 + x1 * s * sref, Hh / 2 - y2 * s * sref, zc];
  };
  const dfade = (zc) => clamp(1.5 - zc / cd, 0.22, 1);

  const segBatch = (segs, col, aBase, aFn) => {
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const A = proj(g[0], g[1], g[2]); if (!A) continue;
      const B = proj(g[3], g[4], g[5]); if (!B) continue;
      const zc = (A[2] + B[2]) / 2;
      let a = aBase * dfade(zc), c = col;
      if (aFn) { const o = aFn(g, i); if (!o) continue; a *= o[0]; c = o[1] || c; }
      put(A[0], A[1], B[0], B[1], c, a);
    }
  };

  /* ---------------- acts ---------------- */
  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);

  const draw = (p, t) => {
    const c = cam(p);
    cth = c.th + (reduce ? 0 : Math.sin(t / 4700) * 0.05);
    cph = c.ph + (reduce ? 0 : Math.sin(t / 6100) * 0.03);
    cd = c.d;
    sinT = Math.sin(cth); cosT = Math.cos(cth); sinP = Math.sin(cph); cosP = Math.cos(cph);
    sref = Math.min(W, Hh) * 0.42;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    buckets = new Map();

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);

    /* act 00 · assemble cloud → wing */
    const wingA = sstep((a0 - 0.45) / 0.55) * (1 - 0.25 * sstep(a4));
    if (a0 < 1) {
      for (const q of cloud) {
        const k = sstep((a0 * 1.5 - q.st) / 0.5);
        const x = lerp(q.sx, q.tx, k), y = lerp(q.sy, q.ty, k), z = lerp(q.sz, q.tz, k);
        const A = proj(x, y, z); if (!A) continue;
        const a = (1 - wingA * 0.9) * dfade(A[2]) * 0.85;
        if (a > 0.02) {
          const key = "t" + Math.round(a * 20);
          let b = buckets.get(key);
          if (!b) { b = { col: "t", a: Math.round(a * 20) / 20, seg: [], pts: [] }; buckets.set(key, b); }
          (b.pts || (b.pts = [])).push(A[0], A[1]);
        }
      }
    }

    /* wing wireframe (fades in as cloud lands; tag colors during act 01+) */
    if (wingA > 0.01) {
      segBatch(wingSegs, "t", 0.5 * wingA, (g, i) => {
        const tag = wingTags[i];
        // act 01: groups light gold in sequence, then settle teal-bright
        const order = [0, 1, 2, 3];
        const at = clamp(a1 * 4 - order.indexOf(tag), 0, 1);
        if (a1 > 0 && at > 0) {
          const pulse = Math.sin(Math.min(at, 1) * Math.PI);
          const settled = at >= 1 ? 0.35 : 0;
          return [1 + pulse * 0.9 + settled, pulse > 0.25 && at < 1 ? "g" : "t"];
        }
        return [1, "t"];
      });
    }

    /* act 02 · boundary-layer shells cascade root → tip */
    if (a2 > 0 && wingA > 0.2) {
      for (let k = 0; k < 3; k++) {
        const kt = sstep((a2 - k * 0.18) / 0.55);
        if (kt <= 0) continue;
        segBatch(shellSegs[k], "t", 0.34 * kt * (1 - 0.3 * sstep(a4) - k * 0.06), (g) => {
          const f = Math.abs(g[2] + g[5]) / 2 / (SPAN / 2);      // 0 root → 1 tip
          const on = sstep((kt * 1.6 - f) / 0.4);
          return on > 0 ? [on, null] : null;
        });
      }
    }

    /* act 03 · scan plane sweeps the span, grading sections */
    if (a3 > 0 && a3 < 1.2) {
      const scanZ = lerp(-SPAN / 2 - 0.15, SPAN / 2 + 0.15, sstep(a3));
      // the scan gate itself: a thin vertical frame at scanZ
      const gate = [[bx0 - 0.05, by0 - 0.05], [bx1 + 0.05, by0 - 0.05], [bx1 + 0.05, by1 + 0.05], [bx0 - 0.05, by1 + 0.05]];
      for (let e = 0; e < 4; e++) {
        const A = proj(gate[e][0], gate[e][1], scanZ), B = proj(gate[(e + 1) % 4][0], gate[(e + 1) % 4][1], scanZ);
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.5 * (1 - Math.abs(a3 - 0.5) * 0.6));
      }
      // graded highlight riding the wing near the plane + flagged ribs flash
      segBatch(wingSegs, "t", 0.001, (g) => {
        const mz = (g[2] + g[5]) / 2;
        const near = Math.exp(-Math.pow((mz - scanZ) / 0.12, 2));
        const flagged = (g[6] === 5 || g[6] === 15);
        const passed = scanZ - mz;
        if (flagged && passed > 0 && passed < 0.5) return [Math.sin(passed / 0.5 * Math.PI) * 700, "g"];
        return near > 0.03 ? [near * 600, "t"] : null;
      });
    }

    /* act 04 · export crate draws in, edge by edge */
    if (a4 > 0) {
      for (let e = 0; e < crateEdges.length; e++) {
        const et = clamp(a4 * 2.1 - e * 0.09, 0, 1);
        if (et <= 0) continue;
        const A3 = corners[crateEdges[e][0]], B3 = corners[crateEdges[e][1]];
        const Bx = lerp(A3[0], B3[0], sstep(et)), By = lerp(A3[1], B3[1], sstep(et)), Bz = lerp(A3[2], B3[2], sstep(et));
        const A = proj(A3[0], A3[1], A3[2]), B = proj(Bx, By, Bz);
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.55 * dfade((A[2] + B[2]) / 2));
      }
    }

    /* flush batches */
    for (const b of buckets.values()) {
      if (b.seg.length) {
        ctx.strokeStyle = "rgba(" + COL[b.col] + "," + b.a + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < b.seg.length; i += 4) { ctx.moveTo(b.seg[i], b.seg[i + 1]); ctx.lineTo(b.seg[i + 2], b.seg[i + 3]); }
        ctx.stroke();
      }
      if (b.pts && b.pts.length) {
        ctx.fillStyle = "rgba(" + COL[b.col] + "," + b.a + ")";
        for (let i = 0; i < b.pts.length; i += 2) ctx.fillRect(b.pts[i] - 1, b.pts[i + 1] - 1, 2, 2);
      }
    }
  };

  /* ---------------- HUD, captions, rail ---------------- */
  const ACTS = ["read", "tag", "mesh", "prove", "ship"];
  const hudAct = stage.querySelector("[data-eng-act]");
  const hudCam = stage.querySelector("[data-eng-cam]");
  const hudBar = stage.querySelector("[data-eng-fill]");
  const title = stage.querySelector("[data-eng-title]");
  const cue = stage.querySelector("[data-eng-cue]");
  const caps = Array.from(stage.querySelectorAll("[data-eng-cap]"));
  const stops = Array.from(stage.querySelectorAll("[data-eng-go]"));

  const CHARS = "abcdefghjkmnpqrstuvwxyz0123456789";
  const decode = (el, str) => {
    if (!el || el.dataset.cur === str) return;
    el.dataset.cur = str;
    if (reduce) { el.textContent = str; return; }
    const t0 = performance.now(), dur = 300;
    const gen = (el._dg = (el._dg || 0) + 1);
    const tick = (t) => {
      if (el._dg !== gen) return;
      const k = Math.min((t - t0) / dur, 1);
      const n = Math.floor(k * str.length);
      let tail = "";
      for (let i = n; i < str.length; i++) tail += CHARS[(Math.random() * CHARS.length) | 0];
      el.textContent = str.slice(0, n) + tail;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => { if (el._dg === gen) el.textContent = str; }, dur + 60);
  };

  let lastAct = -1;
  const ui = (p) => {
    const act = clamp(Math.floor(p * 5 - 1e-6), 0, 4);
    if (act !== lastAct) {
      lastAct = act;
      if (hudAct) decode(hudAct, "0" + (act + 1) + " · " + ACTS[act]);
      stops.forEach((b, i) => b.classList.toggle("active", i === act));
    }
    if (hudBar) hudBar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    if (hudCam) {
      const c = cam(p);
      hudCam.textContent = "θ " + String(Math.round(c.th * 57.3) % 360).padStart(3, "0") + "° · φ " +
        String(Math.round(c.ph * 57.3)).padStart(2, "0") + "° · z " + c.d.toFixed(2) + "c";
    }
    if (title) {
      const o = clamp(1 - p / 0.06, 0, 1);
      title.style.opacity = o.toFixed(3);
      title.style.transform = "translateY(" + (-(1 - o) * 30).toFixed(1) + "px)";
      title.style.visibility = o <= 0 ? "hidden" : "visible";
    }
    if (cue) cue.style.opacity = clamp(1 - p / 0.03, 0, 1).toFixed(3);
    caps.forEach((el, i) => {
      const w = actWin(p, i);
      const on = i === 0 ? sstep((w - 0.3) / 0.22) * (1 - sstep((w - 0.86) / 0.14))
                          : sstep((w - 0.12) / 0.2) * (i === 4 ? 1 : 1 - sstep((w - 0.86) / 0.14));
      el.style.opacity = on.toFixed(3);
      el.style.transform = "translateY(" + ((1 - on) * 26).toFixed(1) + "px)";
      el.style.visibility = on <= 0 ? "hidden" : "visible";
    });
  };

  /* ---------------- drive: scroll scrub + gentle idle drift ---------------- */
  let p = 0;
  const onScroll = () => {
    const r = track.getBoundingClientRect();
    const scrollable = track.offsetHeight - window.innerHeight;
    p = clamp(-r.top / Math.max(scrollable, 1), 0, 1);
    // stalled-rAF fallback (throttled/background tabs): draw directly
    if (performance.now() - lastRafT > 300) { draw(p, performance.now()); ui(p); }
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  stops.forEach((btn) => btn.addEventListener("click", () => {
    const i = +btn.dataset.engGo;
    const scrollable = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const target = top + scrollable * (i * 0.2 + 0.1);
    if (window.__lenis) window.__lenis.scrollTo(target, { duration: 1.2 });
    else window.scrollTo({ top: target, behavior: "smooth" });
  }));

  let running = false, rafId = 0, lastRafT = 0;
  const loop = (t) => {
    if (!running) return;
    lastRafT = t;
    draw(p, t);
    ui(p);
    rafId = requestAnimationFrame(loop);
  };

  if (reduce) {
    onScroll();
    draw(p || 0.3, 0);
    ui(p || 0.3);
    window.addEventListener("scroll", () => { draw(p, 0); ui(p); }, { passive: true });
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !running) { running = true; rafId = requestAnimationFrame(loop); }
        else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(rafId); }
      });
    });
    io.observe(track);
  }

  let rsT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => { resize(); onScroll(); draw(p, performance.now()); ui(p); }, 120);
  });

  onScroll();
  draw(p, 0);
  ui(p);
})();
