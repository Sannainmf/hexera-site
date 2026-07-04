/* ============================================================
   Hexera — engine.html: "Inside the engine"
   Scroll-scrubbed 3D story rendered with Three.js using the CAD
   hidden-line technique: a background-coloured solid occluder
   (polygonOffset) under depth-tested line overlays.

   The specimen: a lifting-lug bracket — the canonical FEA case.
   A standing plate with a semicircular head, a large pin bore,
   and a clamped base. The mesh is the classic butterfly web:
   rings radiating from the bore to the part outline, spokes
   forming quads, geometric clustering into the bore edge where
   the stress concentration lives, and hex layers through the
   thickness. The quality pass flags the bore edge — where lug
   stress actually peaks — and re-refines it on the spot.

   Acts:
     00 READ   · the part assembles from a scattered point cloud
     01 TAG    · bore / clamped base / walls / faces classified
     02 MESH   · the web generates ring-by-ring from the bore
                 while the camera dives to the hole
     03 PROVE  · a gate sweeps the part; the bore edge flashes
                 and picks up an h-refinement band
     04 SHIP   · export crate draws closed, camera pulls wide
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

  /* ================= lug geometry =================
     outline: shank |x| ≤ 0.5 from y = −1.0 up to y = 0.55, then a
     semicircular head of radius 0.5 centred on the bore centre C.
     bore r = 0.22 at C = (0, 0.55). thickness 0.16 (z ± 0.08).
     the domain is star-shaped about C, so the whole part meshes as
     one polar web: rings from the bore out to the boundary. */
  const CX = 0, CY = 0.55;
  const RH = 0.5, RB = 0.22, YB = -1.0, HW = 0.5, TH = 0.08;
  const NT = 64, NR = 18;

  /* distance from bore centre to the outline along direction a */
  const Rbound = (a) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    if (dy >= 0) return RH;                                  // head arc (centred on C)
    const cands = [];
    if (dx > 1e-6) cands.push((HW - CX) / dx);
    if (dx < -1e-6) cands.push((-HW - CX) / dx);
    cands.push((YB - CY) / dy);
    return Math.min(...cands.filter((c) => c > 0));
  };
  /* radial clustering into the bore edge (stress-raiser refinement) */
  const rAt = (a, i) => {
    const t = Math.pow(i / NR, 1.55);
    return lerp(RB, Rbound(a), t);
  };
  const webPt = (i, j, z) => {
    const a = (j / NT) * Math.PI * 2 + Math.PI / 2;          // spoke 0 points up through the head
    return [CX + Math.cos(a) * rAt(a, i), CY + Math.sin(a) * rAt(a, i), z];
  };

  /* ================= scene ================= */
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x060402, 2.0, 8.0);
  const camera = new T.PerspectiveCamera(40, 1, 0.05, 40);

  const mats = [];
  const lineMat = (hex, op, noDepth) => {
    const m = new T.LineBasicMaterial({ color: hex, transparent: true, opacity: op });
    if (noDepth) m.depthTest = false;
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

  /* ---- solid occluder: front + back faces, bore wall, outer wall ---- */
  let solidMesh;
  {
    const pos = [];
    const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
    [TH, -TH].forEach((z) => {
      for (let i = 0; i < NR; i++) {
        for (let j = 0; j < NT; j++) {
          quad(webPt(i, j, z), webPt(i + 1, j, z), webPt(i + 1, (j + 1) % NT, z), webPt(i, (j + 1) % NT, z));
        }
      }
    });
    for (let j = 0; j < NT; j++) {
      quad(webPt(0, j, TH), webPt(0, (j + 1) % NT, TH), webPt(0, (j + 1) % NT, -TH), webPt(0, j, -TH));
      quad(webPt(NR, j, TH), webPt(NR, (j + 1) % NT, TH), webPt(NR, (j + 1) % NT, -TH), webPt(NR, j, -TH));
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    const m = new T.MeshBasicMaterial({ color: 0x080603, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2, side: T.DoubleSide });
    solidMesh = new T.Mesh(g, m);
    solidMesh.renderOrder = 0;
    scene.add(solidMesh);
  }

  /* ---- feature edges: outlines, bore rims, shank corners ---- */
  const featArr = [];
  [TH, -TH].forEach((z) => {
    for (let j = 0; j < NT; j++) {
      pushSeg(featArr, webPt(NR, j, z), webPt(NR, (j + 1) % NT, z));   // outline
      pushSeg(featArr, webPt(0, j, z), webPt(0, (j + 1) % NT, z));     // bore rim
    }
  });
  [[HW, YB], [-HW, YB], [HW, CY], [-HW, CY]].forEach(([x, y]) => {
    pushSeg(featArr, [x, y, TH], [x, y, -TH]);                          // corner verticals
  });
  pushSeg(featArr, [-HW, YB, TH], [HW, YB, TH]);
  pushSeg(featArr, [-HW, YB, -TH], [HW, YB, -TH]);
  const featMat = lineMat(INK, 0.85);
  lineObj(featArr, featMat, 3);

  /* ---- tag groups for the classify act ----
     0 faces (front web, sparse) · 1 bore wall · 2 outer walls · 3 clamped base */
  const gFace = [], gBore = [], gWall = [], gBase = [];
  [TH, -TH].forEach((z) => {
    for (let i = 2; i <= NR; i += 2) {
      for (let j = 0; j < NT; j++) pushSeg(gFace, webPt(i, j, z), webPt(i, (j + 1) % NT, z));
    }
    for (let j = 0; j < NT; j += 2) {
      for (let i = 0; i < NR; i++) pushSeg(gFace, webPt(i, j, z), webPt(i + 1, j, z));
    }
  });
  for (let j = 0; j < NT; j++) {
    pushSeg(gBore, webPt(0, j, TH), webPt(0, j, -TH));
    pushSeg(gBore, webPt(0, j, 0), webPt(0, (j + 1) % NT, 0));         // bore wall mid-ring
    pushSeg(gWall, webPt(NR, j, TH), webPt(NR, j, -TH));
  }
  for (let j = 0; j < NT; j++) {                                       // outer wall mid-ring
    pushSeg(gWall, webPt(NR, j, 0), webPt(NR, (j + 1) % NT, 0));
  }
  {
    const xs = 10;
    for (let k = 0; k <= xs; k++) {
      const x = lerp(-HW, HW, k / xs);
      pushSeg(gBase, [x, YB, TH], [x, YB, -TH]);
    }
  }
  const tagMats = [lineMat(TEAL, 0.3), lineMat(TEAL, 0.5), lineMat(TEAL, 0.4), lineMat(TEAL, 0.5)];
  lineObj(gFace, tagMats[0], 2); lineObj(gBore, tagMats[1], 2);
  lineObj(gWall, tagMats[2], 2); lineObj(gBase, tagMats[3], 2);

  /* ---- fine web: full rings + spokes, ordered bore → boundary for the
         generation bloom; plus back face + through-thickness hex lines ---- */
  const fineList = [];
  [TH, -TH].forEach((z) => {
    for (let i = 1; i <= NR; i++) {
      for (let j = 0; j < NT; j++) fineList.push({ a: webPt(i, j, z), b: webPt(i, (j + 1) % NT, z), r: i });
    }
    for (let j = 0; j < NT; j++) {
      for (let i = 0; i < NR; i++) fineList.push({ a: webPt(i, j, z), b: webPt(i + 1, j, z), r: i + 0.5 });
    }
  });
  for (let j = 0; j < NT; j += 2) {                                    // through-thickness hex lines
    [3, 7, 12].forEach((i) => fineList.push({ a: webPt(i, j, TH), b: webPt(i, j, -TH), r: i + 0.3 }));
  }
  fineList.sort((a, b) => a.r - b.r);
  const fineArr = [];
  fineList.forEach((g) => pushSeg(fineArr, g.a, g.b));
  const fineMat = lineMat(TEAL, 0.42);
  const fineObj = lineObj(fineArr, fineMat, 2);
  const FINE_N = fineList.length;
  fineObj.geometry.setDrawRange(0, 0);

  /* ---- h-refinement band at the bore: appears when PROVE flags it ---- */
  const refArr = [];
  [TH, -TH].forEach((z) => {
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j < NT * 2; j++) {
        const a1 = (j / (NT * 2)) * Math.PI * 2 + Math.PI / 2;
        const a2 = ((j + 1) / (NT * 2)) * Math.PI * 2 + Math.PI / 2;
        const rr1 = lerp(RB, Rbound(a1), Math.pow((i + 0.5) / NR / 2, 1.55) * 2);
        const rr2 = lerp(RB, Rbound(a2), Math.pow((i + 0.5) / NR / 2, 1.55) * 2);
        refArr.push(CX + Math.cos(a1) * rr1, CY + Math.sin(a1) * rr1, z,
                    CX + Math.cos(a2) * rr2, CY + Math.sin(a2) * rr2, z);
      }
    }
    for (let j = 0; j < NT * 2; j++) {
      const a = (j / (NT * 2)) * Math.PI * 2 + Math.PI / 2;
      const r1 = RB, r2 = lerp(RB, Rbound(a), Math.pow(3.5 / NR / 2, 1.55) * 2);
      refArr.push(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1, z,
                  CX + Math.cos(a) * r2, CY + Math.sin(a) * r2, z);
    }
  });
  const refMat = lineMat(TEAL, 0.0);
  lineObj(refArr, refMat, 4);

  /* ---- CAD viewport ground grid ---- */
  const grid = new T.GridHelper(6, 30, 0x0e544e, 0x11332f);
  grid.position.y = YB - 0.28;
  grid.material.transparent = true;
  grid.material.opacity = 0;
  scene.add(grid);

  /* ---- assemble cloud ---- */
  const cloud = [];
  let seed = 20260703;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i <= NR; i += 2) {
    for (let j = 0; j < NT; j += 2) {
      [TH, -TH].forEach((z) => {
        const p = webPt(i, j, z);
        const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 2 - 1), r = 1.7 + rnd() * 1.3;
        cloud.push({ t: p, s: [Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.85, Math.sin(ph) * Math.sin(th) * r], st: rnd() * 0.55 });
      });
    }
  }
  const cloudPos = new Float32Array(cloud.length * 3);
  const cloudGeo = new T.BufferGeometry();
  cloudGeo.setAttribute("position", new T.BufferAttribute(cloudPos, 3));
  const cloudMat = new T.PointsMaterial({ color: TEAL, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.85 });
  mats.push([cloudMat, 0.85]);
  const cloudObj = new T.Points(cloudGeo, cloudMat);
  cloudObj.renderOrder = 5;
  scene.add(cloudObj);

  /* ---- quality gate (sweeps vertically), bore flag ring, crate ---- */
  const gateGeo = new T.BufferGeometry();
  {
    const gx = HW + 0.16, gz = TH + 0.14;
    gateGeo.setAttribute("position", new T.Float32BufferAttribute([
      -gx, 0, -gz, gx, 0, -gz, gx, 0, -gz, gx, 0, gz,
      gx, 0, gz, -gx, 0, gz, -gx, 0, gz, -gx, 0, -gz,
    ], 3));
  }
  const gateMat = lineMat(GOLD, 0.55);
  const gateObj = new T.LineSegments(gateGeo, gateMat);
  gateObj.renderOrder = 6;
  scene.add(gateObj);

  const flagArr = [];
  [TH + 0.004, -TH - 0.004].forEach((z) => {
    for (let j = 0; j < NT; j++) pushSeg(flagArr, webPt(0, j, z), webPt(0, (j + 1) % NT, z));
  });
  const flagMat = lineMat(GOLD, 0.0);
  lineObj(flagArr, flagMat, 6);

  const MGx = 0.62, MGy0 = YB - 0.14, MGy1 = CY + RH + 0.14, MGz = 0.34;
  const cnr = [
    [-MGx, MGy0, -MGz], [MGx, MGy0, -MGz], [MGx, MGy1, -MGz], [-MGx, MGy1, -MGz],
    [-MGx, MGy0, MGz], [MGx, MGy0, MGz], [MGx, MGy1, MGz], [-MGx, MGy1, MGz],
  ];
  const crateArr = [];
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a, b]) => pushSeg(crateArr, cnr[a], cnr[b]));
  const crateMat = lineMat(GOLD, 0.55);
  const crateObj = lineObj(crateArr, crateMat, 6);
  crateObj.geometry.setDrawRange(0, 0);

  /* ================= camera timeline =================
     compact standing part → frames centred at every key; the mesh act
     dives to the bore, PROVE pulls back up, SHIP goes wide */
  /* the part is a plate (face normals ±z): every key stays inside the
     face-visible cone (|θ| ≲ 55°), swinging THROUGH face-on rather than
     around the edge — no more grazing-sliver compositions */
  const KEYS = [
    { p: 0.00, th: 0.45, ph: 0.16, d: 3.0, t: [0, 0.05, 0] },
    { p: 0.20, th: -0.60, ph: 0.30, d: 2.35, t: [0, 0.05, 0] },
    { p: 0.40, th: -0.90, ph: 0.10, d: 1.85, t: [0, 0.30, 0] },
    { p: 0.60, th: -0.15, ph: 0.04, d: 0.92, t: [CX, CY, 0] },
    { p: 0.80, th: 0.50, ph: 0.45, d: 2.35, t: [0, 0.05, 0] },
    { p: 1.00, th: -0.35, ph: 0.12, d: 3.0, t: [0, 0.02, 0] },
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
    scene.fog.near = c.d * 0.6;
    scene.fog.far = c.d * 3.4;

    const a0 = actWin(p, 0), a1 = actWin(p, 1), a2 = actWin(p, 2), a3 = actWin(p, 3), a4 = actWin(p, 4);
    const partA = sstep((a0 - 0.42) / 0.58);
    const meshOn = sstep(a2 / 0.4);
    const shipDim = 1 - 0.4 * sstep(a4);

    cloudObj.visible = a0 < 1;
    if (cloudObj.visible) {
      for (let i = 0; i < cloud.length; i++) {
        const q = cloud[i], k = sstep((a0 * 1.5 - q.st) / 0.5);
        cloudPos[i * 3] = lerp(q.s[0], q.t[0], k);
        cloudPos[i * 3 + 1] = lerp(q.s[1], q.t[1], k);
        cloudPos[i * 3 + 2] = lerp(q.s[2], q.t[2], k);
      }
      cloudGeo.attributes.position.needsUpdate = true;
      cloudMat.opacity = 0.85 * (1 - partA * 0.95);
    }

    solidMesh.visible = partA > 0.3;
    grid.material.opacity = 0.13 * partA * (1 - 0.6 * sstep((a2 - 0.5) / 0.3) * (1 - sstep(a3 / 0.3)));

    /* CAD groups + classification pulses: faces → bore → walls → base */
    const baseOps = [0.3, 0.5, 0.4, 0.5];
    const order = [0, 1, 2, 3];
    tagMats.forEach((m, i) => {
      let op = baseOps[i] * partA * (1 - (i === 0 ? 0.55 : 0.25) * meshOn) * shipDim;
      m.color.copy(cTeal);
      if (a1 > 0) {
        const at = clamp(a1 * 4.4 - order[i] * 1.05, 0, 1);
        if (at > 0 && at < 1) {
          const pulse = Math.sin(at * Math.PI);
          m.color.lerpColors(cTeal, cGold, pulse);
          op = Math.max(op, 0.8 * pulse);
        } else if (at >= 1 && i > 0) op *= 1.3;
      }
      m.opacity = op;
    });
    featMat.opacity = 0.85 * partA * shipDim;

    /* mesh generation: web blooms outward from the bore */
    const gt = sstep(a2 / 0.55);
    fineObj.geometry.setDrawRange(0, Math.floor(FINE_N * sstep(gt * 1.1)) * 2);
    fineMat.opacity = 0.42 * shipDim;

    /* quality gate + bore hotspot + h-refinement */
    gateObj.visible = a3 > 0 && a3 < 1;
    let refOn = 0;
    if (a3 > 0) {
      const scanY = lerp(YB - 0.2, CY + RH + 0.2, sstep(a3));
      gateObj.position.y = scanY;
      gateMat.opacity = gateObj.visible ? 0.55 * (1 - sstep((a3 - 0.8) / 0.2)) * sstep(a3 / 0.1) : 0;
      const passed = scanY - CY;                       // gate reaching the bore centre
      flagMat.opacity = (passed > 0 && passed < 0.5) ? 0.85 * Math.sin(passed / 0.5 * Math.PI) : 0;
      refOn = sstep((passed - 0.15) / 0.3);
    } else flagMat.opacity = 0;
    refMat.opacity = 0.5 * refOn * shipDim * (a3 > 0 || a2 >= 1 ? 1 : 0);

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
      hudCam.textContent = "θ " + String(((Math.round(c.th * 57.3) % 360) + 360) % 360).padStart(3, "0") + "° · φ " +
        String(Math.abs(Math.round(c.ph * 57.3))).padStart(2, "0") + "° · z " + c.d.toFixed(2) + "c";
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
