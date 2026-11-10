/* ============================================================
   ASCII. Three pieces, all real text in <pre>, no canvas or images.
     [data-ascii]           the interlude: an airliner wing, meshed by
                            hand and then by Hexera (see below)
     [data-plate]           the pipeline figures: static, revealed
                            line by line
     [data-ascii-tunnel]    the footer: a car in a wind tunnel

   The interlude acts out its statement. The wing starts as a shaded
   solid (the CAD), and the loop has two beats:
     1. BY HAND. Mesh cells are laid one at a time, slowly ("Engineers
        lose weeks to manual meshing").
     2. HEXERA. The mesh sweeps the whole wing, root to tip, in one
        pass ("We take that work away").
   The part is a transport wing: swept and tapered with a kink, a
   cambered section that thins and twists toward the tip, a blended
   winglet, and an engine on its pylon. Its surfaces are rasterised
   into the character grid with a depth buffer. A cell that is not
   meshed yet takes a character from a brightness ramp, with the
   gaps round the slats, flaps, spoilers and aileron left dark. A
   meshed cell shows its mesh: the lines of a surface grid, packed
   at the leading and trailing edges and coarsened where the chord
   gets short, set with - _ / | \ by their slope and where they
   cross the character.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var AX = 0.6;                               /* a character is 0.6 wide to 1 tall */
  var HAND = 6400, SWEEP = 2000, HOLD = 4600; /* the three beats, in ms */
  var PACE = [150, 95, 170, 80, 125, 160, 90, 185, 110, 140, 85, 165, 120, 100];  /* per cell by hand: uneven, like a person */
  var RAMP = " .,:;-=+*#%@";                  /* the solid: dark to lit */
  var YAW = -0.10, PITCH = 1.0, ROLL = 0;    /* the camera: ahead of the wing and above it */
  var FLAT = 0.83, STEEP = 3.3;               /* a "/" climbs a row in one character: flatter lines are set with _ and -, steeper with | */

  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- the wing ---------- */
  var SPAN = 2.4, KINK = 0.33, SWEEP_LE = 0.58;        /* semi-span; where the trailing edge breaks; tan of the nose sweep */
  var VM = 0.9;                                        /* the share of v on the wing proper; the rest is the winglet */
  var DIH = 0.10, CANT = 1.22, RW = 0.11, LW = 0.34, ARC = RW * (CANT - DIH);   /* dihedral; the winglet's cant, blend radius, height */
  /* the section at v (0 root, 1 the winglet's tip): where it sits, how it leans, its chord, nose, thickness and twist */
  function station(v) {
    var o = {}, e, s;
    if (v <= VM) {
      e = v / VM; s = e * SPAN;
      o.phi = DIH; o.x = s * Math.cos(DIH); o.y = s * Math.sin(DIH);
      o.c = e < KINK ? lerp(1.0, 0.62, e / KINK) : lerp(0.62, 0.27, (e - KINK) / (1 - KINK));
      o.tc = e < KINK ? lerp(0.15, 0.115, e / KINK) : lerp(0.115, 0.095, (e - KINK) / (1 - KINK));
      o.le = SWEEP_LE * s; o.tw = lerp(0.045, -0.05, e);
    } else {
      e = (v - VM) / (1 - VM); s = e * (ARC + LW);
      var x0 = SPAN * Math.cos(DIH), y0 = SPAN * Math.sin(DIH);
      if (s < ARC) { o.phi = DIH + s / RW; o.x = x0 + RW * (Math.sin(o.phi) - Math.sin(DIH)); o.y = y0 + RW * (Math.cos(DIH) - Math.cos(o.phi)); }
      else {
        o.phi = CANT;
        o.x = x0 + RW * (Math.sin(CANT) - Math.sin(DIH)) + (s - ARC) * Math.cos(CANT);
        o.y = y0 + RW * (Math.cos(DIH) - Math.cos(CANT)) + (s - ARC) * Math.sin(CANT);
      }
      o.c = lerp(0.27, 0.085, Math.pow(e, 0.9)); o.tc = lerp(0.095, 0.085, e);
      o.le = SWEEP_LE * SPAN + 0.95 * s; o.tw = -0.05;                           /* raked back */
    }
    return o;
  }
  /* a point on the section st: u runs round it (0 at the trailing edge, over the top to the nose at 0.5, back
     underneath). A cambered four-digit section, turned by its twist about the quarter chord */
  function sectionAt(st, u) {
    var th = 2 * Math.PI * u, xc = 0.5 * (1 + Math.cos(th)), up = Math.sin(th) >= 0 ? 1 : -1;
    var yt = 5 * st.tc * (0.2969 * Math.sqrt(xc) - 0.1260 * xc - 0.3516 * xc * xc + 0.2843 * xc * xc * xc - 0.1036 * xc * xc * xc * xc);
    var m = 0.024, p = 0.4, yc = xc < p ? m / (p * p) * (2 * p * xc - xc * xc) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * xc - xc * xc);
    var xi = (xc - 0.25) * st.c, ze = (yc + up * yt) * st.c, ca = Math.cos(st.tw), sa = Math.sin(st.tw);
    var xr = xi * ca + ze * sa, zr = -xi * sa + ze * ca;
    return [st.x - zr * Math.sin(st.phi), st.y + zr * Math.cos(st.phi), st.le + 0.25 * st.c + xr];
  }
  function wing(u, v) { return sectionAt(station(v), u); }
  /* a body of revolution along the chord direction: the engine */
  function pod(cx, cy, z0, z1, rf) {
    return function (u, v) { var a = 2 * Math.PI * u, r = rf(v); return [cx + r * Math.cos(a), cy + r * Math.sin(a), lerp(z0, z1, v)]; };
  }
  var ENG = station(KINK * VM);                        /* the engine hangs at the kink */
  var nacelle = pod(ENG.x, ENG.y - 0.255, ENG.le - 0.50, ENG.le + 0.24, function (v) {
    return 0.148 * (v < 0.3 ? 0.80 + 0.20 * Math.sin(Math.PI / 2 * v / 0.3) : 1 - 0.36 * Math.pow((v - 0.3) / 0.7, 1.6));
  });
  function pylon(u, v) {                               /* a thin fin from the engine up to the wing's nose */
    var th = 2 * Math.PI * u, xc = 0.5 * (1 + Math.cos(th));
    return [ENG.x + 0.02 * Math.sin(th), lerp(ENG.y - 0.15, ENG.y - 0.02, v), lerp(lerp(ENG.le - 0.40, ENG.le - 0.03, v), ENG.le + 0.22, xc)];
  }
  /* the surfaces. f: the shape; MU x MV: facets used to draw it; nu, nv: mesh cells round and along, for the
     small and the large grid; at: when the sweep reaches it, as a share of the span */
  var PARTS = [
    { f: wing, MU: 72, MV: 88, nu: [32, 48], nv: [40, 64], caps: true, lod: true },
    { f: nacelle, MU: 32, MV: 16, nu: [12, 20], nv: [8, 12], caps: true, at: KINK * VM },
    { f: pylon, MU: 12, MV: 6, nu: [4, 6], nv: [3, 4], caps: false, at: KINK * VM }
  ];
  /* each part's facet corners, once, in model space. The model's chord axis is turned to face the viewer */
  (function () {
    for (var q = 0; q < PARTS.length; q++) {
      var P = PARTS[q], W = P.MU + 1, n = W * (P.MV + 1), i, j;
      P.mx = new Float32Array(n); P.my = new Float32Array(n); P.mz = new Float32Array(n);
      P.sx = new Float32Array(n); P.sy = new Float32Array(n); P.sz = new Float32Array(n);
      for (j = 0; j <= P.MV; j++) for (i = 0; i <= P.MU; i++) {
        var p = P.f(i / P.MU, j / P.MV), k = j * W + i;
        P.mx[k] = p[0]; P.my[k] = p[1]; P.mz[k] = -p[2];
      }
    }
  })();

  /* the gaps in the upper skin, as [chord fraction, from, to] along the span and [span fraction, from, to] along
     the chord: the slats, the flaps and the aileron, the spoilers */
  var GAP_X = [[0.11, 0.10, 0.30], [0.11, 0.37, 0.96], [0.72, 0.04, 0.96], [0.58, 0.36, 0.70]];
  var GAP_E = [[0.10, 0, 0.11], [0.30, 0, 0.11], [0.37, 0, 0.11], [0.56, 0, 0.11], [0.76, 0, 0.11], [0.96, 0, 0.11],
               [0.04, 0.72, 1], [0.33, 0.72, 1], [0.70, 0.72, 1], [0.96, 0.72, 1],
               [0.36, 0.58, 0.72], [0.445, 0.58, 0.72], [0.53, 0.58, 0.72], [0.615, 0.58, 0.72], [0.70, 0.58, 0.72]];
  function chordAt(u) { return 0.5 * (1 + Math.cos(2 * Math.PI * u)); }

  var LIGHT = (function () { var l = [-0.42, 0.10, 0.90], m = Math.hypot(l[0], l[1], l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();
  var DITHER = [0.125, 0.625, 0.875, 0.375];  /* two by two: neighbouring characters share a shade between them */

  function specimen(host) {
    var stage = host.querySelector("[data-ascii-stage]");
    var pSolid = host.querySelector("[data-ascii-solid]"), pLine = host.querySelector("[data-ascii-line]"), pHot = host.querySelector("[data-ascii-hot]");
    if (!stage || !pSolid || !pLine || !pHot) return;

    var COLS = 0, ROWS = 0, N = 0, big = -1, S = 1, OX = 0, OY = 0;
    var zb, fu, fv, fl, pid, cap;                  /* per character: depth, where on the surface, shade, which part, end cap */
    var HAND_ORDER = [];

    /* turn every part's corners into the view at this yaw */
    function project(yaw) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
      for (var q = 0; q < PARTS.length; q++) {
        var P = PARTS[q], n = P.mx.length;
        for (var k = 0; k < n; k++) {
          var x = P.mx[k] * cy + P.mz[k] * sy, z = -P.mx[k] * sy + P.mz[k] * cy, y = P.my[k];
          var y2 = y * cp - z * sp;
          P.sx[k] = x * cr - y2 * sr; P.sy[k] = x * sr + y2 * cr; P.sz[k] = y * sp + z * cp;
        }
      }
    }

    /* size the grid to the stage: the large grid on a wide stage, a smaller one on a phone */
    function fit() {
      var w = stage.clientWidth, want = w >= 560 ? 1 : 0;
      if (want !== big) build(want);
      host.style.setProperty("--ascii-fs", (w / (COLS * AX)).toFixed(3) + "px");
    }
    function build(mode) {
      var q, k, P;
      big = mode; COLS = big ? 288 : 168; ROWS = big ? 120 : 70; N = COLS * ROWS;
      zb = new Float32Array(N); fu = new Float32Array(N); fv = new Float32Array(N); fl = new Float32Array(N);
      pid = new Uint8Array(N); cap = new Uint8Array(N);
      /* frame the whole part, with a margin for the sway */
      project(YAW);
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (q = 0; q < PARTS.length; q++) {
        P = PARTS[q];
        for (k = 0; k < P.sx.length; k++) { x0 = Math.min(x0, P.sx[k]); x1 = Math.max(x1, P.sx[k]); y0 = Math.min(y0, P.sy[k]); y1 = Math.max(y1, P.sy[k]); }
      }
      S = Math.min(COLS * AX * 0.96 / (x1 - x0), ROWS * 0.94 / (y1 - y0));
      OX = COLS * AX / 2 - S * (x0 + x1) / 2; OY = ROWS / 2 + S * (y0 + y1) / 2;
      for (q = 0; q < PARTS.length; q++) {
        P = PARTS[q]; P.NU = P.nu[big]; P.NV = P.nv[big]; P.state = new Uint8Array(P.NU * P.NV); P.step = new Uint8Array(P.NV);
        for (k = 0; k < P.NV; k++) {
          var step = 1;
          if (P.lod) {
            /* where the chord gets short the cells round the section are merged in pairs, and again: a cell is
               never asked to be much less than three characters deep */
            var deep = station((k + 0.5) / P.NV).c * S * 0.8;
            while (step < 8 && deep / (P.NU / 2 / step) < 2.6) step *= 2;
          }
          P.step[k] = step;
        }
      }
      /* by hand: along the root on the side that faces the viewer, nose to tail, then the next row out */
      HAND_ORDER = [];
      P = PARTS[0];
      for (var cv = 0; cv < 10; cv++) for (var cu = P.NU / 2 - 1; cu >= 0; cu -= P.step[cv]) HAND_ORDER.push(cv * P.NU + cu - cu % P.step[cv]);
      lastKey = "";
    }
    /* Hexera: when each cell lands, 0..1. Root to tip, with a ripple across the chord */
    function landing(P, cu, cv) {
      if (P.at !== undefined) return P.at * 0.8 + 0.12 * cu / P.NU + 0.04;
      return (cv / P.NV) * 0.8 + 0.2 * (((cu * 5) % P.NU) / P.NU);
    }

    /* rasterise every part at this yaw into the depth, part, u, v and shade buffers */
    function raster(yaw) {
      var q, k, i, j;
      project(yaw);
      for (k = 0; k < N; k++) { zb[k] = -1e9; pid[k] = 0; cap[k] = 0; }
      function tri(P, a, b, c, ua, va, ub, vb, uc, vc, isCap, id) {
        var ax = P.sx[a], ay = P.sy[a], az = P.sz[a], bx = P.sx[b], by = P.sy[b], bz = P.sz[b], cx = P.sx[c], cy = P.sy[c], cz = P.sz[c];
        var nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        var nl = Math.hypot(nx, ny, nz); if (nl < 1e-12) return;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        var lam = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
        var X0 = ax * S + OX, X1 = bx * S + OX, X2 = cx * S + OX, Y0 = OY - ay * S, Y1 = OY - by * S, Y2 = OY - cy * S;
        var area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
        if (Math.abs(area) < 1e-7) return;
        var i0 = Math.max(0, Math.floor(Math.min(X0, X1, X2) / AX)), i1 = Math.min(COLS - 1, Math.ceil(Math.max(X0, X1, X2) / AX));
        var j0 = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2))), j1 = Math.min(ROWS - 1, Math.ceil(Math.max(Y0, Y1, Y2)));
        for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) {
          var px = (ii + 0.5) * AX, py = jj + 0.5;
          var w0 = ((X1 - px) * (Y2 - py) - (X2 - px) * (Y1 - py)) / area, w1 = ((X2 - px) * (Y0 - py) - (X0 - px) * (Y2 - py)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          var z = w0 * az + w1 * bz + w2 * cz, idx = jj * COLS + ii;
          if (z <= zb[idx]) continue;
          zb[idx] = z; pid[idx] = id; cap[idx] = isCap;
          fl[idx] = isCap ? 0.1 : 0.1 + 0.78 * Math.pow(lam, 1.6) + 0.12 * Math.max(0, Math.min(1, 0.5 + z * 0.5));
          fu[idx] = w0 * ua + w1 * ub + w2 * uc; fv[idx] = w0 * va + w1 * vb + w2 * vc;
        }
      }
      for (q = 0; q < PARTS.length; q++) {
        var P = PARTS[q], W = P.MU + 1, MU = P.MU, MV = P.MV;
        for (j = 0; j < MV; j++) for (i = 0; i < MU; i++) {
          var a = j * W + i, u0 = i / MU, u1 = (i + 1) / MU, v0 = j / MV, v1 = (j + 1) / MV;
          tri(P, a, a + 1, a + W + 1, u0, v0, u1, v0, u1, v1, 0, q + 1);
          tri(P, a, a + W + 1, a + W, u0, v0, u1, v1, u0, v1, 0, q + 1);
        }
        if (P.caps) for (var end = 0; end < 2; end++) for (i = 0; i < MU / 2; i++) {      /* close the two ends */
          var r = end * MV * W, e = end, ua = i / MU, ub = (i + 1) / MU;
          tri(P, r + i, r + i + 1, r + MU - i - 1, ua, e, ub, e, 1 - ub, e, 1, q + 1);
          tri(P, r + i, r + MU - i - 1, r + MU - i, ua, e, 1 - ub, e, 1 - ua, e, 1, q + 1);
        }
      }
    }

    /* does a line of the field with value a here, changing by r a character to the right and d a row down, cross
       this character? "" if not; else the character for it, by its slope and where it crosses */
    function cross(a, r, d) {
      var gx = r / AX, gy = d, g = Math.hypot(gx, gy);
      if (g < 1e-7) return "";
      var s = a - Math.round(a), ax = Math.abs(gx), ay = Math.abs(gy);
      if (ax < FLAT * ay) {
        /* the line runs flat: one character a column. "-" when it passes through the middle of this one, "_"
           when it passes near the foot of it or the head of the one below */
        var off = -s / gy;
        if (Math.abs(s) > 0.5) off = -(s > 0 ? s - 1 : s + 1) / gy;          /* the next line along may be the nearer */
        return off > 0.25 && off <= 0.75 ? "_" : off > -0.25 && off <= 0.25 ? "-" : "";
      }
      if (Math.abs(s) > 0.5 * (ax * AX + ay)) return "";
      if (ax > STEEP * ay) return "|";
      return gx * gy > 0 ? "/" : "\\";
    }

    /* the gap between the wing's moving surfaces that crosses this character of its upper skin, as the
       character for it; "" when none does */
    function gap(k) {
      var r = pid[k + 1] === 1 ? k + 1 : -1, d = pid[k + COLS] === 1 ? k + COLS : -1;
      if (r < 0 || d < 0 || fu[r] >= 0.5 || fu[d] >= 0.5 || cap[r] || cap[d]) return "";
      var x = chordAt(fu[k]), e = fv[k] / VM, xr = chordAt(fu[r]) - x, xd = chordAt(fu[d]) - x, er = fv[r] / VM - e, ed = fv[d] / VM - e, n, g, c;
      for (n = 0; n < GAP_X.length; n++) { g = GAP_X[n]; if (e >= g[1] && e <= g[2] && Math.abs(x - g[0]) < 0.4) { c = cross(x - g[0], xr, xd); if (c) return c; } }
      for (n = 0; n < GAP_E.length; n++) { g = GAP_E[n]; if (x >= g[1] && x <= g[2] && Math.abs(e - g[0]) < 0.4) { c = cross(e - g[0], er, ed); if (c) return c; } }
      return "";
    }

    var lastKey = "";
    function draw(t, yaw) {
      var i, j, k, q, P, hexera = t >= HAND, key, cu, cv;
      for (q = 0; q < PARTS.length; q++) PARTS[q].state.fill(0);
      if (!hexera) {
        var acc = 0, laid = 0;
        while (laid < HAND_ORDER.length && acc + PACE[laid % PACE.length] <= t) { acc += PACE[laid % PACE.length]; laid++; }
        for (k = 0; k < laid; k++) PARTS[0].state[HAND_ORDER[k]] = k === laid - 1 ? 2 : 1;
        key = "h" + laid;
      } else {
        var f = Math.min(1, (t - HAND) / SWEEP);
        for (q = 0; q < PARTS.length; q++) {
          P = PARTS[q];
          for (cv = 0; cv < P.NV; cv++) for (cu = 0; cu < P.NU; cu += P.step[cv]) {
            var at = landing(P, cu, cv);
            if (at <= f) P.state[cv * P.NU + cu] = (f < 1 && f - at < 0.07) ? 2 : 1;
          }
        }
        key = "x" + Math.round(f * 500);
      }
      key += "|" + yaw.toFixed(3);
      if (key === lastKey) return;
      lastKey = key;
      raster(yaw);
      var ss = "", sl = "", sh = "";
      for (j = 0; j < ROWS; j++) {
        for (i = 0; i < COLS; i++) {
          k = j * COLS + i;
          var a = " ", b = " ", c = " ", id = pid[k];
          if (id) {
            P = PARTS[id - 1];
            var NU = P.NU, NV = P.NV;
            cv = Math.min(NV - 1, Math.floor(fv[k] * NV));
            var step = P.step[cv], nu = NU / step;
            cu = Math.min(NU - 1, Math.floor(fu[k] * NU)); cu -= cu % step;
            var st = P.state[cv * NU + cu];
            var g = "", dim = "";
            /* the part's edge against the background, or against a part behind it: drawn on the solid and on
               the mesh alike */
            var eL = i > 0 && pid[k - 1] === id, eR = i + 1 < COLS && pid[k + 1] === id, eU = j > 0 && pid[k - COLS] === id, eD = j + 1 < ROWS && pid[k + COLS] === id;
            if (!eL || !eR || !eU || !eD) {
              var front = (!eL && (i === 0 || zb[k - 1] < zb[k])) || (!eR && (i + 1 === COLS || zb[k + 1] < zb[k])) || (!eU && (j === 0 || zb[k - COLS] < zb[k])) || (!eD && (j + 1 === ROWS || zb[k + COLS] < zb[k]));
              if (front) {
                var ox = 0, oy = 0;
                for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
                  var ii = i + di, jj = j + dj;
                  if (ii >= 0 && ii < COLS && jj >= 0 && jj < ROWS && pid[jj * COLS + ii] === id) { ox += di; oy += dj; }
                }
                ox /= AX;
                var aox = Math.abs(ox), aoy = Math.abs(oy);
                g = (aox < FLAT * aoy) ? (oy < 0 ? "_" : "-") : (aox > STEEP * aoy) ? "|" : (ox * oy > 0 ? "/" : "\\");
                if (!aox && !aoy) g = ".";
              }
            }
            if (!st) {
              /* the solid: its shade, and the gaps in the wing's upper skin */
              if (!g && id === 1 && !cap[k] && fu[k] < 0.5 && fv[k] < VM) g = gap(k);
              if (!g) a = RAMP.charAt(Math.max(1, Math.min(RAMP.length - 1, Math.floor(fl[k] * (RAMP.length - 1) + DITHER[(j & 1) * 2 + (i & 1)]))));
              else b = g;
            } else {
              if (!g && cap[k]) dim = ":";
              else if (!g) {
                /* the mesh: the lines round the section and the lines along the span */
                var au = fu[k] * nu, av = fv[k] * NV, ru = 0, du = 0, rv = 0, dv = 0, n1;
                n1 = eR && !cap[k + 1] ? k + 1 : eL && !cap[k - 1] ? k - 1 : -1;
                if (n1 >= 0) { ru = (fu[n1] * nu - au) * (n1 > k ? 1 : -1); rv = (fv[n1] * NV - av) * (n1 > k ? 1 : -1); }
                n1 = eD && !cap[k + COLS] ? k + COLS : eU && !cap[k - COLS] ? k - COLS : -1;
                if (n1 >= 0) { du = (fu[n1] * nu - au) * (n1 > k ? 1 : -1); dv = (fv[n1] * NV - av) * (n1 > k ? 1 : -1); }
                if (ru > nu / 2) ru -= nu; if (ru < -nu / 2) ru += nu; if (du > nu / 2) du -= nu; if (du < -nu / 2) du += nu;   /* the seam in u */
                var U = cross(au, ru, du), V = cross(av, rv, dv);
                if (U && V) g = "+"; else g = U || V;
              }
              if (g) { if (st === 2) c = g; else b = g; }
              else if (dim) { if (st === 2) c = dim; else a = dim; }
            }
          }
          ss += a; sl += b; sh += c;
        }
        ss += "\n"; sl += "\n"; sh += "\n";
      }
      pSolid.textContent = ss; pLine.textContent = sl; pHot.textContent = sh;
    }

    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener("resize", fit);
    if (reduce) { draw(HAND + SWEEP, YAW); return; }
    draw(0, YAW);

    var visible = false, raf = 0, clock = 0, life = 0, prev = 0, last = 0, LOOP = HAND + SWEEP + HOLD;
    function tick(now) {
      raf = 0;
      if (!visible || document.hidden) { prev = 0; return; }
      if (prev) { var dt = Math.min(100, now - prev); clock = (clock + dt) % LOOP; life += dt; }
      prev = now;
      /* a slow sway, in steps too small to see: the picture is only redrawn when it would change */
      if (now - last > 60) { last = now; draw(clock, YAW + Math.round(0.05 * Math.sin(life / 3000) / 0.003) * 0.003); }
      raf = requestAnimationFrame(tick);
    }
    function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }, { rootMargin: "0px" }).observe(host);
    } else { visible = true; wake(); }
    document.addEventListener("visibilitychange", wake);
  }

  /* ---------- plates: the pipeline figures. Static text; their lines come in when scrolled to ---------- */
  function plates() {
    var els = document.querySelectorAll("[data-plate]"), k;
    for (k = 0; k < els.length; k++) {
      var ls = els[k].querySelectorAll(".pl");
      for (var i = 0; i < ls.length; i++) ls[i].style.setProperty("--i", i);
    }
    if (reduce || !window.IntersectionObserver) { for (k = 0; k < els.length; k++) els[k].classList.add("is-in"); return; }
    var io = new IntersectionObserver(function (en) {
      for (var i = 0; i < en.length; i++) if (en[i].isIntersecting) { en[i].target.classList.add("is-in"); io.unobserve(en[i].target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    for (k = 0; k < els.length; k++) io.observe(els[k]);
  }

  /* ---------- tunnel: the footer. A car in a wind tunnel, in text, filling the screen ----------
     One 3D scene, standing still, seen from the car's front quarter.
     The car is a real Hexera mesh (assets/car2.json.gz): its own mesh lines with the hidden
     ones removed, lit, and set as characters ahead of time by hexera_ops/site_theme/car_scene.py.
     That script also writes what is needed to draw in the same space here (assets/ascii-car-3d.json):
     the depth of every car cell, the linear map from model space (x along the car, g above the
     ground, z across it) to the text grid, and, for a set of vertical planes along the car, the
     height the air has to clear at each station.
     The air runs one way, along the car, nose to tail. Each streamline lives in one of those
     planes at its own height: it lifts over the body where the body is in its way, and settles
     in the wake. Lines beside the car run straight past it. A line is hidden where it passes
     behind the car and drawn over the car where it passes in front. There are twenty-five, laid
     out in order so each can be followed: five hug the body across its width, ten stack above
     them, and five pass each side. Each is drawn whole as a dotted path, with solid dashes led by an arrowhead
     running along it, all at one speed. The near ones are brighter than the far ones.
     The pointer disturbs the air: while it is over the scene the lines part round it, with a
     short wake behind. */
  function tunnel(host) {
    var pCar = host.querySelector("[data-tunnel-car]"), pHi = host.querySelector("[data-tunnel-carhi]");
    var pFlow = host.querySelector("[data-tunnel-flow]"), pHot = host.querySelector("[data-tunnel-hot]");
    var src = host.getAttribute("data-car");
    if (!pCar || !pHi || !pFlow || !pHot || !src || !window.fetch) return;
    fetch(src).then(function (r) { return r.ok ? r.json() : null; }).then(function (S) {
      if (!S || !S.car || !S.m) return;
      var M = S.m, cw = S.cols, ch = S.rows;
      /* The streamlines, few and deliberate. [z across the car in half-widths, height in car heights, tone]
         - three that hug the body across its width (far, centre, near): the centre one is the accent
         - a stack above them in the centre plane, evenly spaced once they are over the roof
         - two past each side, running straight; the near pair passes in front of the doors */
      var LINES = [[-0.8, 0.1, 0], [-0.4, 0.1, 0], [0, 0.1, 2], [0.4, 0.1, 1], [0.8, 0.1, 1],
                   [0, 0.4, 0], [0, 0.75, 0], [0, 1.15, 2], [0, 1.6, 0], [0, 2.1, 0], [0, 2.7, 0],
                   [-0.8, 0.6, 0], [-0.8, 1.4, 0], [0.8, 0.6, 1], [0.8, 1.4, 1],
                   [-1.6, 0.12, 0], [-1.6, 0.5, 0], [-1.6, 0.9, 0], [1.6, 0.3, 1], [1.6, 0.62, 1], [1.6, 0.95, 1],
                   [-2.6, 0.3, 0], [-2.6, 0.8, 0], [2.6, 0.2, 1], [2.6, 0.7, 1]];
      var PERIOD = 46, DASH = 22, SPEED = 17;        /* columns between dashes, dash length, columns a second */
      var TC = 0, TR = 0, N2 = 0, carLo = null, carHi = null, carQ = null, lines = [], fa = null, fb = null, fn = null, front = null;
      /* the pointer, in text cells: where it is (eased), where it is heading, how strongly it parts the air (0..1) */
      var FS = 10, CW = 6, mouse = { x: 0, y: 0, tx: 0, ty: 0, k: 0, on: false };

      function envAt(zw, x) {                        /* the height to clear at station x, z given in half-widths */
        var f = zw / 0.4 + 6, i = Math.floor(f), t = f - i;
        if (Math.abs(zw) > 1.3 || i < 0 || i >= S.planes.length - 1) return 0;   /* past the sides the air runs straight */
        function at(p) {
          if (!p.env) return 0;
          var u = (x - S.x0) / S.dx, k = Math.floor(u);
          if (k < 0 || k >= S.nx - 1) return 0;
          return p.env[k] + (p.env[k + 1] - p.env[k]) * (u - k);
        }
        return at(S.planes[i]) * (1 - t) + at(S.planes[i + 1]) * t;
      }

      function layout() {
        var W = host.clientWidth, H = host.clientHeight, i, j, x, k;
        if (!W || !H) return false;
        /* type size: the car about two thirds of the width (nearly all of it on a phone), never taller than 45% of the box */
        var fs = Math.max(3, Math.min(18, W * (W < 700 ? 0.96 : 0.68) / (cw * AX), H * 0.45 / ch));
        FS = fs;
        TC = Math.ceil(W / (fs * AX)) + 1; TR = Math.ceil(H / fs) + 1; N2 = TC * TR;
        var X0 = Math.floor((TC - cw) / 2) + (W < 700 ? 0 : Math.round(TC * 0.05));
        var Y0 = Math.min(TR - 3, Math.round(TR * 0.8)) - ch;
        var size = fs.toFixed(2) + "px";
        pCar.style.fontSize = pHi.style.fontSize = pFlow.style.fontSize = pHot.style.fontSize = size;
        /* the real width of a character on this screen, so the pointer lands on the cell that is under it */
        var probe = document.createElement("pre");
        probe.style.cssText = "right:auto;bottom:auto;visibility:hidden;font-size:" + size;
        probe.textContent = new Array(101).join("0");
        host.appendChild(probe); CW = probe.getBoundingClientRect().width / 100 || fs * AX; host.removeChild(probe);
        carLo = new Array(N2); carHi = new Array(N2); carQ = new Int16Array(N2);
        for (i = 0; i < N2; i++) { carLo[i] = " "; carHi[i] = " "; carQ[i] = -1; }
        for (j = 0; j < ch; j++) for (x = 0; x < cw; x++) {
          var sj = Y0 + j, sxx = X0 + x, c = S.car[j].charAt(x);
          if (c === " " || sj < 0 || sj >= TR || sxx < 0 || sxx >= TC) continue;
          var idx = sj * TC + sxx;
          if (S.ramp.indexOf(c) >= S.hi) carHi[idx] = c; else carLo[idx] = c;
          carQ[idx] = S.depth[j].charCodeAt(x) - 33;
        }
        function row(x, z, g) { return Y0 + M.r0 + M.rx * x + M.rz * z + M.rg * g; }
        /* the streamlines: for each, its row, glyph and whether it shows, at every column */
        lines = [];
        for (k = 0; k < LINES.length; k++) {
          var z = LINES[k][0] * S.W, g0 = LINES[k][1] * S.H, clear = 0.03 * S.H + 0.55 * g0;
          var hug = LINES[k][1] <= 0.15, lift = 1 / (1 + 1.2 * Math.pow(LINES[k][1], 1.5));
          var ys = new Float32Array(TC), vis = new Uint8Array(TC), gl = new Array(TC);
          for (x = 0; x < TC; x++) {
            /* the lines that hug the body ride just above it; the ones higher up are lifted less the higher they start */
            var xm = (x - X0 - M.c0 - M.cz * z) / M.cx, e = envAt(LINES[k][0], xm);
            var g = hug ? Math.max(g0, e + clear) : g0 + e * lift;
            var ry = row(xm, z, g); ys[x] = ry;
            var rr = Math.floor(ry);
            if (rr < 0 || rr >= TR) { vis[x] = 0; continue; }
            var q = carQ[rr * TC + x];
            if (q < 0) vis[x] = 1;
            else vis[x] = ((M.d0 + M.dx * xm + M.dz * z + M.dg * g - S.zlo) / (S.zhi - S.zlo) * 93 > q + 1.5) ? 2 : 0;
          }
          for (x = 0; x < TC; x++) {
            var dy = ys[Math.min(TC - 1, x + 1)] - ys[Math.max(0, x - 1)], fr = ys[x] - Math.floor(ys[x]);
            gl[x] = dy < -1.1 ? "/" : dy > 1.1 ? "\\" : fr > 0.66 ? "_" : fr > 0.33 ? "-" : "'";
          }
          lines.push({ y: ys, g: gl, vis: vis, off: (k * 17) % PERIOD, tone: LINES[k][2] });
        }
        fa = new Array(N2); fb = new Array(N2); fn = new Array(N2); front = new Uint8Array(N2);
        return true;
      }

      function draw(t) {
        if (!fa) return;
        var i, x, k;
        for (i = 0; i < N2; i++) { fa[i] = " "; fb[i] = " "; fn[i] = " "; front[i] = 0; }
        /* The pointer parts the air like a cylinder would: a line at distance d from it is moved out to
           sqrt(d*d + R*R), so nothing crosses it and lines never cross each other. The push fades ahead
           of the pointer and, more slowly, in its wake. */
        /* R is about 20 px of screen: the lines pass close by the pointer, the way they would round something its size */
        var R = Math.max(2, Math.min(5.5, 20 / FS)), bend = mouse.k > 0.01;
        var xa = bend ? Math.floor(mouse.x - 4 * R / AX) : 0, xb = bend ? Math.ceil(mouse.x + 11 * R / AX) : 0;
        function around(y, x) {
          var dx = (x - mouse.x) * AX, w = dx < 0 ? R * 1.4 : R * 3.6, g = Math.exp(-(dx * dx) / (w * w));   /* blunt ahead, a tapering wake behind */
          var d = y - mouse.y;
          return mouse.y + (d < 0 ? -1 : 1) * Math.sqrt(d * d + R * R * g * mouse.k);
        }
        for (k = 0; k < lines.length; k++) {
          var p = lines[k], shift = t * SPEED + p.off;
          for (x = 0; x < TC; x++) {
            if (!p.vis[x]) continue;
            /* every line is drawn whole as a dotted path; solid dashes run along it, each led by an arrowhead */
            var ph = ((x - shift) % PERIOD + PERIOD) % PERIOD, c;
            if (ph >= DASH && x % 3 !== 0) continue;
            var yy = p.y[x], gch = p.g[x], moved = false;
            if (bend && x > xa && x < xb) {
              var y1 = around(yy, x);
              if (Math.abs(y1 - yy) > 0.02) {
                var dy = around(p.y[Math.min(TC - 1, x + 1)], x + 1) - around(p.y[Math.max(0, x - 1)], x - 1), fr = y1 - Math.floor(y1);
                gch = dy < -1.1 ? "/" : dy > 1.1 ? "\\" : fr > 0.66 ? "_" : fr > 0.33 ? "-" : "'";
                yy = y1; moved = true;
              }
            }
            c = ph < DASH - 1 ? gch : ph < DASH ? ">" : ".";
            var rr = Math.floor(yy);
            if (rr < 0 || rr >= TR) continue;
            var idx = rr * TC + x;
            if (moved && p.vis[x] === 1 && carQ[idx] >= 0) continue;     /* pushed onto the car from the open: it goes behind */
            if (p.tone === 2) fb[idx] = c; else if (p.tone === 1) fn[idx] = c; else fa[idx] = c;
            if (p.vis[x] === 2) front[idx] = 1;      /* in front of the car: the car gives way under it */
          }
        }
        var sa = "", sb = "", sl = "", sh = "";
        for (var j = 0; j < TR; j++) {
          var o = j * TC;
          sa += fa.slice(o, o + TC).join("") + "\n"; sb += fb.slice(o, o + TC).join("") + "\n";
          for (x = 0; x < TC; x++) { if (front[o + x]) { sl += " "; sh += fn[o + x]; } else { sl += carLo[o + x]; sh += fn[o + x] !== " " ? fn[o + x] : carHi[o + x]; } }
          sl += "\n"; sh += "\n";
        }
        pFlow.textContent = sa; pHot.textContent = sb; pCar.textContent = sl; pHi.textContent = sh;
      }

      /* follow the pointer while it is over the scene (a finger counts while it is down) */
      function point(e) {
        var r = host.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        mouse.on = inside;
        if (!inside) return;
        mouse.tx = (e.clientX - r.left) / CW; mouse.ty = (e.clientY - r.top) / FS;
        if (mouse.k < 0.02) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      }
      function away() { mouse.on = false; }
      if (!reduce) {
        window.addEventListener("pointermove", point, { passive: true });
        window.addEventListener("pointerdown", point, { passive: true });
        window.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") away(); }, { passive: true });
        window.addEventListener("pointercancel", away, { passive: true });
        document.addEventListener("mouseleave", away);
        window.addEventListener("blur", away);
      }

      var t0 = performance.now(), pend = 0;
      if (layout()) draw(0);
      window.addEventListener("resize", function () { clearTimeout(pend); pend = setTimeout(function () { if (layout()) draw((performance.now() - t0) / 1000); }, 180); });
      if (reduce) return;
      var visible = false, raf = 0, last = 0;
      function tick(now) {
        raf = 0;
        if (!visible || document.hidden) return;
        var live = mouse.on || mouse.k > 0.01;                 /* the pointer is in play: draw twice as often */
        if (now - last > (live ? 38 : 80)) {
          last = now;
          mouse.x += (mouse.tx - mouse.x) * 0.4; mouse.y += (mouse.ty - mouse.y) * 0.4;
          mouse.k += ((mouse.on ? 1 : 0) - mouse.k) * 0.22;
          if (!fa) layout();
          draw((now - t0) / 1000);
        }
        raf = requestAnimationFrame(tick);
      }
      function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }
      if (window.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; wake(); }, { rootMargin: "100px" }).observe(host);
      else { visible = true; wake(); }
      document.addEventListener("visibilitychange", wake);
    }).catch(function () {});
  }

  function each(sel, fn) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) fn(els[i]); }
  function start() {
    each("[data-ascii]", specimen);
    each("[data-ascii-tunnel]", tunnel);
    plates();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
