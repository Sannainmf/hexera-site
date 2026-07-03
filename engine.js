/* ============================================================
   Hexera — engine.html: "Inside the engine"
   A scroll-scrubbed 3D wireframe story rendered on 2D canvas:
   hand-rolled perspective projection (no WebGL, no libraries).

   The specimen is a two-stage launch vehicle, built as a true
   body of revolution: tangent-ogive nose, barrel with interstage
   rings, boat-tail, converging–diverging nozzle bell, four swept
   fins. Every ring and longeron is computed from the profile.

   Five acts, scrubbed by scroll:
     00 READ   · the vehicle assembles from a scattered point cloud
     01 TAG    · nose / barrel / fins / nozzle classified in turn
     02 MESH   · surface densifies, then a 6-layer prism stack with
                 geometric growth builds in a 90° cutaway sector
     03 PROVE  · a scan ring climbs the stack, grading stations
     04 SHIP   · export crate draws in — and the vehicle lifts off
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

  /* ================= geometry: the launch vehicle ================= */
  const P = 24;                      // points per ring
  const R = 0.20;                    // barrel radius (height ≈ 2.6 → slender)

  /* profile stations, nose tip → nozzle exit: { y, r, tag }
     tags: 0 nose · 1 barrel · 3 nozzle (fins are group 2) */
  const prof = [];
  {
    // tangent-ogive nose: y 1.30 → 0.72
    const NU = [0, 0.06, 0.14, 0.24, 0.37, 0.52, 0.7, 0.86, 1];
    NU.forEach((u) => prof.push({ y: 1.30 - u * 0.58, r: Math.max(R * Math.pow(u, 0.62), 0.004), tag: 0 }));
    // upper barrel + interstage double-ring at 0.30/0.26
    [0.6, 0.44, 0.30, 0.26, 0.10].forEach((y) => prof.push({ y, r: R, tag: 1 }));
    // lower barrel + stage ring at -0.50/-0.54
    [-0.10, -0.30, -0.50, -0.54, -0.70, -0.80].forEach((y) => prof.push({ y, r: R, tag: 1 }));
    // boat-tail
    prof.push({ y: -0.88, r: R * 0.86, tag: 1 });
    // engine skirt → throat → bell exit (converging–diverging)
    [[-0.93, 0.58], [-0.97, 0.38], [-1.00, 0.33], [-1.05, 0.40], [-1.12, 0.52], [-1.20, 0.66], [-1.28, 0.78]]
      .forEach(([y, f]) => prof.push({ y, r: R * f, tag: 3 }));
  }
  const NS = prof.length;

  // profile 2D outward normals in the (r, y) plane — exact for a revolve
  const pnrm = prof.map((p, i) => {
    const a = prof[Math.max(i - 1, 0)], b = prof[Math.min(i + 1, NS - 1)];
    const ty = b.y - a.y, tr = b.r - a.r;
    const l = Math.hypot(ty, tr) || 1;
    return { nr: -ty / l, ny: tr / l };   // rotate tangent 90°: points away from the axis
  });

  const ringPt = (i, j, d) => {           // station i, angle j, normal offset d
    const th = (j / P) * Math.PI * 2;
    const r = prof[i].r + (d ? pnrm[i].nr * d : 0);
    const y = prof[i].y + (d ? pnrm[i].ny * d : 0);
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };

  /* base wireframe: rings at every station + 12 longerons.
     seg = [ax,ay,az,bx,by,bz, station, tag] */
  const baseSegs = [];
  for (let i = 0; i < NS; i++) {
    if (prof[i].r < 0.01) continue;
    for (let j = 0; j < P; j++) {
      const a = ringPt(i, j, 0), b = ringPt(i, (j + 1) % P, 0);
      baseSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], i, prof[i].tag]);
    }
  }
  for (let j = 0; j < P; j += 2) {
    for (let i = 0; i < NS - 1; i++) {
      const a = ringPt(i, j, 0), b = ringPt(i + 1, j, 0);
      baseSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], i, prof[i].tag]);
    }
  }
  // four swept fins at 45° offsets: outline + 2 ribs, tag 2
  const finProfile = [[R - 0.01, -0.52], [R + 0.30, -0.72], [R + 0.30, -0.94], [R - 0.01, -0.90]];
  for (let f = 0; f < 4; f++) {
    const th = Math.PI / 4 + f * Math.PI / 2;
    const c = Math.cos(th), s = Math.sin(th);
    const p3 = finProfile.map(([r, y]) => [c * r, y, s * r]);
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
    edges.forEach(([a, b]) => baseSegs.push([p3[a][0], p3[a][1], p3[a][2], p3[b][0], p3[b][1], p3[b][2], 16, 2]));
    for (let k = 1; k <= 2; k++) {
      const t = k / 3;
      const a = [lerp(p3[0][0], p3[3][0], t), lerp(p3[0][1], p3[3][1], t), lerp(p3[0][2], p3[3][2], t)];
      const b = [lerp(p3[1][0], p3[2][0], t), lerp(p3[1][1], p3[2][1], t), lerp(p3[1][2], p3[2][2], t)];
      baseSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], 16, 2]);
    }
  }

  /* act 02a · surface densification: mid-rings + odd longerons */
  const refineSegs = [];
  for (let i = 0; i < NS - 1; i++) {
    const rm = (prof[i].r + prof[i + 1].r) / 2, ym = (prof[i].y + prof[i + 1].y) / 2;
    if (rm < 0.02) continue;
    for (let j = 0; j < P; j++) {
      const t1 = (j / P) * Math.PI * 2, t2 = ((j + 1) % P / P) * Math.PI * 2;
      refineSegs.push([Math.cos(t1) * rm, ym, Math.sin(t1) * rm, Math.cos(t2) * rm, ym, Math.sin(t2) * rm, i, 1]);
    }
  }
  for (let j = 1; j < P; j += 2) {
    for (let i = 0; i < NS - 1; i++) {
      if (prof[i].r < 0.01) continue;
      const a = ringPt(i, j, 0), b = ringPt(i + 1, j, 0);
      refineSegs.push([a[0], a[1], a[2], b[0], b[1], b[2], i, 1]);
    }
  }

  /* act 02b · prism stack: 6 layers, geometric growth 1.45, shown as a
     90° cutaway sector (angles j 0..P/4) — rings + radial cell walls,
     so the actual quad cells of the boundary layer read on screen */
  const GROW = 1.45, D0 = 0.016, NLAY = 6;
  const layD = [];
  { let acc = 0; for (let k = 0; k < NLAY; k++) { acc += D0 * Math.pow(GROW, k); layD.push(acc); } }
  const SECJ = P / 4;                                 // sector: 0..90°
  const prismRings = [];                              // per layer: ring arcs in sector
  const prismWalls = [];                              // per layer: radial walls layer k-1 → k
  for (let k = 0; k < NLAY; k++) {
    const rings = [], walls = [];
    for (let i = 0; i < NS; i += 1) {
      if (prof[i].r < 0.02) continue;
      for (let j = 0; j < SECJ; j++) {
        const a = ringPt(i, j, layD[k]), b = ringPt(i, j + 1, layD[k]);
        rings.push([a[0], a[1], a[2], b[0], b[1], b[2], i, 1]);
      }
      for (let j = 0; j <= SECJ; j += 2) {
        const a = ringPt(i, j, k === 0 ? 0 : layD[k - 1]), b = ringPt(i, j, layD[k]);
        walls.push([a[0], a[1], a[2], b[0], b[1], b[2], i, 1]);
      }
    }
    prismRings.push(rings); prismWalls.push(walls);
  }

  /* act 00 · assemble cloud: every 2nd base vertex + a seeded scatter origin */
  const cloud = [];
  let seed = 1337;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < NS; i++) {
    if (prof[i].r < 0.01) continue;
    for (let j = 0; j < P; j += 2) {
      const p = ringPt(i, j, 0);
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 2.1 + rnd() * 1.4;
      cloud.push({ tx: p[0], ty: p[1], tz: p[2],
        sx: Math.sin(ph) * Math.cos(th) * r, sy: Math.cos(ph) * r * 0.9, sz: Math.sin(ph) * Math.sin(th) * r,
        st: rnd() * 0.55 });
    }
  }

  /* act 04 · export crate + launch arrow */
  const EX = R + 0.34, EY0 = -1.34, EY1 = 1.36;
  const corners = [
    [-EX, EY0, -EX], [EX, EY0, -EX], [EX, EY1, -EX], [-EX, EY1, -EX],
    [-EX, EY0, EX], [EX, EY0, EX], [EX, EY1, EX], [-EX, EY1, EX],
  ];
  const crateEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  /* ================= camera timeline ================= */
  const KEYS = [
    { p: 0.00, th: 0.50, ph: 0.10, d: 4.3, ty: 0.05 },
    { p: 0.20, th: 1.35, ph: 0.20, d: 3.4, ty: 0.10 },
    { p: 0.40, th: 2.35, ph: 0.30, d: 2.7, ty: 0.00 },
    { p: 0.60, th: 3.25, ph: 0.10, d: 1.8, ty: -0.25 },
    { p: 0.80, th: 3.95, ph: 0.50, d: 3.0, ty: -0.05 },
    { p: 1.00, th: 4.65, ph: 0.16, d: 4.2, ty: 0.05 },
  ];
  const cam = (p) => {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = sstep((p - a.p) / (b.p - a.p));
    return { th: lerp(a.th, b.th, t), ph: lerp(a.ph, b.ph, t), d: lerp(a.d, b.d, t), ty: lerp(a.ty, b.ty, t) };
  };

  /* ================= projection + batched rendering ================= */
  let W = 0, Hh = 0, DPR = 1;
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = stage.clientWidth; Hh = stage.clientHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(Hh * DPR);
    canvas.style.width = W + "px"; canvas.style.height = Hh + "px";
  };
  resize();

  const COL = { t: "15,182,172", g: "255,186,0", i: "230,228,220" };
  let buckets = new Map();
  const put = (x1, y1, x2, y2, col, a) => {
    if (a <= 0.012) return;
    const key = col + (Math.round(a * 20));
    let b = buckets.get(key);
    if (!b) { b = { col, a: Math.round(a * 20) / 20, seg: [], pts: null }; buckets.set(key, b); }
    b.seg.push(x1, y1, x2, y2);
  };
  const putPt = (x, y, col, a) => {
    if (a <= 0.02) return;
    const key = col + (Math.round(a * 20)) + "p";
    let b = buckets.get(key);
    if (!b) { b = { col, a: Math.round(a * 20) / 20, seg: [], pts: [] }; buckets.set(key, b); }
    (b.pts || (b.pts = [])).push(x, y);
  };

  let cth = 0, cph = 0, cd = 3, cty = 0, sref = 300, yShift = 0;
  let sinT = 0, cosT = 1, sinP = 0, cosP = 1;
  const FL = 2.0;
  const proj = (x, y, z) => {
    y = y + yShift - cty;
    const x1 = x * cosT + z * sinT, z1 = -x * sinT + z * cosT;
    const y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
    const zc = z2 + cd;
    if (zc < 0.35) return null;
    const s = FL / zc;
    return [W / 2 + x1 * s * sref, Hh / 2 - y2 * s * sref, zc];
  };
  const dfade = (zc) => clamp(1.65 - zc / cd, 0.14, 1);

  const segBatch = (segs, col, aBase, aFn) => {
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const A = proj(g[0], g[1], g[2]); if (!A) continue;
      const B = proj(g[3], g[4], g[5]); if (!B) continue;
      const zc = (A[2] + B[2]) / 2;
      let a = aBase * dfade(zc), c = col;
      if (aFn) { const o = aFn(g, i); if (!o) continue; a *= o[0]; if (o[1]) c = o[1]; }
      put(A[0], A[1], B[0], B[1], c, a);
    }
  };

  /* ================= acts ================= */
  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);

  const draw = (p, t) => {
    const c = cam(p);
    cth = c.th + (reduce ? 0 : Math.sin(t / 5200) * 0.035);
    cph = c.ph + (reduce ? 0 : Math.sin(t / 6900) * 0.02);
    cd = c.d; cty = c.ty;
    sinT = Math.sin(cth); cosT = Math.cos(cth); sinP = Math.sin(cph); cosP = Math.cos(cph);
    sref = Math.min(W, Hh) * 0.335;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    buckets = new Map();

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);

    // liftoff: the vehicle rises gently as the crate completes
    yShift = 0.16 * sstep((a4 - 0.5) / 0.5);

    /* act 00 · assemble: cloud converges, wireframe fades in as points land */
    const wingA = sstep((a0 - 0.45) / 0.55);
    if (a0 < 1) {
      for (const q of cloud) {
        const k = sstep((a0 * 1.5 - q.st) / 0.5);
        const A = proj(lerp(q.sx, q.tx, k), lerp(q.sy, q.ty, k), lerp(q.sz, q.tz, k));
        if (!A) continue;
        putPt(A[0], A[1], "t", (1 - wingA * 0.92) * dfade(A[2]) * 0.8);
      }
    }

    /* base wireframe · tag classification during act 01 */
    if (wingA > 0.01) {
      const order = [0, 1, 2, 3];             // nose → barrel → fins → nozzle
      segBatch(baseSegs, "t", 0.42 * wingA, (g) => {
        if (a1 <= 0) return [1, null];
        const at = clamp(a1 * 4.4 - order.indexOf(g[7]) * 1.05, 0, 1);
        if (at <= 0) return [1, null];
        const pulse = Math.sin(at * Math.PI);
        return [1 + pulse * 1.1 + (at >= 1 ? 0.3 : 0), pulse > 0.3 && at < 1 ? "g" : null];
      });
    }

    /* act 02a · surface densification, sweeping nose → tail */
    if (a2 > 0) {
      const dt = sstep(a2 / 0.55);
      segBatch(refineSegs, "t", 0.20 * (1 - 0.25 * sstep(a4)), (g) => {
        const on = sstep((dt * 1.35 - g[6] / NS) / 0.3);
        return on > 0.01 ? [on, null] : null;
      });
    }

    /* act 02b · prism stack builds outward, layer by layer, in the cutaway sector */
    if (a2 > 0.3) {
      const bt = (a2 - 0.3) / 0.7;
      for (let k = 0; k < NLAY; k++) {
        const kt = sstep((bt * (NLAY + 1.5) - k) / 1.6);
        if (kt <= 0) continue;
        const fade = 1 - 0.3 * sstep(a4);
        segBatch(prismRings[k], "t", 0.5 * kt * fade);
        segBatch(prismWalls[k], "t", 0.34 * kt * fade);
      }
    }

    /* act 03 · scan ring climbs the vehicle, grading stations */
    if (a3 > 0 && a3 < 1.15) {
      const scanY = lerp(-1.42, 1.44, sstep(a3));
      const SR = R + 0.42;
      let prev = null;
      for (let j = 0; j <= P; j++) {
        const th = (j / P) * Math.PI * 2;
        const A = proj(Math.cos(th) * SR, scanY, Math.sin(th) * SR);
        if (A && prev) put(prev[0], prev[1], A[0], A[1], "g", 0.5 * (1 - Math.abs(a3 - 0.5) * 0.7) * dfade(A[2]));
        prev = A;
      }
      segBatch(baseSegs, "t", 0.001, (g) => {
        const my = (g[1] + g[4]) / 2;
        const near = Math.exp(-Math.pow((my - scanY) / 0.10, 2));
        const flagged = (g[6] === 10 || g[6] === 22);
        const passed = scanY - my;
        if (flagged && passed > 0 && passed < 0.45) return [Math.sin(passed / 0.45 * Math.PI) * 750, "g"];
        return near > 0.03 ? [near * 620, "t"] : null;
      });
    }

    /* act 04 · export crate draws in, then the launch arrow */
    if (a4 > 0) {
      for (let e = 0; e < crateEdges.length; e++) {
        const et = clamp(a4 * 2.2 - e * 0.085, 0, 1);
        if (et <= 0) continue;
        const A3 = corners[crateEdges[e][0]], B3 = corners[crateEdges[e][1]];
        const sm = sstep(et);
        const A = proj(A3[0], A3[1] - yShift, A3[2]);      // crate stays grounded
        const B = proj(lerp(A3[0], B3[0], sm), lerp(A3[1], B3[1], sm) - yShift, lerp(A3[2], B3[2], sm));
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.5 * dfade((A[2] + B[2]) / 2));
      }
      const at = sstep((a4 - 0.62) / 0.3);
      if (at > 0) {
        const y1 = 1.5, y2 = y1 + 0.34 * at;
        const A = proj(0, y1 - yShift, 0), B = proj(0, y2 - yShift, 0);
        if (A && B) {
          put(A[0], A[1], B[0], B[1], "g", 0.8);
          const H1 = proj(-0.07, y2 - 0.09 - yShift, 0), H2 = proj(0.07, y2 - 0.09 - yShift, 0);
          if (H1) put(H1[0], H1[1], B[0], B[1], "g", 0.8);
          if (H2) put(H2[0], H2[1], B[0], B[1], "g", 0.8);
        }
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

  /* ================= HUD, captions, rail ================= */
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

  /* ================= drive: scroll scrub + idle drift ================= */
  let p = 0;
  const onScroll = () => {
    const r = track.getBoundingClientRect();
    const scrollable = track.offsetHeight - window.innerHeight;
    p = clamp(-r.top / Math.max(scrollable, 1), 0, 1);
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
