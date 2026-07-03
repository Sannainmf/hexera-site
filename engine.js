/* ============================================================
   Hexera — engine.html: "Inside the engine"
   Scroll-scrubbed 3D wireframe story, hand-rolled perspective
   projection on 2D canvas. No WebGL, no libraries.

   The specimen: a transport-aircraft half-wing modelled like the
   real thing —
     · Yehudi kink planform: straight inboard trailing edge,
       kinked at 35% semispan, swept outboard
     · 24° LE sweep, taper 0.24, straight 6° dihedral, 3° washout
     · cambered sections, t/c 14% → 10% root to tip
     · blended winglet: curved transition to 78° cant
     · LE slat + dividers, flap with hinge + kink split, aileron,
       three spoiler panels, two flap-track canoe fairings
     · front/rear spars with rib webs, closed root rib
   The mesh follows real multiblock rules: spanwise stations land
   exactly on the root / kink / tip / winglet block boundaries
   with Chebyshev clustering into each; chordwise cosine
   clustering at LE and TE; 8 prism layers at 1.35 growth
   totalling ~8% of local chord at the inspection rib.
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

  /* ================= planform (all lengths in chords of the root) ================= */
  const S = 2.0;                        // semispan
  const KINK = 0.70;                    // Yehudi kink station
  const CR = 0.85;                      // root chord
  const SWEEP_LE = 0.44;                // LE x at tip
  const XTE_TIP = 0.64;                 // TE x at tip
  const DIHED = 0.105;                  // tan(6°)
  const TWIST = -0.052;                 // 3° washout at tip
  const xLE = (z) => SWEEP_LE * (z / S);
  const xTE = (z) => z <= KINK ? CR : lerp(CR, XTE_TIP, (z - KINK) / (S - KINK));
  const chordAtZ = (z) => xTE(z) - xLE(z);
  const dihedY = (z) => DIHED * z;
  const thickScale = (z) => lerp(1.17, 0.83, z / S);   // t/c 14% → 10%

  // model recentring so it orbits nicely
  const XO = -0.46, YO = -0.15, ZO = -1.06;

  /* ================= section loop: cambered airfoil, cosine spacing =================
     NACA 2412 family camber; loop runs TE → upper → LE → lower → (TE) */
  const P = 56, H = P / 2;
  const M2 = 0.02, P4 = 0.4;
  const ycam = (x) => x < P4 ? (M2 / (P4 * P4)) * (2 * P4 * x - x * x)
                             : (M2 / ((1 - P4) * (1 - P4))) * ((1 - 2 * P4) + 2 * P4 * x - x * x);
  const ythk = (x) => 5 * 0.12 * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const LX = [], LC = [], LT = [], LN = [];            // x/c, camber, ±thickness, 2D normal
  {
    const pts = [];
    for (let i = 0; i <= H; i++) { const x = 0.5 * (1 + Math.cos(Math.PI * i / H)); pts.push([x, 1]); }
    for (let i = 1; i < H; i++) { const x = 0.5 * (1 - Math.cos(Math.PI * i / H)); pts.push([x, -1]); }
    pts.forEach(([x, sd]) => { LX.push(x); LC.push(ycam(x)); LT.push(sd * ythk(x)); });
    for (let i = 0; i < P; i++) {
      const a = (i - 1 + P) % P, b = (i + 1) % P;
      const tx = (LX[b] - LX[a]), ty = (LC[b] + LT[b]) - (LC[a] + LT[a]);
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

  /* main-wing section at spanwise z */
  const secMain = (z) => {
    const ch = chordAtZ(z), xle = xLE(z), dy = dihedY(z), ts = thickScale(z);
    const tw = TWIST * (z / S), cw = Math.cos(tw), sw = Math.sin(tw);
    const out = [];
    for (let j = 0; j < P; j++) {
      let x = LX[j] * ch, y = (LC[j] + LT[j] * ts) * ch;
      const dx = x - 0.25 * ch;
      x = 0.25 * ch + dx * cw - y * sw; y = dx * sw + y * cw;
      out.push([xle + x + XO, dy + y + YO, z + ZO]);
    }
    return out;
  };

  /* blended winglet: circular-arc cant transition then straight extension.
     s ∈ [0,1] along the winglet; returns { pts, chi } */
  const CANT = 1.36, RB = 0.24, LEXT = 0.16;
  const ARCL = RB * CANT;
  const WTOT = ARCL + LEXT;
  const secWing = (s, capScale) => {
    const al = s * WTOT;
    let chi, py, pz;
    if (al <= ARCL) {
      chi = al / RB;
      py = dihedY(S) + RB * (1 - Math.cos(chi));
      pz = S + RB * Math.sin(chi);
    } else {
      chi = CANT;
      const e = al - ARCL;
      py = dihedY(S) + RB * (1 - Math.cos(CANT)) + Math.sin(CANT) * e;
      pz = S + RB * Math.sin(CANT) + Math.cos(CANT) * e;
    }
    const ch = lerp(chordAtZ(S), 0.10, s) * (capScale || 1);
    const xle = SWEEP_LE + 0.17 * s + (capScale ? (1 - capScale) * ch * 0.3 : 0);
    const ts = lerp(0.83, 0.72, s);
    const cc = Math.cos(chi), sc = Math.sin(chi);
    const out = [];
    for (let j = 0; j < P; j++) {
      const x = LX[j] * ch, y = (LC[j] + LT[j] * ts) * ch;
      out.push([xle + x + XO, py + y * cc + YO, pz - y * sc + ZO]);
    }
    return { pts: out, chi };
  };

  /* ================= CAD stations ================= */
  const mainZ = [0, 0.08, 0.18, 0.30, 0.42, 0.55, KINK, 0.85, 1.0, 1.15, 1.30, 1.45, 1.60, 1.75, 1.88, 2.0];
  const wingS = [0.16, 0.34, 0.52, 0.70, 0.86, 1.0];
  const stations = [];                     // {pts, z, chi, wing:bool}
  mainZ.forEach((z) => stations.push({ pts: secMain(z), z, chi: 0, wing: false }));
  wingS.forEach((s) => { const w = secWing(s); stations.push({ pts: w.pts, z: S + s, chi: w.chi, wing: true }); });
  const capA = secWing(1.005, 0.55), capB = secWing(1.01, 0.22);
  const NSTA = stations.length;

  /* segment store: {a,b,n,cls,tag,z}
     cls: 0 feature(ink) · 1 skin(teal) · 2 internal ghost · tag groups:
     0 skin · 1 high-lift (slat+flap) · 2 controls (aileron+spoilers) · 3 winglet */
  const segs = [];
  const n3 = (j, chi) => [LN[j][0], LN[j][1] * Math.cos(chi || 0), -(LN[j][1]) * Math.sin(chi || 0)];
  const tagOf = (j, z, wing) => {
    if (wing) return 3;
    const xc = LX[j], up = j <= H;
    if (xc < 0.13 && z > 0.05 && z < 1.92) return 1;                       // slat
    if (xc > 0.72 && z < 1.26) return 1;                                   // flap
    if (xc > 0.75 && z >= 1.32 && z <= 1.90) return 2;                     // aileron
    if (up && xc > 0.50 && xc < 0.70 && z > 0.22 && z < 1.22) return 2;    // spoilers
    return 0;
  };
  const add = (a, b, n, cls, tag, z) => segs.push({ a, b, n, cls, tag, z });

  /* skin rings (every station) + spanwise lines (every 4th loop point) */
  stations.forEach((st) => {
    for (let j = 0; j < P; j++) {
      add(st.pts[j], st.pts[(j + 1) % P], n3(j, st.chi), 1, tagOf(j, st.z, st.wing), st.z);
    }
  });
  for (let j = 0; j < P; j += 4) {
    for (let s = 0; s < NSTA - 1; s++) {
      const a = stations[s], b = stations[s + 1];
      add(a.pts[j], b.pts[j], n3(j, a.chi), 1, tagOf(j, a.z, a.wing), a.z);
    }
  }
  /* winglet cap */
  [capA, capB].forEach((cap, ci) => {
    const prev = ci === 0 ? stations[NSTA - 1].pts : capA.pts;
    for (let j = 0; j < P; j += 2) {
      add(cap.pts[j], cap.pts[(j + 2) % P], n3(j, cap.chi), 1, 3, S + 1);
      add(prev[j], cap.pts[j], n3(j, cap.chi), 1, 3, S + 1);
    }
  });

  /* ---- feature edges (bright ink) ---- */
  const featAlong = (j, s0, s1) => {
    for (let s = s0; s < s1; s++) add(stations[s].pts[j], stations[s + 1].pts[j], 0, 0, 0, stations[s].z);
  };
  featAlong(LEI, 0, NSTA - 1);                          // leading edge, root → winglet tip
  featAlong(0, 0, NSTA - 1);                            // TE upper rim
  featAlong(P - 1, 0, NSTA - 1);                        // TE lower rim
  /* root rib: closed ring + spar webs (symmetry-plane cut) */
  for (let j = 0; j < P; j++) add(stations[0].pts[j], stations[0].pts[(j + 1) % P], 0, 0, 0, 0);
  /* spar caps at x/c 0.22 / 0.68, upper + lower, main wing only */
  const sparXC = [0.22, 0.68];
  const sparJs = [];
  sparXC.forEach((xc) => {
    const ju = jFor(xc, true), jl = jFor(xc, false);
    sparJs.push([ju, jl]);
    featAlong(ju, 0, mainZ.length - 1);
    featAlong(jl, 0, mainZ.length - 1);
  });
  /* slat spanwise break (x/c 0.12 upper · 0.06 lower) + 3 slat dividers */
  const jSlatU = jFor(0.12, true), jSlatL = jFor(0.06, false);
  const stIdxAt = (z) => { let b = 0, bd = 9; mainZ.forEach((mz, i) => { const d = Math.abs(mz - z); if (d < bd) { bd = d; b = i; } }); return b; };
  featAlong(jSlatU, stIdxAt(0.08), stIdxAt(1.88));
  featAlong(jSlatL, stIdxAt(0.08), stIdxAt(1.88));
  [0.55, 1.15, 1.6].forEach((z) => {
    const sec = secMain(z);
    for (let j = jSlatU; j < jSlatL; j++) add(sec[j], sec[j + 1], 0, 0, 1, z);
  });
  /* flap hinge (x/c 0.72 upper) root→0.62S with a split at the kink; side edges to TE */
  const jFlap = jFor(0.72, true);
  featAlong(jFlap, stIdxAt(0.08), stIdxAt(1.26));
  [0.08, KINK, 1.26].forEach((z) => {
    const sec = secMain(z);
    for (let j = 0; j < jFlap; j++) add(sec[j], sec[j + 1], 0, 0, 1, z);
  });
  /* aileron box (x/c 0.75 upper) 1.32 → 1.90 */
  const jAil = jFor(0.75, true);
  featAlong(jAil, stIdxAt(1.30), stIdxAt(1.88));
  [1.32, 1.90].forEach((z) => {
    const sec = secMain(z);
    for (let j = 0; j < jAil; j++) add(sec[j], sec[j + 1], 0, 0, 2, z);
  });
  /* spoiler panels: upper x/c 0.50–0.68, z 0.22–1.22, two dividers */
  const jSp0 = jFor(0.50, true);
  featAlong(jSp0, stIdxAt(0.22), stIdxAt(1.22));
  [0.22, 0.55, 0.88, 1.22].forEach((z) => {
    const sec = secMain(z);
    for (let j = sparJs[1][0]; j < jSp0; j++) add(sec[j], sec[j + 1], 0, 0, 2, z);
  });
  /* flap-track canoe fairings under the TE at z 0.36 / 0.62 */
  [0.36, 0.62].forEach((zc) => {
    const ch = chordAtZ(zc), xle = xLE(zc), dy = dihedY(zc);
    const yb = dy + (ycam(0.8) - ythk(0.8) * thickScale(zc)) * ch;
    const x0 = xle + 0.58 * ch, x1 = xTE(zc) + 0.20, xm = xle + 0.95 * ch;
    const keel = [[x0, yb - 0.005], [xm, yb - 0.052], [x1, yb - 0.012]];
    [-0.016, 0.016].forEach((dz) => {
      for (let i = 0; i < keel.length - 1; i++) {
        add([keel[i][0] + XO, keel[i][1] + YO, zc + dz + ZO], [keel[i + 1][0] + XO, keel[i + 1][1] + YO, zc + dz + ZO], 0, 0, 0, zc);
      }
      add([x0 + XO, yb + YO, zc + ZO], [x0 + 0.1 + XO, yb - 0.045 + YO, zc + dz + ZO], 0, 0, 0, zc);
      add([xm + XO, yb - 0.052 + YO, zc + dz + ZO], [x1 + XO, yb - 0.012 + YO, zc + ZO], 0, 0, 0, zc);
    });
  });
  /* internal structure: spar webs + rib outlines (ghosted) */
  for (let s = 0; s < mainZ.length; s++) {
    sparJs.forEach(([ju, jl]) => add(stations[s].pts[ju], stations[s].pts[jl], 0, 2, 0, stations[s].z));
    if (s % 2 === 1) {
      for (let j = 0; j < P; j += 4) add(stations[s].pts[j], stations[s].pts[(j + 4) % P], 0, 2, 0, stations[s].z);
    }
  }

  /* ================= fine mesh: multiblock surface grid =================
     spanwise stations land exactly on block boundaries (root · kink · tip ·
     winglet) with Chebyshev clustering into each — real topology rules */
  const cheb = (a, b, n, skipFirst) => {
    const out = [];
    for (let i = skipFirst ? 1 : 0; i <= n; i++) out.push(lerp(a, b, 0.5 - 0.5 * Math.cos(Math.PI * i / n)));
    return out;
  };
  const fineStations = [];
  cheb(0, KINK, 11).forEach((z) => fineStations.push({ pts: secMain(z), chi: 0, z }));
  cheb(KINK, S, 15, true).forEach((z) => fineStations.push({ pts: secMain(z), chi: 0, z }));
  cheb(0, 1, 9, true).forEach((s) => { const w = secWing(s); fineStations.push({ pts: w.pts, chi: w.chi, z: S + s }); });
  const NF = fineStations.length;
  const fineSegs = [];
  for (let s = 0; s < NF; s++) {
    const st = fineStations[s];
    for (let j = 0; j < P; j++) {
      fineSegs.push({ a: st.pts[j], b: st.pts[(j + 1) % P], n: n3(j, st.chi), dle: Math.abs(j - LEI) / H });
    }
  }
  for (let j = 0; j < P; j++) {
    for (let s = 0; s < NF - 1; s++) {
      const a = fineStations[s], b = fineStations[s + 1];
      fineSegs.push({ a: a.pts[j], b: b.pts[j], n: n3(j, a.chi), dle: Math.abs(j - LEI) / H });
    }
  }

  /* ================= prism stack at the inspection rib =================
     8 layers, growth 1.35, total ~8% of local chord — correct BL scaling */
  const INS_Z = 1.10;
  const insSec = secMain(INS_Z);
  const insCh = chordAtZ(INS_Z);
  const NLAY = 8, GROW = 1.35;
  const TOT = 0.08 * insCh;
  const D0 = TOT * (GROW - 1) / (Math.pow(GROW, NLAY) - 1);
  const layD = []; { let acc = 0; for (let k = 0; k < NLAY; k++) { acc += D0 * Math.pow(GROW, k); layD.push(acc); } }
  const prism = [];
  for (let k = 0; k < NLAY; k++) {
    const d = layD[k];
    for (let j = 0; j < P; j++) {
      const na = LN[j], nb = LN[(j + 1) % P];
      prism.push({ a: [insSec[j][0] + na[0] * d, insSec[j][1] + na[1] * d, insSec[j][2]],
                   b: [insSec[(j + 1) % P][0] + nb[0] * d, insSec[(j + 1) % P][1] + nb[1] * d, insSec[(j + 1) % P][2]], k, wall: false });
    }
    for (let j = 0; j < P; j += 2) {
      const n = LN[j], d0 = k === 0 ? 0 : layD[k - 1];
      prism.push({ a: [insSec[j][0] + n[0] * d0, insSec[j][1] + n[1] * d0, insSec[j][2]],
                   b: [insSec[j][0] + n[0] * d, insSec[j][1] + n[1] * d, insSec[j][2]], k, wall: true });
    }
  }
  const insMid = [insSec[Math.floor(H * 0.55)][0], insSec[Math.floor(H * 0.55)][1] + 0.02, insSec[0][2]];

  /* ================= assemble cloud + export crate ================= */
  const cloud = [];
  let seed = 20260703;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  stations.forEach((st) => {
    for (let j = 0; j < P; j += 2) {
      const p = st.pts[j];
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 1.9 + rnd() * 1.4;
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
  const MG = 0.15;
  const corners = [
    [bb[0]-MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[4]+MG, bb[2]-MG], [bb[0]-MG, bb[4]+MG, bb[2]-MG],
    [bb[0]-MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[4]+MG, bb[5]+MG], [bb[0]-MG, bb[4]+MG, bb[5]+MG],
  ];
  const crateEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  /* ================= camera timeline ================= */
  const KEYS = [
    { p: 0.00, th: 0.85, ph: 0.24, d: 3.7, t: [0, 0, 0] },
    { p: 0.20, th: 1.55, ph: 0.40, d: 2.55, t: [0, 0.02, 0.05] },
    { p: 0.40, th: 2.30, ph: 0.52, d: 2.3, t: [0, 0, 0.1] },
    { p: 0.60, th: 2.95, ph: 0.22, d: 1.05, t: [insMid[0], insMid[1], insMid[2] * 0.9] },
    { p: 0.80, th: 3.60, ph: 0.85, d: 2.75, t: [0, 0, 0.05] },
    { p: 1.00, th: 4.30, ph: 0.24, d: 3.8, t: [0, 0, 0] },
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
  const dfade = (zc) => clamp(1.7 - zc / cd, 0.15, 1);
  const facing = (mx, my, mz, n) => {
    if (!n) return 1;
    const dx = CXp - mx, dy = CYp - my, dz = CZp - mz;
    const il = 1 / (Math.hypot(dx, dy, dz) || 1);
    const dot = (n[0] * dx + n[1] * dy + n[2] * dz) * il;
    return 0.12 + 0.88 * sstep(dot * 2.4 + 0.42);
  };

  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);

  const draw = (p, t) => {
    const c = cam(p);
    cth = c.th + (reduce ? 0 : Math.sin(t / 5600) * 0.028);
    cph = c.ph + (reduce ? 0 : Math.sin(t / 7300) * 0.016);
    cd = c.d; TGT = [c.tx, c.ty, c.tz];
    sinT = Math.sin(cth); cosT = Math.cos(cth); sinP = Math.sin(cph); cosP = Math.cos(cph);
    CXp = TGT[0] + cd * cosP * sinT; CYp = TGT[1] - cd * sinP; CZp = TGT[2] - cd * cosP * cosT;
    sref = Math.min(W, Hh) * 0.42;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    buckets = new Map();

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);
    const wingA = sstep((a0 - 0.42) / 0.58);
    const meshOn = sstep(a2 / 0.5);
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

    /* CAD wireframe */
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
        else if (g.cls === 2) { a = 0.09 * wingA * dfade(zc) * shipDim; }
        else { a = 0.26 * wingA * dfade(zc) * facing(mx, my, mz, g.n) * (1 - 0.5 * meshOn) * shipDim; }
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

    /* act 02a · multiblock surface grid sweeps LE → TE */
    if (a2 > 0) {
      const gt = sstep(a2 / 0.62);
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const on = sstep((gt * 1.45 - g.dle) / 0.22);
        if (on <= 0.01) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2, mz = (g.a[2] + g.b[2]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.30 * on * dfade((A[2] + B[2]) / 2) * facing(mx, my, mz, g.n) * shipDim, 1);
      }
    }

    /* act 02b · prism stack at the inspection rib */
    if (a2 > 0.45) {
      const bt = (a2 - 0.45) / 0.55;
      for (let i = 0; i < prism.length; i++) {
        const g = prism[i];
        const kt = sstep((bt * (NLAY + 2) - g.k) / 1.7);
        if (kt <= 0) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        put(A[0], A[1], B[0], B[1], "t", (g.wall ? 0.34 : 0.6) * kt * dfade((A[2] + B[2]) / 2) * shipDim, 1);
      }
    }

    /* act 03 · quality gate sweeps root → winglet */
    if (a3 > 0 && a3 < 1.15) {
      const scanZ = lerp(bb[2] - 0.12, bb[5] + 0.12, sstep(a3));
      const gy0 = bb[1] - 0.15, gy1 = bb[4] + 0.15, gx0 = bb[0] - 0.1, gx1 = bb[3] + 0.1;
      const frame = [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]];
      for (let e = 0; e < 4; e++) {
        const A = proj(frame[e][0], frame[e][1], scanZ), B = proj(frame[(e + 1) % 4][0], frame[(e + 1) % 4][1], scanZ);
        if (A && B) put(A[0], A[1], B[0], B[1], "g", 0.42 * (1 - Math.abs(a3 - 0.5) * 0.7), 1);
      }
      for (let i = 0; i < fineSegs.length; i++) {
        const g = fineSegs[i];
        const mz = (g.a[2] + g.b[2]) / 2;
        const near = Math.exp(-Math.pow((mz - scanZ) / 0.085, 2));
        if (near < 0.04) continue;
        const A = proj(g.a[0], g.a[1], g.a[2]); if (!A) continue;
        const B = proj(g.b[0], g.b[1], g.b[2]); if (!B) continue;
        const mx = (g.a[0] + g.b[0]) / 2, my = (g.a[1] + g.b[1]) / 2;
        put(A[0], A[1], B[0], B[1], "t", 0.55 * near * dfade((A[2] + B[2]) / 2) * facing(mx, my, mz, g.n), 1);
      }
      /* flagged at the geometric breaks — kink and aileron junction */
      [KINK, 1.32].forEach((fz) => {
        const passed = scanZ - (fz + ZO);
        if (passed > 0 && passed < 0.4) {
          const pulse = Math.sin(passed / 0.4 * Math.PI);
          const sec = secMain(fz);
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

  onScroll();
  draw(p, 0);
  ui(p);
})();
