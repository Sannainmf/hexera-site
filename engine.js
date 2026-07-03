/* ============================================================
   Hexera — engine.html: "Inside the engine"
   Scroll-scrubbed 3D wireframe story, hand-rolled perspective
   projection on 2D canvas. No WebGL, no libraries.

   The specimen: a transport-style wing built like real CAD —
   cambered NACA 2412 sections, taper, 24° LE sweep, dihedral,
   washout twist, closed rounded tip caps, flap + aileron panel
   break lines, and internal structure (front/rear spars with
   rib webs). Rendering uses per-segment surface normals for
   view-dependent backface dimming and a two-tier line
   hierarchy: bright feature edges, faint interior lines.

   Five acts, scrubbed by scroll:
     00 READ   · point cloud converges; feature edges draw first
     01 TAG    · skin / flaps / ailerons / tips classified
     02 MESH   · structured surface grid sweeps LE → TE with real
                 clustering, then an 8-layer prism stack (growth
                 1.35) builds at an inspection rib
     03 PROVE  · a quality gate sweeps the span; failures flash
                 and re-refine
     04 SHIP   · the export crate draws itself closed
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

  /* ================= wing definition ================= */
  const SEMI = 1.3;                 // semispan
  const CROOT = 1.0, CTIP = 0.38;   // chords
  const SWEEP = 0.46;               // LE sweep (x shift at tip)
  const DIHED = 0.085;              // dihedral rise at tip
  const TWIST = -0.06;              // washout (rad at tip)
  const XSHIFT = -0.52;             // recenter the planform on the origin

  // NACA 2412: camber m=0.02 @ p=0.4, thickness 12%
  const M2 = 0.02, P4 = 0.4;
  const yc = (x) => x < P4 ? (M2 / (P4 * P4)) * (2 * P4 * x - x * x)
                           : (M2 / ((1 - P4) * (1 - P4))) * ((1 - 2 * P4) + 2 * P4 * x - x * x);
  const yt = (x) => 5 * 0.12 * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

  /* section loop in unit chord space: TE → upper → LE → lower → (TE)
     P points, cosine-clustered at LE and TE (real chordwise clustering) */
  const P = 48, H = P / 2;
  const loopXY = [], loopN = [];
  {
    const pts = [];
    for (let i = 0; i <= H; i++) {                     // upper TE→LE
      const x = 0.5 * (1 + Math.cos(Math.PI * i / H));
      pts.push([x, yc(x) + yt(x)]);
    }
    for (let i = 1; i < H; i++) {                      // lower LE→TE
      const x = 0.5 * (1 - Math.cos(Math.PI * i / H));
      pts.push([x, yc(x) - yt(x)]);
    }
    pts.forEach((p) => loopXY.push(p));
    for (let i = 0; i < P; i++) {
      const a = loopXY[(i - 1 + P) % P], b = loopXY[(i + 1) % P];
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      loopN.push([-ty / l, tx / l]);                   // outward for this winding
    }
  }
  const LEI = H;                                       // loop index of the leading edge
  const chordAt = (j) => loopXY[j][0];                 // x/c of loop point
  const distLE = (j) => Math.abs(j - LEI) / H;         // 0 at LE → 1 at TE

  /* spanwise stations: clustered at root and tips, plus closing cap stations */
  const stF = [];
  {
    const NHALF = 12;
    for (let k = -NHALF; k <= NHALF; k++) {
      const u = k / NHALF;
      stF.push(Math.tanh(1.6 * u) / Math.tanh(1.6) * 0.955);
    }
  }
  const CAPS = [[0.965, 0.72], [0.978, 0.42], [0.988, 0.16]]; // [f, thickness+chord scale]

  /* build one section: returns P points [x,y,z] */
  const buildSec = (f, scale) => {
    const af = Math.abs(f);
    const chord = lerp(CROOT, CTIP, af) * (scale || 1);
    const xle = SWEEP * af;
    const dy = DIHED * af * af * 2.2;
    const tw = TWIST * af;
    const cosW = Math.cos(tw), sinW = Math.sin(tw);
    const out = [];
    for (let j = 0; j < P; j++) {
      let x = loopXY[j][0] * chord, y = loopXY[j][1] * chord * (scale ? lerp(1, 0.55, 1 - scale) : 1);
      const qx = x - 0.25 * chord;                     // twist about quarter chord
      x = 0.25 * chord + qx * cosW - y * sinW;
      y = qx * sinW + y * cosW;
      out.push([xle + x + XSHIFT + (scale ? (1 - scale) * chord * 0.35 : 0), y + dy, f * SEMI]);
    }
    return out;
  };
  const sections = stF.map((f) => buildSec(f, 1));
  const NST = sections.length, MID = (NST - 1) / 2;
  // closed tips: cap sections shrinking to a point
  const capsL = CAPS.map(([f, s]) => buildSec(-f, s));
  const capsR = CAPS.map(([f, s]) => buildSec(f, s));

  /* segment store: {a, b, n(3)|0, cls, tag, st, dle}
     cls: 0 feature · 1 skin · 2 internal · 3 finegrid
     tag: 0 skin · 1 flap · 2 aileron · 3 tips */
  const segs = [];
  const nrm3 = (j) => [loopN[j][0], loopN[j][1], 0];
  const tagAt = (j, f) => {
    const af = Math.abs(f);
    if (af > 0.9) return 3;
    if (chordAt(j) > 0.7 && j < H) {                   // rear upper panel region
      if (af >= 0.5 && af <= 0.9) return 2;            // aileron
      if (af <= 0.42) return 1;                        // flap
    }
    return 0;
  };
  const add = (a, b, n, cls, tag, st, dle) => segs.push({ a, b, n, cls, tag, st, dle });

  /* skin rings (CAD density: every 2nd station) */
  for (let s = 0; s < NST; s += 2) {
    for (let j = 0; j < P; j++) {
      add(sections[s][j], sections[s][(j + 1) % P], nrm3(j), 1, tagAt(j, stF[s]), s, distLE(j));
    }
  }
  /* spanwise lines (CAD density: every 4th loop point) */
  for (let j = 0; j < P; j += 4) {
    for (let s = 0; s < NST - 1; s++) {
      add(sections[s][j], sections[s + 1][j], nrm3(j), 1, tagAt(j, stF[s]), s, distLE(j));
    }
  }
  /* tip caps: rings + closers */
  [[capsL, sections[0]], [capsR, sections[NST - 1]]].forEach(([caps, last]) => {
    let prev = last;
    caps.forEach((sec, ci) => {
      for (let j = 0; j < P; j += 2) {
        add(sec[j], sec[(j + 2) % P], nrm3(j), 1, 3, 0, distLE(j));
        add(prev[j], sec[j], nrm3(j), 1, 3, 0, distLE(j));
      }
      prev = sec;
    });
  });
  /* feature edges: LE, TE (upper+lower rim), spar caps, panel breaks */
  const featureLine = (jList, sRange, tag) => {
    jList.forEach((j) => {
      for (let s = sRange[0]; s < sRange[1]; s++) {
        add(sections[s][j], sections[s + 1][j], 0, 0, tag, s, distLE(j));
      }
    });
  };
  featureLine([LEI], [0, NST - 1], 0);                            // leading edge
  featureLine([0, P - 1], [0, NST - 1], 0);                       // trailing edge rims
  // spar caps at x/c ≈ 0.25 and 0.68 (nearest loop indices, upper + lower)
  const jNear = (xc, upper) => {
    let best = upper ? 0 : H, bd = 9;
    for (let j = 0; j < P; j++) {
      const isUp = j < H;
      if (isUp !== upper) continue;
      const d = Math.abs(chordAt(j) - xc);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  const sparJ = [[jNear(0.25, true), jNear(0.25, false)], [jNear(0.68, true), jNear(0.68, false)]];
  sparJ.forEach(([ju, jl]) => featureLine([ju, jl], [0, NST - 1], 0));
  /* internal structure: spar webs (verticals at each station) + rib outlines */
  for (let s = 0; s < NST; s++) {
    sparJ.forEach(([ju, jl]) => add(sections[s][ju], sections[s][jl], 0, 2, 0, s, 0.5));
    if (s % 4 === 2) {
      for (let j = 0; j < P; j += 3) add(sections[s][j], sections[s][(j + 3) % P], 0, 2, 0, s, distLE(j));
    }
  }
  /* panel break lines: aileron + flap boxes (span edges chordwise, chord edges spanwise) */
  const jPanelU = [];
  for (let j = 0; j < H; j++) if (chordAt(j) > 0.7) jPanelU.push(j);
  const panelBox = (f0, f1) => {
    const s0 = stF.findIndex((f) => f >= f0), s1 = stF.findIndex((f) => f >= f1);
    // spanwise hinge line at x/c 0.7 upper
    const jh = jNear(0.7, true);
    for (let s = s0; s < s1; s++) add(sections[s][jh], sections[s + 1][jh], 0, 0, 0, s, distLE(jh));
    // side edges: chordwise from hinge to TE at s0 and s1
    [s0, s1].forEach((s) => {
      for (let j = 0; j < jh; j++) add(sections[s][j], sections[s][j + 1], 0, 0, 0, s, distLE(j));
    });
  };
  panelBox(0.52, 0.9);        // right aileron
  panelBox(-0.9, -0.52);      // left aileron  (findIndex works on ascending stF)
  panelBox(-0.4, 0.4);        // center flap span (reads as two flap panels split by root)

  /* ---------------- fine structured surface grid (act 02) ----------------
     denser spanwise stations (tanh-clustered) + full chordwise loops:
     the real thing — cells pack at LE/TE and at root/tips */
  const fineF = [];
  { const NF = 20; for (let k = -NF; k <= NF; k++) { const u = k / NF; fineF.push(Math.tanh(1.9 * u) / Math.tanh(1.9) * 0.955); } }
  const fineSecs = fineF.map((f) => buildSec(f, 1));
  const fineSegs = [];
  for (let s = 0; s < fineSecs.length; s++) {
    for (let j = 0; j < P; j++) {
      fineSegs.push({ a: fineSecs[s][j], b: fineSecs[s][(j + 1) % P], n: nrm3(j), dle: distLE(j) });
    }
  }
  for (let j = 0; j < P; j++) {
    for (let s = 0; s < fineSecs.length - 1; s++) {
      fineSegs.push({ a: fineSecs[s][j], b: fineSecs[s + 1][j], n: nrm3(j), dle: distLE(j) });
    }
  }

  /* ---------------- prism stack at the inspection rib (act 02b) ----------------
     8 layers, geometric growth 1.35 — drawn as layer arcs + cell walls so the
     actual quads read. Placed at f = +0.42, the station the camera dives to. */
  const INS_F = 0.42;
  const insSec = buildSec(INS_F, 1);
  const insChord = lerp(CROOT, CTIP, INS_F);
  /* stack totals ~8% of local chord — slightly exaggerated from a real BL for
     legibility, but the right order of magnitude, so layers hug the skin */
  const NLAY = 8, GROW = 1.35;
  const TOTAL_D = 0.08 * insChord;
  const D0 = TOTAL_D * (GROW - 1) / (Math.pow(GROW, NLAY) - 1);
  const layD = []; { let acc = 0; for (let k = 0; k < NLAY; k++) { acc += D0 * Math.pow(GROW, k); layD.push(acc); } }
  const prism = [];   // {a,b,layer, wall:bool}
  for (let k = 0; k < NLAY; k++) {
    const d = layD[k];
    for (let j = 0; j < P; j++) {
      const a = insSec[j], b = insSec[(j + 1) % P];
      const na = loopN[j], nb = loopN[(j + 1) % P];
      prism.push({ a: [a[0] + na[0] * d, a[1] + na[1] * d, a[2]], b: [b[0] + nb[0] * d, b[1] + nb[1] * d, b[2]], k, wall: false });
    }
    for (let j = 0; j < P; j += 2) {
      const a = insSec[j], n = loopN[j];
      const d0 = k === 0 ? 0 : layD[k - 1];
      prism.push({ a: [a[0] + n[0] * d0, a[1] + n[1] * d0, a[2]], b: [a[0] + n[0] * d, a[1] + n[1] * d, a[2]], k, wall: true });
    }
  }
  const insMid = [insSec[LEI][0] * 0.4 + insSec[0][0] * 0.6, insSec[LEI][1] + 0.03, insSec[0][2]];

  /* ---------------- assemble cloud (act 00) ---------------- */
  const cloud = [];
  let seed = 20260703;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let s = 0; s < NST; s++) {
    for (let j = 0; j < P; j += 2) {
      const p = sections[s][j];
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 2.0 + rnd() * 1.5;
      cloud.push({ tx: p[0], ty: p[1], tz: p[2],
        sx: Math.sin(ph) * Math.cos(th) * r, sy: Math.cos(ph) * r * 0.75, sz: Math.sin(ph) * Math.sin(th) * r,
        st: rnd() * 0.55 });
    }
  }

  /* ---------------- export crate (act 04) ---------------- */
  let bb = [9, 9, 9, -9, -9, -9];
  sections.flat().forEach((p) => {
    bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]),
          Math.max(bb[3], p[0]), Math.max(bb[4], p[1]), Math.max(bb[5], p[2])];
  });
  const MG = 0.16;
  const corners = [
    [bb[0]-MG, bb[1]-MG*1.5, bb[2]-MG], [bb[3]+MG, bb[1]-MG*1.5, bb[2]-MG], [bb[3]+MG, bb[4]+MG*1.5, bb[2]-MG], [bb[0]-MG, bb[4]+MG*1.5, bb[2]-MG],
    [bb[0]-MG, bb[1]-MG*1.5, bb[5]+MG], [bb[3]+MG, bb[1]-MG*1.5, bb[5]+MG], [bb[3]+MG, bb[4]+MG*1.5, bb[5]+MG], [bb[0]-MG, bb[4]+MG*1.5, bb[5]+MG],
  ];
  const crateEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  /* ================= camera timeline (with 3D targets) ================= */
  const KEYS = [
    { p: 0.00, th: 0.55, ph: 0.34, d: 3.9, t: [0, 0, 0] },
    { p: 0.20, th: 1.25, ph: 0.44, d: 2.7, t: [0, 0, 0] },
    { p: 0.40, th: 2.05, ph: 0.58, d: 2.5, t: [0, 0, 0.15] },
    { p: 0.60, th: 2.75, ph: 0.26, d: 1.1, t: [insMid[0], insMid[1], insMid[2] * 0.9] },
    { p: 0.80, th: 3.55, ph: 0.72, d: 2.9, t: [0, 0, 0] },
    { p: 1.00, th: 4.25, ph: 0.30, d: 3.9, t: [0, 0, 0] },
  ];
  const cam = (p) => {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = sstep((p - a.p) / (b.p - a.p));
    return { th: lerp(a.th, b.th, t), ph: lerp(a.ph, b.ph, t), d: lerp(a.d, b.d, t),
      tx: lerp(a.t[0], b.t[0], t), ty: lerp(a.t[1], b.t[1], t), tz: lerp(a.t[2], b.t[2], t) };
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

  const COL = { t: "15,182,172", g: "255,186,0", i: "235,233,226" };
  let buckets = new Map();
  const put = (x1, y1, x2, y2, col, a, w) => {
    if (a <= 0.012) return;
    const aq = Math.round(a * 18);
    const key = col + aq + "w" + w;
    let b = buckets.get(key);
    if (!b) { b = { col, a: aq / 18, w, seg: [], pts: null }; buckets.set(key, b); }
    b.seg.push(x1, y1, x2, y2);
  };
  const putPt = (x, y, col, a) => {
    if (a <= 0.02) return;
    const aq = Math.round(a * 18);
    const key = col + aq + "p";
    let b = buckets.get(key);
    if (!b) { b = { col, a: aq / 18, w: 1, seg: [], pts: [] }; buckets.set(key, b); }
    (b.pts || (b.pts = [])).push(x, y);
  };

  let cth = 0, cph = 0, cd = 3, ctx3 = [0, 0, 0], sref = 300;
  let sinT = 0, cosT = 1, sinP = 0, cosP = 1;
  let CX = 0, CY = 0, CZ = 0;                          // camera position in model space
  const FL = 2.0;
  const proj = (x, y, z) => {
    x -= ctx3[0]; y -= ctx3[1]; z -= ctx3[2];
    const x1 = x * cosT + z * sinT, z1 = -x * sinT + z * cosT;
    const y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
    const zc = z2 + cd;
    if (zc < 0.3) return null;
    const s = FL / zc;
    return [W / 2 + x1 * s * sref, Hh / 2 - y2 * s * sref, zc];
  };
  const dfade = (zc) => clamp(1.7 - zc / cd, 0.15, 1);
  /* view-dependent facing weight: front surface bright, far side recedes */
  const facing = (mx, my, mz, n) => {
    if (!n) return 1;
    const dx = CX - mx, dy = CY - my, dz = CZ - mz;
    const il = 1 / (Math.hypot(dx, dy, dz) || 1);
    const dot = (n[0] * dx + n[1] * dy + n[2] * dz) * il;
    return 0.13 + 0.87 * sstep(dot * 2.4 + 0.42);
  };

  /* ================= acts ================= */
  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);

  const draw = (p, t) => {
    const c = cam(p);
    cth = c.th + (reduce ? 0 : Math.sin(t / 5600) * 0.03);
    cph = c.ph + (reduce ? 0 : Math.sin(t / 7300) * 0.018);
    cd = c.d; ctx3 = [c.tx, c.ty, c.tz];
    sinT = Math.sin(cth); cosT = Math.cos(cth); sinP = Math.sin(cph); cosP = Math.cos(cph);
    CX = ctx3[0] + cd * cosP * sinT; CY = ctx3[1] - cd * sinP; CZ = ctx3[2] - cd * cosP * cosT;
    sref = Math.min(W, Hh) * 0.40;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    buckets = new Map();

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);
    const wingA = sstep((a0 - 0.42) / 0.58);
    const meshOn = sstep(a2 / 0.5);
    const shipDim = 1 - 0.35 * sstep(a4);

    /* act 00 · assemble cloud */
    if (a0 < 1) {
      for (const q of cloud) {
        const k = sstep((a0 * 1.5 - q.st) / 0.5);
        const A = proj(lerp(q.sx, q.tx, k), lerp(q.sy, q.ty, k), lerp(q.sz, q.tz, k));
        if (!A) continue;
        putPt(A[0], A[1], "t", (1 - wingA * 0.94) * dfade(A[2]) * 0.8);
      }
    }

    /* CAD wireframe: features bright, skin faint+culled, internals ghost */
    if (wingA > 0.01) {
      const order = [0, 1, 2, 3];                 // skin → flap → aileron → tips
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const zc = (A[2] + B[2]) / 2;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, mz = (g.a[2] + g.b[2]) / 2;
        let a, w = 1, col = "t";
        if (g.cls === 0) { a = 0.72 * wingA * dfade(zc) * shipDim; w = 1.5; col = "i"; }
        else if (g.cls === 2) { a = 0.10 * wingA * dfade(zc) * shipDim; }
        else { a = 0.30 * wingA * dfade(zc) * facing(mx, my, mz, g.n) * (1 - 0.45 * meshOn) * shipDim; }
        /* act 01 · classification pulse */
        if (a1 > 0 && g.cls !== 2) {
          const at = clamp(a1 * 4.4 - order.indexOf(g.tag) * 1.05, 0, 1);
          if (at > 0 && at < 1) {
            const pulse = Math.sin(at * Math.PI);
            if (pulse > 0.25) { col = "g"; a = Math.max(a, (0.5 + 0.4 * pulse) * dfade(zc)); }
          } else if (at >= 1 && g.tag > 0) {
            a *= 1.25;
          }
        }
        put(A[0], A[1], B[0], B[1], col, a, w);
      }
    }

    /* act 02a · structured surface grid sweeps LE → TE */
    if (a2 > 0) {
      const gt = sstep(a2 / 0.62);
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const on = sstep((gt * 1.45 - g.dle) / 0.22);
        if (on <= 0.01) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const zc = (A[2] + B[2]) / 2;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, mz = (g.a[2] + g.b[2]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.30 * on * dfade(zc) * facing(mx, my, mz, g.n) * shipDim, 1);
      }
    }

    /* act 02b · prism stack at the inspection rib (persists through PROVE) */
    if (a2 > 0.45) {
      const bt = (a2 - 0.45) / 0.55;
      for (let i = 0; i < prism.length; i++) {
        const g = prism[i];
        const kt = sstep((bt * (NLAY + 2) - g.k) / 1.7);
        if (kt <= 0) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const zc = (A[2] + B[2]) / 2;
        put(A[0], A[1], B[0], B[1], "t", (g.wall ? 0.34 : 0.55) * kt * dfade(zc) * shipDim, 1);
      }
    }

    /* act 03 · quality gate sweeps the span */
    if (a3 > 0 && a3 < 1.15) {
      const scanZ = lerp(-SEMI - 0.2, SEMI + 0.2, sstep(a3));
      const gy0 = bb[1] - 0.22, gy1 = bb[4] + 0.22, gx0 = bb[0] - 0.12, gx1 = bb[3] + 0.12;
      const frame = [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]];
      for (let e = 0; e < 4; e++) {
        const A = proj(frame[e][0], frame[e][1], scanZ), B = proj(frame[(e + 1) % 4][0], frame[(e + 1) % 4][1], scanZ);
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.45 * (1 - Math.abs(a3 - 0.5) * 0.7), 1);
      }
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const mz = (g.a[2] + g.b[2]) / 2;
        const near = Math.exp(-Math.pow((mz - scanZ) / 0.09, 2));
        if (near < 0.04) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.55 * near * dfade((A[2] + B[2]) / 2) * facing(mx, my, mz, g.n), 1);
      }
      /* flagged stations flash gold as the gate passes, then settle */
      [-0.62, 0.31].forEach((ff) => {
        const fz = ff * SEMI;
        const passed = scanZ - fz;
        if (passed > 0 && passed < 0.4) {
          const pulse = Math.sin(passed / 0.4 * Math.PI);
          const sec = buildSec(ff, 1);
          for (let j = 0; j < P; j++) {
            const A = proj(sec[j][0], sec[j][1], sec[j][2]), B = proj(sec[(j + 1) % P][0], sec[(j + 1) % P][1], sec[(j + 1) % P][2]);
            if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.7 * pulse * dfade((A[2] + B[2]) / 2), 1.5);
          }
        }
      });
    }

    /* act 04 · export crate draws in */
    if (a4 > 0) {
      for (let e = 0; e < crateEdges.length; e++) {
        const et = clamp(a4 * 2.2 - e * 0.085, 0, 1);
        if (et <= 0) continue;
        const A3 = corners[crateEdges[e][0]], B3 = corners[crateEdges[e][1]];
        const sm = sstep(et);
        const A = proj(A3[0], A3[1], A3[2]);
        const B = proj(lerp(A3[0], B3[0], sm), lerp(A3[1], B3[1], sm), lerp(A3[2], B3[2], sm));
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.5 * dfade((A[2] + B[2]) / 2), 1);
      }
    }

    /* flush */
    for (const b of buckets.values()) {
      if (b.seg.length) {
        ctx.strokeStyle = "rgba(" + COL[b.col] + "," + b.a + ")";
        ctx.lineWidth = b.w;
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

  /* ================= drive ================= */
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
