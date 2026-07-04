/* ============================================================
   Hexera — engine.html: "Inside the engine"
   Scroll-scrubbed 3D story, rendered with Three.js using the
   standard CAD hidden-line technique: a background-coloured
   solid occluder mesh (polygonOffset) under depth-tested line
   overlays — the far side of the part is genuinely hidden, so
   the render reads like a CAD viewport, not wireframe soup.

   The specimen: a light-aircraft wing in the RV-12 mould —
   constant chord, no sweep, gentle dihedral, square tip,
   full-span flaperon, two spars, evenly spaced ribs.

   The mesh follows real rules:
     · chordwise cells cosine-clustered at LE and TE
     · spanwise blocks split exactly at the flaperon side edges,
       Chebyshev-clustered into root / tip / both block bounds
     · 8 prism layers at growth 1.25 (~3.5% chord)
     · O-grid volume rings at growth 1.38 with radial spokes
       and a wake block behind the TE
   ============================================================ */
(() => {
  "use strict";
  if (!window.THREE) return;
  const T = window.THREE;
  const stage = document.querySelector("[data-eng]");
  if (!stage) return;
  const canvas = stage.querySelector("[data-eng-canvas]");
  if (!canvas) return;
  const track = document.querySelector("[data-eng-track]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ================= wing definition (RV-12 style) ================= */
  const S = 1.8, CR = 0.72, DIHED = 0.035;
  const dihedY = (z) => DIHED * z;
  const XO = -0.36, YO = -0.05, ZO = -0.92;

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
  const secAt = (z, scale) => {
    const sc = scale || 1, ch = CR * sc, dy = dihedY(Math.min(z, S));
    const x0 = (1 - sc) * CR * 0.5;
    const out = [];
    for (let j = 0; j < P; j++) {
      out.push([x0 + LX[j] * ch + XO, LY[j] * ch * Math.min(sc * 1.3, 1) + dy + YO, z + ZO]);
    }
    return out;
  };

  const RIBZ = [];
  for (let z = 0; z <= S + 1e-6; z += 0.15) RIBZ.push(+z.toFixed(2));
  const stations = RIBZ.map((z) => ({ pts: secAt(z), z }));
  stations.push({ pts: secAt(S + 0.035, 0.62), z: S + 0.035 });
  stations.push({ pts: secAt(S + 0.06, 0.26), z: S + 0.06 });
  const NSTA = stations.length, tipIdx = RIBZ.length - 1;

  const FLAP0 = 0.18, FLAP1 = 1.68, HINGE = 0.74;
  const tagOf = (j, z) => {
    if (z > S - 0.06 || z < 0.05) return 3;
    if (LX[j] < 0.14) return 1;
    if (LX[j] > HINGE && z > FLAP0 && z < FLAP1) return 2;
    return 0;
  };

  /* ================= scene ================= */
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x060402, 2.0, 7.0);
  const camera = new T.PerspectiveCamera(40, 1, 0.05, 40);

  const mats = [];                                     // [material, baseOpacity]
  const lineMat = (hex, op, noDepth) => {
    const m = new T.LineBasicMaterial({ color: hex, transparent: true, opacity: op });
    if (noDepth) { m.depthTest = false; }
    mats.push([m, op]);
    return m;
  };
  const TEAL = 0x0fb6ac, GOLD = 0xffba00, INK = 0xebe9e2;

  const lineObj = (arr, mat, order) => {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
    const o = new T.LineSegments(g, mat);
    if (order !== undefined) o.renderOrder = order;
    scene.add(o);
    return o;
  };
  const pushSeg = (arr, a, b) => { arr.push(a[0], a[1], a[2], b[0], b[1], b[2]); };

  /* ---- solid occluder: the hidden-line trick ---- */
  {
    const pos = [];
    const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
    for (let s = 0; s < NSTA - 1; s++) {
      for (let j = 0; j < P; j++) {
        quad(stations[s].pts[j], stations[s + 1].pts[j], stations[s + 1].pts[(j + 1) % P], stations[s].pts[(j + 1) % P]);
      }
    }
    [0, NSTA - 1].forEach((si) => {
      const ring = stations[si].pts;
      const c0 = [0, 0, 0];
      ring.forEach((p) => { c0[0] += p[0] / P; c0[1] += p[1] / P; c0[2] += p[2] / P; });
      for (let j = 0; j < P; j++) pos.push(...c0, ...ring[j], ...ring[(j + 1) % P]);
    });
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const m = new T.MeshBasicMaterial({ color: 0x080603, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2, side: T.DoubleSide });
    const solid = new T.Mesh(g, m);
    solid.renderOrder = 0;
    scene.add(solid);
    var solidMesh = solid;
  }

  /* ---- CAD skin grid, split by tag group for the classify act ---- */
  const tagArr = [[], [], [], []];
  stations.forEach((st) => {
    for (let j = 0; j < P; j++) pushSeg(tagArr[tagOf(j, st.z)], st.pts[j], st.pts[(j + 1) % P]);
  });
  for (let j = 0; j < P; j += 2) {
    for (let s = 0; s < NSTA - 1; s++) {
      pushSeg(tagArr[tagOf(j, stations[s].z)], stations[s].pts[j], stations[s + 1].pts[j]);
    }
  }
  const tagMats = [0, 1, 2, 3].map(() => lineMat(TEAL, 0.34));
  const tagObjs = tagArr.map((arr, i) => lineObj(arr, tagMats[i], 2));

  /* ---- feature edges ---- */
  const featArr = [];
  const featAlong = (j, s0, s1) => { for (let s = s0; s < s1; s++) pushSeg(featArr, stations[s].pts[j], stations[s + 1].pts[j]); };
  featAlong(LEI, 0, NSTA - 1); featAlong(0, 0, NSTA - 1); featAlong(P - 1, 0, NSTA - 1);
  [0, tipIdx].forEach((si) => { for (let j = 0; j < P; j++) pushSeg(featArr, stations[si].pts[j], stations[si].pts[(j + 1) % P]); });
  const sparJs = [];
  [0.30, 0.70].forEach((xc) => {
    const ju = jFor(xc, true), jl = jFor(xc, false);
    sparJs.push([ju, jl]);
    featAlong(ju, 0, tipIdx); featAlong(jl, 0, tipIdx);
  });
  const jH = jFor(HINGE, true);
  const stIdxAt = (z) => { let b = 0, bd = 9; RIBZ.forEach((rz, i) => { const d = Math.abs(rz - z); if (d < bd) { bd = d; b = i; } }); return b; };
  featAlong(jH, stIdxAt(FLAP0), stIdxAt(FLAP1));
  [FLAP0, FLAP1].forEach((z) => {
    const sec = secAt(z);
    for (let j = 0; j < jH; j++) pushSeg(featArr, sec[j], sec[j + 1]);
    for (let j = P - 1; j > P - 1 - jH; j--) pushSeg(featArr, sec[j], sec[j - 1]);
  });
  const featMat = lineMat(INK, 0.85);
  lineObj(featArr, featMat, 3);

  /* ---- internal structure: ghosted through the skin ---- */
  const intArr = [];
  for (let s = 0; s <= tipIdx; s++) {
    sparJs.forEach(([ju, jl]) => pushSeg(intArr, stations[s].pts[ju], stations[s].pts[jl]));
    for (let j = 0; j < P; j += 4) pushSeg(intArr, stations[s].pts[j], stations[s].pts[(j + 4) % P]);
  }
  const intMat = lineMat(TEAL, 0.05, true);
  lineObj(intArr, intMat, 1);

  /* ---- fine surface mesh: multiblock, sorted LE→TE for the sweep reveal ---- */
  const cheb = (a, b, n, skipFirst) => {
    const out = [];
    for (let i = skipFirst ? 1 : 0; i <= n; i++) out.push(lerp(a, b, 0.5 - 0.5 * Math.cos(Math.PI * i / n)));
    return out;
  };
  const fineZ = [...cheb(0, FLAP0, 4), ...cheb(FLAP0, FLAP1, 20, true), ...cheb(FLAP1, S, 5, true)];
  const fineSecs = fineZ.map((z) => secAt(z));
  const fineList = [];
  for (let s = 0; s < fineSecs.length; s++) {
    for (let j = 0; j < P; j++) {
      fineList.push({ a: fineSecs[s][j], b: fineSecs[s][(j + 1) % P], d: Math.abs(j - LEI) / H });
    }
  }
  for (let j = 0; j < P; j++) {
    for (let s = 0; s < fineSecs.length - 1; s++) {
      fineList.push({ a: fineSecs[s][j], b: fineSecs[s + 1][j], d: Math.abs(j - LEI) / H });
    }
  }
  fineList.sort((a, b) => a.d - b.d);
  const fineArr = [];
  fineList.forEach((g) => pushSeg(fineArr, g.a, g.b));
  const fineMat = lineMat(TEAL, 0.4);
  const fineObj = lineObj(fineArr, fineMat, 2);
  const FINE_N = fineList.length;
  fineObj.geometry.setDrawRange(0, 0);

  /* ---- O-grid slice at the inspection station ---- */
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
  const ringPts = offs.map((d) => insSec.map((p, j) => [p[0] + LN[j][0] * d, p[1] + LN[j][1] * d, p[2]]));
  const blArr = [], volArr = [], spokeArr = [], wakeArr = [];
  ringPts.forEach((ring, k) => {
    const arr = k < NBL ? blArr : volArr;
    for (let j = 0; j < P; j++) pushSeg(arr, ring[j], ring[(j + 1) % P]);
  });
  for (let j = 0; j < P; j += 2) {
    for (let k = 0; k < offs.length; k++) {
      pushSeg(spokeArr, k === 0 ? insSec[j] : ringPts[k - 1][j], ringPts[k][j]);
    }
  }
  const WXs = [0.10, 0.22, 0.38, 0.58];
  const chordY = dihedY(INS_Z) + YO;
  const wakeOf = (p, wx) => [p[0] + wx, p[1] + (p[1] - chordY) * wx * 0.5, p[2]];
  [[0], [P - 1]].forEach(([jj]) => {
    const row = [insSec[jj], ...ringPts.map((r) => r[jj])];
    row.forEach((p) => {
      let prev = p;
      WXs.forEach((wx) => { const q = wakeOf(p, wx); pushSeg(wakeArr, prev, q); prev = q; });
    });
    WXs.forEach((wx) => {
      for (let k = 0; k < row.length - 1; k++) pushSeg(wakeArr, wakeOf(row[k], wx), wakeOf(row[k + 1], wx));
    });
  });
  const blMat = lineMat(TEAL, 0.62), volMat = lineMat(TEAL, 0.3), spokeMat = lineMat(TEAL, 0.3), wakeMat = lineMat(TEAL, 0.26);
  lineObj(blArr, blMat, 4); lineObj(volArr, volMat, 4); lineObj(spokeArr, spokeMat, 4); lineObj(wakeArr, wakeMat, 4);
  const insMid = [0.5 * CR + XO + 0.1, chordY, INS_Z + ZO];

  /* ---- CAD viewport ground grid: anchors the model in space ---- */
  const grid = new T.GridHelper(6, 30, 0x0e544e, 0x11332f);
  grid.position.y = -0.42;
  grid.material.transparent = true;
  grid.material.opacity = 0;
  grid.renderOrder = 0;
  scene.add(grid);

  /* ---- assemble cloud ---- */
  const cloud = [];
  let seed = 20260703;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  stations.forEach((st) => {
    for (let j = 0; j < P; j += 2) {
      const p = st.pts[j];
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 1.8 + rnd() * 1.3;
      cloud.push({ t: p, s: [Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.75, Math.sin(ph) * Math.sin(th) * r], st: rnd() * 0.55 });
    }
  });
  const cloudPos = new Float32Array(cloud.length * 3);
  const cloudGeo = new T.BufferGeometry();
  cloudGeo.setAttribute("position", new T.BufferAttribute(cloudPos, 3));
  const cloudMat = new T.PointsMaterial({ color: TEAL, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.85 });
  mats.push([cloudMat, 0.85]);
  const cloudObj = new T.Points(cloudGeo, cloudMat);
  cloudObj.renderOrder = 5;
  scene.add(cloudObj);

  /* ---- gate, flag rings, crate ---- */
  const gateGeo = new T.BufferGeometry();
  {
    const gx0 = XO - 0.1, gx1 = CR + XO + 0.1, gy0 = -0.12 + YO, gy1 = 0.16 + YO;
    gateGeo.setAttribute("position", new T.Float32BufferAttribute([
      gx0, gy0, 0, gx1, gy0, 0, gx1, gy0, 0, gx1, gy1, 0,
      gx1, gy1, 0, gx0, gy1, 0, gx0, gy1, 0, gx0, gy0, 0,
    ], 3));
  }
  const gateMat = lineMat(GOLD, 0.55);
  const gateObj = new T.LineSegments(gateGeo, gateMat);
  gateObj.renderOrder = 6;
  scene.add(gateObj);

  const flagObjs = [FLAP0, FLAP1].map((z) => {
    const sec = secAt(z);
    const arr = [];
    for (let j = 0; j < P; j++) pushSeg(arr, sec[j], sec[(j + 1) % P]);
    const m = lineMat(GOLD, 0.0);
    const o = lineObj(arr, m, 6);
    o.userData.z = z + ZO;
    o.userData.mat = m;
    return o;
  });

  let bb = [9, 9, 9, -9, -9, -9];
  stations.forEach((st) => st.pts.forEach((p) => {
    bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]),
          Math.max(bb[3], p[0]), Math.max(bb[4], p[1]), Math.max(bb[5], p[2])];
  }));
  const MG = 0.14;
  const cnr = [
    [bb[0]-MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[1]-MG, bb[2]-MG], [bb[3]+MG, bb[4]+MG, bb[2]-MG], [bb[0]-MG, bb[4]+MG, bb[2]-MG],
    [bb[0]-MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[1]-MG, bb[5]+MG], [bb[3]+MG, bb[4]+MG, bb[5]+MG], [bb[0]-MG, bb[4]+MG, bb[5]+MG],
  ];
  const crateArr = [];
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a, b]) => pushSeg(crateArr, cnr[a], cnr[b]));
  const crateMat = lineMat(GOLD, 0.55);
  const crateObj = lineObj(crateArr, crateMat, 6);
  crateObj.geometry.setDrawRange(0, 0);

  /* ================= camera timeline =================
     all keys view from the leading-edge side (−x): the wing presents
     LE-forward, root lower-left, tip receding upper-right — the way
     you'd actually frame a wing */
  const KEYS = [
    { p: 0.00, th: 3.80, ph: 0.34, d: 3.4, t: [0, 0.02, 0] },
    { p: 0.20, th: 4.35, ph: 0.50, d: 2.45, t: [0, 0, 0] },
    { p: 0.40, th: 4.95, ph: 0.55, d: 2.15, t: [0, 0, 0.05] },
    { p: 0.60, th: 6.10, ph: 0.13, d: 1.3, t: insMid },
    { p: 0.80, th: 6.80, ph: 0.95, d: 2.6, t: [0, 0, 0] },
    { p: 1.00, th: 7.45, ph: 0.38, d: 3.4, t: [0, 0, 0] },
  ];
  const cam = (p) => {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = sstep((p - a.p) / (b.p - a.p));
    return { th: lerp(a.th, b.th, t), ph: lerp(a.ph, b.ph, t), d: lerp(a.d, b.d, t),
      tx: lerp(a.t[0], b.t[0], t), ty: lerp(a.t[1], b.t[1], t), tz: lerp(a.t[2], b.t[2], t) };
  };

  /* ================= sizing ================= */
  let W = 0, Hh = 0;
  const resize = () => {
    W = stage.clientWidth; Hh = stage.clientHeight;
    if (!W || !Hh) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh;
    camera.updateProjectionMatrix();
  };
  resize();

  const actWin = (p, i) => clamp((p - i * 0.2) / 0.2, 0, 1);
  const cTeal = new T.Color(TEAL), cGold = new T.Color(GOLD);

  const draw = (p, t) => {
    if (!W || !Hh) { resize(); if (!W || !Hh) return; }
    const c = cam(p);
    const th = c.th + (reduce ? 0 : Math.sin(t / 5600) * 0.02);
    const ph = c.ph + (reduce ? 0 : Math.sin(t / 7300) * 0.012);
    camera.position.set(
      c.tx + c.d * Math.cos(ph) * Math.sin(th),
      c.ty + c.d * Math.sin(ph),
      c.tz + c.d * Math.cos(ph) * Math.cos(th)
    );
    camera.lookAt(c.tx, c.ty, c.tz);
    scene.fog.near = c.d * 0.55;
    scene.fog.far = c.d * 3.2;

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);
    const wingA = sstep((a0 - 0.42) / 0.58);
    const meshOn = sstep(a2 / 0.4);
    const shipDim = 1 - 0.4 * sstep(a4);

    /* assemble cloud */
    cloudObj.visible = a0 < 1;
    if (cloudObj.visible) {
      for (let i = 0; i < cloud.length; i++) {
        const q = cloud[i], k = sstep((a0 * 1.5 - q.st) / 0.5);
        cloudPos[i * 3] = lerp(q.s[0], q.t[0], k);
        cloudPos[i * 3 + 1] = lerp(q.s[1], q.t[1], k);
        cloudPos[i * 3 + 2] = lerp(q.s[2], q.t[2], k);
      }
      cloudGeo.attributes.position.needsUpdate = true;
      cloudMat.opacity = 0.85 * (1 - wingA * 0.95);
    }

    /* solid occluder appears once the shape has mostly landed */
    solidMesh.visible = wingA > 0.3;
    grid.material.opacity = 0.13 * wingA * (1 - 0.65 * sstep((a2 - 0.55) / 0.3) * (1 - sstep(a3 / 0.3)));

    /* CAD skin + classification pulses */
    const order = [0, 1, 2, 3];
    tagMats.forEach((m, i) => {
      let op = 0.34 * wingA * (1 - 0.55 * meshOn) * shipDim;
      m.color.copy(cTeal);
      if (a1 > 0) {
        const at = clamp(a1 * 4.4 - order.indexOf(i) * 1.05, 0, 1);
        if (at > 0 && at < 1) {
          const pulse = Math.sin(at * Math.PI);
          m.color.lerpColors(cTeal, cGold, pulse);
          op = Math.max(op, 0.75 * pulse);
        } else if (at >= 1 && i > 0) op *= 1.35;
      }
      m.opacity = op;
    });
    featMat.opacity = 0.85 * wingA * shipDim;
    intMat.opacity = 0.05 * wingA * shipDim;

    /* fine mesh sweep LE → TE */
    const gt = sstep(a2 / 0.5);
    fineObj.geometry.setDrawRange(0, Math.floor(FINE_N * sstep(gt * 1.15)) * 2);
    fineMat.opacity = 0.4 * shipDim;

    /* O-grid staged build-out */
    const bl = sstep((a2 - 0.4) / 0.25), sp = sstep((a2 - 0.52) / 0.28), vl = sstep((a2 - 0.62) / 0.3), wk = sstep((a2 - 0.74) / 0.26);
    const ogDim = (1 - sstep((a4 - 0.05) / 0.35));
    blMat.opacity = 0.62 * bl * ogDim;
    spokeMat.opacity = 0.3 * sp * ogDim;
    volMat.opacity = 0.3 * vl * ogDim;
    wakeMat.opacity = 0.26 * wk * ogDim;

    /* quality gate */
    gateObj.visible = a3 > 0 && a3 < 1.15;
    if (gateObj.visible) {
      const scanZ = lerp(bb[2] - 0.1, bb[5] + 0.1, sstep(a3));
      gateObj.position.z = scanZ;
      gateMat.opacity = 0.55 * (1 - Math.abs(a3 - 0.5) * 0.8);
      flagObjs.forEach((o) => {
        const passed = scanZ - o.userData.z;
        o.userData.mat.opacity = (passed > 0 && passed < 0.38) ? 0.8 * Math.sin(passed / 0.38 * Math.PI) : 0;
      });
    } else flagObjs.forEach((o) => { o.userData.mat.opacity = 0; });

    /* export crate */
    crateObj.geometry.setDrawRange(0, Math.floor(12 * clamp(a4 * 1.9, 0, 1)) * 2);
    crateMat.opacity = 0.55;

    renderer.render(scene, camera);
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
  if (window.ResizeObserver) {
    new ResizeObserver(() => { resize(); draw(p, performance.now()); ui(p); }).observe(stage);
  }

  onScroll();
  draw(p, 0);
  ui(p);
})();
