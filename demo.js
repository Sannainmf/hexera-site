/* ============================================================
   Hexera in-hero demo — the autonomous meshing conversation.
   Chat captures the simulation requirements, then a 3-agent
   pipeline (Builder · Executor · Reviewer) generates the mesh
   with streaming reasoning, ending in a result + export bundle.
   All UI — no 3D render.
   ============================================================ */

(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const win = document.querySelector("[data-demo]");
  if (!win) return;
  const log    = win.querySelector("[data-log]");
  const field  = win.querySelector("[data-field]");
  const caret  = win.querySelector("[data-caret]");
  const sendB  = win.querySelector("[data-send]");
  const cursor = win.querySelector("[data-cursor]");
  const replay = win.querySelector("[data-replay]");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  /* ---------- content ---------- */
  const SUMMARY = `All requirements captured — here's the spec:
    <table class="sumtable">
      <tr><th>Domain</th><td>NACA&nbsp;0012 · external aerodynamics</td></tr>
      <tr><th>Flow</th><td>50&nbsp;m/s · sea level · 4°&nbsp;AoA · k-ω&nbsp;SST</td></tr>
      <tr><th>Domain&nbsp;box</th><td>15c up · 25c down · 12c top/bottom</td></tr>
      <tr><th>Dimensionality</th><td>True 2D · single cell layer</td></tr>
      <tr><th>Patches</th><td>airfoil_wall · farfield · outlet · front/back</td></tr>
      <tr><th>Fidelity</th><td>Standard · 200–500k cells · y+&nbsp;&lt;&nbsp;1</td></tr>
      <tr><th>Purpose</th><td>Lift / drag for design iteration</td></tr>
    </table>`;

  // The agents think their way to the mesh — a mix of TOOL calls and THINKING,
  // including a self-correction or two (it isn't instant; it reasons).
  // Reasoning transcribed from the real product (demo.mp4) — kept verbatim where
  // it fits, lightly trimmed for length.
  const T = (x, note) => ({ k: "tool", x, note });
  const K = (x) => ({ k: "think", x });
  const AGENTS = [
    { name: "Builder", steps: 21, events: [
      K("This is very explicit. I'll create a single patch called \"frontAndBack\" containing both front and back faces."),
      K("Wait — the contract shows \"front\" and \"back\" as separate patches, but the system prompt says they must be a single physical group. This is definitely contradictory."),
      K("Safest interpretation: one physical group containing both faces, named \"frontAndBack\" per the OpenFOAM convention. Do not invent, split, merge, or rename patches."),
      T('write_geo(occ_unit="M", layers=24, first_cell=1.2e-5)', "rescaled mm → unit chord · y+ < 1"),
    ] },
    { name: "Executor", steps: 42, events: [
      T('run("blockMesh")', "background mesh · 12,400 cells"),
      T('run("snappyHexMesh -overwrite")', "129,369 cells"),
      K("Exit code 1 — but the output is a Gmsh warning, not a Python exception; the try/except around gmsh.write would have caught a real error. Verifying mesh.msh before handing off."),
      T('run_command("python3 -c … mesh.msh exists?")', "blocked: shell metacharacter \";\" not permitted — retrying"),
    ] },
    { name: "Reviewer", steps: 22, events: [
      T("zoom_to_region(mag=4, x=0.50, y=0.55)", "render crop · 4.0× · camera unchanged"),
      K("I can see the patches: violet is the frontAndBack (empty) patch, yellow-green the farfield. The dark region in the center is the refined area around the airfoil, with a wake-like refinement extending downstream."),
      K("Let me look at the leading edge more closely — front view, zoom in to check the LE curvature. Clean. Re-check passes: skew 0.34, y+ 0.91. Simulation-ready."),
    ] },
    { name: "Review & deliverables", steps: 0, events: [
      T("export(CGNS, MSH, STL, INP, MED, UNV, BDF, +gmsh.py)"),
      K("Bundling the solver-agnostic formats with the full Gmsh Python script and an Allmesh wrapper."),
    ] },
  ];

  const RESULT = `The 2D NACA&nbsp;0012 mesh at 4° AoA for your sea-level 50&nbsp;m/s k-ω&nbsp;SST case
    passed with <b>129,369 cells</b> — a well-resolved boundary layer and a clean H-H domain
    (15c up · 25c down · 12c top/bottom). The bundle is solver-agnostic: import the <b>CGNS</b>
    straight into Fluent, SU2 or Code_Saturne, or run <code>gmshToFoam</code> on the .msh for
    OpenFOAM. The full Gmsh Python script and an Allmesh wrapper are included — edit the
    parameters and re-run anytime.`;
  const EXPORTS = [
    ["CGNS", "2.8 MB"], ["MSH", "6.4 MB"], ["STL", "3.1 MB"], ["INP", "6.8 MB"],
    ["MED", "7.4 MB"], ["UNV", "22.1 MB"], ["BDF", "8.8 MB"], ["PY", "6.8 KB"],
  ];

  /* ---------- chat helpers ---------- */
  function addMsg(side, inner) {
    const m = document.createElement("div");
    m.className = "msg msg--" + side;
    m.innerHTML = (side === "ai" ? '<p class="msg__who">HEXERA</p>' : "") + '<div class="msg__body">' + inner + "</div>";
    log.appendChild(m); scroll(); return m;
  }
  async function typeField(text, cps = 42) {
    caret.classList.add("on"); field.textContent = "";
    for (let i = 0; i < text.length; i++) { field.textContent += text[i]; await wait(1000 / cps); }
    await wait(140); caret.classList.remove("on");
  }
  let curX = 40, curY = 300;
  function moveCursor(x, y, dur = 650) { curX = x; curY = y; cursor.style.transform = `translate(${x}px, ${y}px)`; return wait(dur); }
  function pointOf(el, fx = 0.5, fy = 0.5) { const r = el.getBoundingClientRect(), w = win.getBoundingClientRect(); return [r.left - w.left + r.width * fx - 10, r.top - w.top + r.height * fy - 4]; }
  async function moveTo(el, fx, fy, dur) { const [x, y] = pointOf(el, fx, fy); await moveCursor(x, y, dur); }
  async function clickFx() {
    const ring = document.createElement("span");
    ring.style.cssText = `position:absolute;left:0;top:0;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--teal);z-index:29;pointer-events:none;transform:translate(${curX-2}px,${curY+2}px)`;
    win.appendChild(ring);
    ring.animate([{ opacity: 0.9, transform: `translate(${curX-2}px,${curY+2}px) scale(0.4)` }, { opacity: 0, transform: `translate(${curX-12}px,${curY-8}px) scale(1.8)` }], { duration: 500, easing: "cubic-bezier(0.16,1,0.3,1)" });
    cursor.animate([{ transform: "scale(1)" }, { transform: "scale(0.78)" }, { transform: "scale(1)" }], { duration: 220, composite: "add" });
    await wait(240); ring.remove();
  }
  async function userTurn(text) {
    await moveTo(field, 0.12, 0.5, 550); await clickFx();
    await typeField(text);
    await moveTo(sendB, 0.5, 0.5, 420); await clickFx();
    addMsg("user", text); field.textContent = ""; await wait(420);
  }

  /* ---------- agent pipeline ---------- */
  async function runPipeline(alive) {
    const card = addMsg("ai", "");
    const body = card.querySelector(".msg__body");
    body.innerHTML = `<div class="pipe">
        <div class="pipe__head"><span class="pipe__spin"></span><span class="pipe__title">Generating mesh</span><span class="pipe__state">working…</span></div>
        <div class="pipe__rows"></div>
      </div>`;
    const head = body.querySelector(".pipe__head");
    const rows = body.querySelector(".pipe__rows");
    scroll();

    for (let i = 0; i < AGENTS.length; i++) {
      if (!alive()) return false;
      const { name, steps, events } = AGENTS[i];
      const row = document.createElement("div");
      row.className = "agent is-run";
      row.innerHTML = `<span class="agent__ic"></span><span class="agent__name">${name}</span><span class="agent__count"></span><div class="agent__think"></div>`;
      rows.appendChild(row); scroll();
      const countEl = row.querySelector(".agent__count");
      const think = row.querySelector(".agent__think");
      for (let L = 0; L < events.length; L++) {
        if (!alive()) return false;
        const ev = events[L], ln = document.createElement("div");
        if (ev.k === "tool") {
          ln.className = "tline tline--tool";
          ln.innerHTML = `<span class="tchip">TOOL</span><code>${ev.x}</code>` + (ev.note ? `<span class="tnote">${ev.note}</span>` : "");
        } else {
          ln.className = "tline tline--think"; ln.textContent = ev.x;
        }
        think.appendChild(ln); scroll();
        if (steps) countEl.textContent = Math.round(steps * (L + 1) / events.length) + " steps";
        await wait(ev.k === "tool" ? 560 : 820);     // thinking lingers a beat longer
      }
      if (steps) countEl.textContent = steps + " steps";
      row.classList.remove("is-run"); row.classList.add("is-done");
      row.querySelector(".agent__ic").textContent = "✓";
      // keep reasoning visible so the conversation flows continuously downward
      scroll(); await wait(300);
    }
    head.querySelector(".pipe__spin").classList.add("is-done");
    head.querySelector(".pipe__title").textContent = "Mesh ready";
    head.querySelector(".pipe__state").textContent = "completed";
    head.classList.add("is-done");
    scroll();
    return true;
  }

  function buildResult() {
    const card = addMsg("ai", "");
    card.querySelector(".msg__body").innerHTML = `<div class="result">
        <div class="result__tag"><i></i>RESULT</div>
        <p class="result__text">${RESULT}</p>
        <div class="exports">${EXPORTS.map(([f, s]) => `<div class="exp"><span class="exp__fmt">${f}</span><span class="exp__sz">${s}</span></div>`).join("")}</div>
      </div>`;
    scroll();
    return [...card.querySelectorAll(".exp")];
  }

  /* ---------- main run ---------- */
  let token = 0;
  async function run() {
    const my = ++token; const alive = () => my === token;
    cursor.classList.add("show"); await moveCursor(70, 280, 0); await wait(300);

    addMsg("ai", "Let's define your simulation. What analysis are you running on this geometry? <span class=\"dim\">(external aero, internal flow, thermal, structural FEA…)</span>");
    await wait(900); if (!alive()) return;
    await userTurn("External aerodynamics CFD on this airfoil."); if (!alive()) return;
    addMsg("ai", "Flow conditions? Velocity, angle of attack, turbulence model.");
    await wait(740); if (!alive()) return;
    await userTurn("NACA 0012 at 50 m/s, sea level, 4° AoA. k-ω SST."); if (!alive()) return;
    addMsg("ai", "And the domain extent plus near-wall resolution?");
    await wait(740); if (!alive()) return;
    await userTurn("2D. 15c up, 25c down, 12c top/bottom. y+ below 1."); if (!alive()) return;

    addMsg("ai", SUMMARY);
    await wait(760); if (!alive()) return;
    const ask = addMsg("ai", "Shall I proceed with mesh generation?");
    const gen = document.createElement("button"); gen.className = "gen-btn"; gen.textContent = "Generate mesh →";
    ask.querySelector(".msg__body").appendChild(gen); scroll();
    await wait(560); if (!alive()) return;
    await moveTo(gen, 0.5, 0.5, 600); if (!alive()) return; await clickFx();
    gen.disabled = true; gen.style.opacity = "0.55";
    addMsg("user", "Yes, proceed."); await wait(460); if (!alive()) return;

    if (!await runPipeline(alive)) return;
    await wait(520); if (!alive()) return;
    const tiles = buildResult();
    tiles.forEach((t, i) => setTimeout(() => { if (alive()) t.classList.add("is-in"); }, 90 * i));
    await wait(900); if (!alive()) return;
    replay.classList.add("show");
  }

  function reset() {
    token++;
    log.innerHTML = ""; field.textContent = ""; caret.classList.remove("on");
    replay.classList.remove("show"); cursor.classList.remove("show");
  }

  /* ---------- static fallback (reduced motion) ---------- */
  function renderStatic() {
    addMsg("ai", "Let's define your simulation. What analysis are you running on this geometry?");
    addMsg("user", "External aerodynamics CFD on this airfoil. NACA 0012, 50 m/s, 4° AoA, y+ < 1.");
    addMsg("ai", SUMMARY);
    const card = addMsg("ai", "");
    card.querySelector(".msg__body").innerHTML = `<div class="pipe">
        <div class="pipe__head is-done"><span class="pipe__spin is-done"></span><span class="pipe__title">Mesh ready</span><span class="pipe__state">completed</span></div>
        <div class="pipe__rows">${AGENTS.map((a) => `<div class="agent is-done"><span class="agent__ic">✓</span><span class="agent__name">${a.name}</span><span class="agent__count">${a.steps ? a.steps + " steps" : ""}</span></div>`).join("")}</div>
      </div>`;
    const tiles = buildResult();
    tiles.forEach((t) => t.classList.add("is-in"));
    replay.classList.add("show");
  }

  if (reduceMotion) {
    renderStatic();
  } else {
    let started = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && !started) { started = true; run(); io.disconnect(); } });
    }, { threshold: 0.3 });
    io.observe(win);
    replay.addEventListener("click", () => { reset(); run(); });
  }
})();
