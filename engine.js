/* ============================================================
   Hexera — engine.html: "Inside the engine"
   Scroll-scrubbed 3D wireframe story, hand-rolled perspective
   projection on 2D canvas. No WebGL, no libraries.

   The specimen: a light-aircraft wing in the RV-12 mould —
   constant chord, no sweep, gentle dihedral, square-ish tip,
   full-span flaperon, main + rear spar with evenly-spaced ribs.
   Simple part, honest detail.

   The mesh is the star, and it follows real rules:
     · chordwise cells cosine-clustered at LE and TE
     · spanwise blocks split exactly at the flaperon side edges,
       Chebyshev-clustered into root, tip and both block bounds
     · an 8-layer prism stack at growth 1.25 (~3.5% chord)
     · then the classic O-grid volume slice at the inspection
       station: rings growing geometrically off the BL stack,
       radial spokes forming quads, and a wake block fanning
       downstream of the trailing edge — viewed face-on.
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

  /* ================= wing definition (RV-12 style) ================= */
  const S = 1.8;                       // semispan
  const CR = 0.72;                     // constant chord — rectangular planform
  const DIHED = 0.035;                 // ~2° dihedral
  const dihedY = (z) => DIHED * z;
  const XO = -0.36, YO = -0.05, ZO = -0.92;

  /* cambered GA airfoil (NACA 2412 family), cosine-spaced loop:
     TE → upper → LE → lower → (TE) */
  const P = 56, H = P / 2;
  const M2 = 0.02, P4 = 0.4;
  const ycam = (x) => x < P4 ? (M2 / (P4 * P4)) * (2 * P4 * x - x * x)
                             : (M2 / ((1 - P4) * (1 - P4))) * ((1 - 2 * P4) + 2 * P4 * x - x * x);
  const ythk = (x) => 5 * 0.12 * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const LX = [], LY = [], LN = [];
  {
    const pts = [];
    for (let i = 0; i <= H; i++) { const x = 0.5 * (1 + Math.cos(Math.PI * i / H)); pts.push([x, ycam(x) + ythk(x)]); }
    for (let i = 1; i < H; i++) { const x = 0.5 * (1 - Math.cos(Math.PI * i / H)); pts.push([x, ycam(x) - ythk(x)]); }
    pts.forEach(([x, y]) => { LX.push(x); LY.push(y); });
    for (let i = 0; i < P; i++) {
      const a = (i - 1 + P) % P, b = (i + 1) % P;
      const tx = LX[b] - LX[a], ty = LY[b] - LY[a];
      const l = Math.hypot(tx, ty) || 1;
      LN.push([-ty / l, tx / l]);
    }
  }
  const LEI = H;
  const jFor = (xc, upper) => {
    let best = upper ? 0 : P - 1, bd = 9;
    for (let j = 0; j < P; j++) {
      if ((j <= H) !== !!upper) continue;
      const d = Math.abs(LX[j] - xc);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };

  /* section at spanwise z (scale < 1 closes the tip) */
  const secAt = (z, scale) => {
    const sc = scale || 1, ch = CR * sc, dy = dihedY(Math.min(z, S));
    const x0 = (1 - sc) * CR * 0.5;
    const out = [];
    for (let j = 0; j < P; j++) {
      out.push([x0 + LX[j] * ch + XO, LY[j] * ch * Math.min(sc * 1.3, 1) + dy + YO, z + ZO]);
    }
    return out;
  };

  /* ================= CAD stations: ribs every 0.15, closed tip ================= */
  const RIBZ = [];
  for (let z = 0; z <= S + 1e-6; z += 0.15) RIBZ.push(+z.toFixed(2));
  const stations = RIBZ.map((z) => ({ pts: secAt(z), z }));
  stations.push({ pts: secAt(S + 0.035, 0.62), z: S + 0.035 });
  stations.push({ pts: secAt(S + 0.06, 0.26), z: S + 0.06 });
  const NSTA = stations.length;

  /* flaperon: full-span single surface, hinge x/c 0.74, z 0.18 → 1.68 */
  const FLAP0 = 0.18, FLAP1 = 1.68, HINGE = 0.74;

  /* segment store: {a,b,n,cls,tag}
     cls: 0 feature(ink) · 1 skin(teal) · 2 internal ghost
     tag: 0 skin · 1 leading edge · 2 flaperon · 3 tip + root */
  const segs = [];
  const n3 = (j) => [LN[j][0], LN[j][1], 0];
  const tagOf = (j, z) => {
    if (z > S - 0.06 || z < 0.05) return 3;
    if (LX[j] < 0.14) return 1;
    if (LX[j] > HINGE && z > FLAP0 && z < FLAP1) return 2;
    return 0;
  };
  const add = (a, b, n, cls, tag) => segs.push({ a, b, n, cls, tag });

  /* skin: rings at every rib + spanwise lines every 2nd loop point */
  stations.forEach((st) => {
    for (let j = 0; j < P; j++) add(st.pts[j], st.pts[(j + 1) % P], n3(j), 1, tagOf(j, st.z));
  });
  for (let j = 0; j < P; j += 2) {
    for (let s = 0; s < NSTA - 1; s++) {
      add(stations[s].pts[j], stations[s + 1].pts[j], n3(j), 1, tagOf(j, stations[s].z));
    }
  }

  /* feature edges: LE · TE rims · root + tip ribs · spar caps · flaperon box */
  const featAlong = (j, s0, s1) => {
    for (let s = s0; s < s1; s++) add(stations[s].pts[j], stations[s + 1].pts[j], 0, 0, 0);
  };
  featAlong(LEI, 0, NSTA - 1);
  featAlong(0, 0, NSTA - 1);
  featAlong(P - 1, 0, NSTA - 1);
  for (let j = 0; j < P; j++) add(stations[0].pts[j], stations[0].pts[(j + 1) % P], 0, 0, 3);
  const tipIdx = RIBZ.length - 1;
  for (let j = 0; j < P; j++) add(stations[tipIdx].pts[j], stations[tipIdx].pts[(j + 1) % P], 0, 0, 3);
  const sparXC = [0.30, 0.70];
  const sparJs = [];
  sparXC.forEach((xc) => {
    const ju = jFor(xc, true), jl = jFor(xc, false);
    sparJs.push([ju, jl]);
    featAlong(ju, 0, tipIdx);
    featAlong(jl, 0, tipIdx);
  });
  /* flaperon hinge + side edges (arcs from hinge around TE) */
  const jH = jFor(HINGE, true);
  const stIdxAt = (z) => { let b = 0, bd = 9; RIBZ.forEach((rz, i) => { const d = Math.abs(rz - z); if (d < bd) { bd = d; b = i; } }); return b; };
  featAlong(jH, stIdxAt(FLAP0), stIdxAt(FLAP1));
  [FLAP0, FLAP1].forEach((z) => {
    const sec = secAt(z);
    for (let j = 0; j < jH; j++) add(sec[j], sec[j + 1], 0, 0, 2);
    for (let j = P - 1; j > P - 1 - jH; j--) add(sec[j], sec[j - 1], 0, 0, 2);
  });
  /* internal: spar webs at every rib + ghost rib outlines */
  for (let s = 0; s <= tipIdx; s++) {
    sparJs.forEach(([ju, jl]) => add(stations[s].pts[ju], stations[s].pts[jl], 0, 2, 0));
    for (let j = 0; j < P; j += 4) add(stations[s].pts[j], stations[s].pts[(j + 4) % P], 0, 2, 0);
  }

  /* ================= fine surface mesh: real multiblock rules =================
     spanwise stations land EXACTLY on root, flaperon edges and tip, with
     Chebyshev clustering into every block boundary */
  const cheb = (a, b, n, skipFirst) => {
    const out = [];
    for (let i = skipFirst ? 1 : 0; i <= n; i++) out.push(lerp(a, b, 0.5 - 0.5 * Math.cos(Math.PI * i / n)));
    return out;
  };
  const fineZ = [
    ...cheb(0, FLAP0, 4),
    ...cheb(FLAP0, FLAP1, 20, true),
    ...cheb(FLAP1, S, 5, true),
  ];
  const fineStations = fineZ.map((z) => ({ pts: secAt(z), z }));
  const NFZ = fineStations.length;
  const fineSegs = [];
  for (let s = 0; s < NFZ; s++) {
    const st = fineStations[s];
    for (let j = 0; j < P; j++) {
      fineSegs.push({ a: st.pts[j], b: st.pts[(j + 1) % P], n: n3(j), dle: Math.abs(j - LEI) / H });
    }
  }
  for (let j = 0; j < P; j++) {
    for (let s = 0; s < NFZ - 1; s++) {
      fineSegs.push({ a: fineStations[s].pts[j], b: fineStations[s + 1].pts[j], n: n3(j), dle: Math.abs(j - LEI) / H });
    }
  }

  /* ================= the O-grid slice at the inspection station =================
     · 8 prism layers, growth 1.25, total 3.5% chord (real BL practice)
     · 10 volume rings continuing at growth 1.38 out to ~half a chord
     · radial spokes every 2nd point → visible quads
     · wake block: lines fanning downstream of the TE with cross-rungs */
  const INS_Z = 0.93;
  const insSec = secAt(INS_Z);
  const NBL = 8, GBL = 1.25, NVOL = 10, GVOL = 1.38;
  const offs = [];
  {
    const totBL = 0.035 * CR;
    const d0 = totBL * (GBL - 1) / (Math.pow(GBL, NBL) - 1);
    let acc = 0;
    for (let k = 0; k < NBL; k++) { acc += d0 * Math.pow(GBL, k); offs.push(acc); }
    let dv = d0 * Math.pow(GBL, NBL);
    for (let k = 0; k < NVOL; k++) { acc += dv; offs.push(acc); dv *= GVOL; }
  }
  const NOFF = offs.length;
  const ringPts = offs.map((d) => insSec.map((p, j) => [p[0] + LN[j][0] * d, p[1] + LN[j][1] * d, p[2]]));
  const ogrid = [];   // {a,b,ring,kind: 0 ring · 1 spoke · 2 wake}
  for (let k = 0; k < NOFF; k++) {
    for (let j = 0; j < P; j++) {
      ogrid.push({ a: ringPts[k][j], b: ringPts[k][(j + 1) % P], ring: k, kind: 0 });
    }
  }
  for (let j = 0; j < P; j += 2) {
    for (let k = 0; k < NOFF; k++) {
      const from = k === 0 ? insSec[j] : ringPts[k - 1][j];
      ogrid.push({ a: from, b: ringPts[k][j], ring: k, kind: 1 });
    }
  }
  /* wake block behind the TE */
  const WX = [0.10, 0.22, 0.38, 0.58];
  const teU = [insSec[0], ...ringPts.map((r) => r[0])];
  const teL = [insSec[P - 1], ...ringPts.map((r) => r[P - 1])];
  [teU, teL].forEach((row) => {
    row.forEach((p, k) => {
      if (k % 1 !== 0) return;
      let prev = p;
      WX.forEach((wx) => {
        const q = [p[0] + wx, p[1] + (p[1] - (dihedY(INS_Z) + YO)) * wx * 0.5, p[2]];
        ogrid.push({ a: prev, b: q, ring: Math.max(k - 1, 0), kind: 2 });
        prev = q;
      });
    });
  });
  WX.forEach((wx) => {
    [teU, teL].forEach((row) => {
      for (let k = 0; k < row.length - 1; k++) {
        const a = row[k], b = row[k + 1];
        const qa = [a[0] + wx, a[1] + (a[1] - (dihedY(INS_Z) + YO)) * wx * 0.5, a[2]];
        const qb = [b[0] + wx, b[1] + (b[1] - (dihedY(INS_Z) + YO)) * wx * 0.5, b[2]];
        ogrid.push({ a: qa, b: qb, ring: k, kind: 2 });
      }
    });
  });
  const insMid = [0.5 * CR + XO + 0.08, dihedY(INS_Z) + YO + 0.01, INS_Z + ZO];

  /* ================= assemble cloud + export crate ================= */
  const cloud = [];
  let seed = 20260703;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  stations.forEach((st) => {
    for (let j = 0; j < P; j += 2) {
      const p = st.pts[j];
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 1.8 + rnd() * 1.3;
      cloud.push({ tx: p[0], ty: p[1], tz: p[2],
        sx: Math.sin(ph) * Math.cos(th) * r, sy: Math.cos(ph) * r * 0.75, sz: Math.sin(ph) * Math.sin(th) * r,
        st: rnd() * 0.55 });
    }
  });
  let bb = [9, 9, 9, -9, -9, -9];
  stations.forEach((st) => st.pts.forEach((p) => {
    bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]),
          Math.max(bb[3], p[0]), Math.max(bb[4], p[1]), Math.max(bb[5], p[2])];
  }));
  const MG = 0.14;
  const corners = [
    [bb[0]-MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[4]+MG, bb[2]-MG], [bb[0]-MG, bb[4]+MG, bb[2]-MG],
    [bb[0]-MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[4]+MG, bb[5]+MG], [bb[0]-MG, bb[4]+MG, bb[5]+MG],
  ];
  const crateEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  /* ================= camera timeline =================
     high-elevation keys so the planform actually reads; the mesh act ends
     face-on down the span — the classic O-grid view */
  const KEYS = [
    { p: 0.00, th: 0.90, ph: 0.50, d: 3.2, t: [0, 0, 0] },
    { p: 0.20, th: 1.50, ph: 0.64, d: 2.3, t: [0, 0, 0] },
    { p: 0.40, th: 2.20, ph: 0.66, d: 2.05, t: [0, 0, 0.05] },
    { p: 0.60, th: 3.14, ph: 0.10, d: 1.15, t: insMid },
    { p: 0.80, th: 3.75, ph: 0.85, d: 2.5, t: [0, 0, 0] },
    { p: 1.00, th: 4.35, ph: 0.40, d: 3.2, t: [0, 0, 0] },
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

  let cth = 0, cph = 0, cd = 3, TGT = [0, 0, 0], sref = 300;
  let sinT = 0, cosT = 1, sinP = 0, cosP = 1;
  let CXp = 0, CYp = 0, CZp = 0;
  const FL = 2.0;
  const proj = (x, y, z) => {
    x -= TGT[0]; y -= TGT[1]; z -= TGT[2];
    const x1 = x * cosT + z * sinT, z1 = -x * sinT + z * cosT;
    const y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
    const zc = z2 + cd;
    if (zc < 0.3) return null;
    const s = FL / zc;
    return [W / 2 + x1 * s * sref, Hh / 2 - y2 * s * sref, zc];
  };
  const dfade = (zc) => clamp(1.7 - zc / cd, 0.15, 1) * sstep((zc - 0.35) / 0.3);
  const facing = (mx, my, mz, n) => {
    if (!n) return 1;
    const dx = CXp - mx, dy = CYp - my, dz = CZp - mz;
    const il = 1 / (Math.hypot(dx, dy, dz) || 1);
    const dot = (n[0] * dx + n[1] * dy + n[2] * dz) * il;
    return 0.12 + 0.88 * sstep(dot * 2.4 + 0.42);
  };

  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);

  const draw = (p, t) => {
    if (!W || !Hh) { resize(); if (!W || !Hh) return; }
    const c = cam(p);
    cth = c.th + (reduce ? 0 : Math.sin(t / 5600) * 0.025);
    cph = c.ph + (reduce ? 0 : Math.sin(t / 7300) * 0.015);
    cd = c.d; TGT = [c.tx, c.ty, c.tz];
    sinT = Math.sin(cth); cosT = Math.cos(cth); sinP = Math.sin(cph); cosP = Math.cos(cph);
    CXp = TGT[0] + cd * cosP * sinT; CYp = TGT[1] - cd * sinP; CZp = TGT[2] - cd * cosP * cosT;
    sref = Math.min(W, Hh) * 0.44;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    buckets = new Map();

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);
    const wingA = sstep((a0 - 0.42) / 0.58);
    const meshOn = sstep(a2 / 0.4);
    const shipDim = 1 - 0.35 * sstep(a4);

    /* act 00 · assemble */
    if (a0 < 1) {
      for (const q of cloud) {
        const k = sstep((a0 * 1.5 - q.st) / 0.5);
        const A = proj(lerp(q.sx, q.tx, k), lerp(q.sy, q.ty, k), lerp(q.sz, q.tz, k));
        if (!A) continue;
        putPt(A[0], A[1], "t", (1 - wingA * 0.94) * dfade(A[2]) * 0.8);
      }
    }

    /* CAD wireframe + act 01 classification */
    if (wingA > 0.01) {
      const order = [0, 1, 2, 3];
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const zc = (A[2] + B[2]) / 2;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, mz = (g.a[2] + g.b[2]) / 2;
        let a, w = 1, col = "t";
        if (g.cls === 0) { a = 0.72 * wingA * dfade(zc) * shipDim; w = 1.5; col = "i"; }
        else if (g.cls === 2) { a = 0.07 * wingA * dfade(zc) * shipDim; }
        else { a = 0.28 * wingA * dfade(zc) * facing(mx, my, mz, g.n) * (1 - 0.55 * meshOn) * shipDim; }
        if (a1 > 0 && g.cls !== 2) {
          const at = clamp(a1 * 4.4 - order.indexOf(g.tag) * 1.05, 0, 1);
          if (at > 0 && at < 1) {
            const pulse = Math.sin(at * Math.PI);
            if (pulse > 0.25) { col = "g"; a = Math.max(a, (0.5 + 0.4 * pulse) * dfade(zc)); }
          } else if (at >= 1 && g.tag > 0) a *= 1.25;
        }
        put(A[0], A[1], B[0], B[1], col, a, w);
      }
    }

    /* act 02a · surface mesh sweeps LE → TE */
    if (a2 > 0) {
      const gt = sstep(a2 / 0.5);
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const on = sstep((gt * 1.45 - g.dle) / 0.22);
        if (on <= 0.01) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, mz = (g.a[2] + g.b[2]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.3 * on * dfade((A[2] + B[2]) / 2) * facing(mx, my, mz, g.n) * shipDim, 1);
      }
    }

    /* act 02b · O-grid slice blooms outward, ring by ring (persists into PROVE) */
    if (a2 > 0.35 && a4 < 0.5) {
      const bt = sstep((a2 - 0.35) / 0.65);
      const fadeOut = 1 - sstep((a4 - 0.1) / 0.4);
      for (let i = 0; i < ogrid.length; i++) {
        const g = ogrid[i];
        const kt = sstep((bt * (NOFF + 4) - g.ring) / 2.2);
        if (kt <= 0.01) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const base = g.kind === 0 ? (g.ring < NBL ? 0.55 : 0.34) : g.kind === 1 ? 0.30 : 0.26;
        put(A[0], A[1], B[0], B[1], "t", base * kt * dfade((A[2] + B[2]) / 2) * fadeOut, 1);
      }
    }

    /* act 03 · quality gate sweeps the span */
    if (a3 > 0 && a3 < 1.15) {
      const scanZ = lerp(bb[2] - 0.1, bb[5] + 0.1, sstep(a3));
      const gy0 = bb[1] - 0.14, gy1 = bb[4] + 0.14, gx0 = bb[0] - 0.1, gx1 = bb[3] + 0.1;
      const frame = [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]];
      for (let e = 0; e < 4; e++) {
        const A = proj(frame[e][0], frame[e][1], scanZ), B = proj(frame[(e + 1) % 4][0], frame[(e + 1) % 4][1], scanZ);
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.42 * (1 - Math.abs(a3 - 0.5) * 0.7), 1);
      }
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const mz = (g.a[2] + g.b[2]) / 2;
        const near = Math.exp(-Math.pow((mz - scanZ) / 0.08, 2));
        if (near < 0.04) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.55 * near * dfade((A[2] + B[2]) / 2) * facing(mx, my, mz, g.n), 1);
      }
      /* flagged where meshes really fail: the flaperon side-edge blocks */
      [FLAP0, FLAP1].forEach((fz) => {
        const passed = scanZ - (fz + ZO);
        if (passed > 0 && passed < 0.38) {
          const pulse = Math.sin(passed / 0.38 * Math.PI);
          const sec = secAt(fz);
          for (let j = 0; j < P; j++) {
            const A = proj(sec[j][0], sec[j][1], sec[j][2]), B = proj(sec[(j + 1) % P][0], sec[(j + 1) % P][1], sec[(j + 1) % P][2]);
            if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.7 * pulse * dfade((A[2] + B[2]) / 2), 1.5);
          }
        }
      });
    }

    /* act 04 · export crate */
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
  // stage can be laid out after script init (fonts, panels) — track its size directly
  if (window.ResizeObserver) {
    new ResizeObserver(() => { resize(); draw(p, performance.now()); ui(p); }).observe(stage);
  }

  onScroll();
  draw(p, 0);
  ui(p);
})();
