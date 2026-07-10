/* ============================================================
   Hexera — Airfoil mesh scroll experience
   PORT of the old HEXARA site's AirfoilExperience, verbatim
   (parser + camera choreography), loading the same embedded mesh
   (now assets/airfoil.msh.gz, inflated with pako) and themed teal.
   Phases: side-on solid airfoil → rotate → wireframe → dolly out to
   full domain → node distribution.
   ============================================================ */
(function () {
  "use strict";

  // airfoil + mesh share this colour; themed via --mesh-line-rgb (falls back to teal)
  const TEAL = (() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--mesh-line-rgb").trim();
    if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v)) {
      const [r, g, b] = v.split(",").map((n) => parseInt(n, 10));
      return (r << 16) | (g << 8) | b;
    }
    return 0x0fb6ac;
  })();

  // ─── mesh parsing (verbatim from HEXARA) ───
  function parseMshContent(data) {
    const lines = data.split("\n");
    let nodeCount = 0, elementCount = 0;
    let nodes = [];
    let elements = [];
    let airfoilElements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.startsWith("$MeshFormat")) {
        i++; i++;
        while (i < lines.length && lines[i].trim() !== "$EndMeshFormat") i++;
        i++; continue;
      }

      if (line === "$Nodes") {
        i++;
        const headerParts = lines[i].trim().split(/\s+/);
        const numEntityBlocks = parseInt(headerParts[0]);
        nodeCount = parseInt(headerParts[1]);
        i++;
        for (let block = 0; block < numEntityBlocks; block++) {
          const blockHeader = lines[i].trim().split(/\s+/);
          const numNodesInBlock = parseInt(blockHeader[3]);
          i++;
          for (let n = 0; n < numNodesInBlock; n++) i++;
          for (let n = 0; n < numNodesInBlock; n++) {
            const coords = lines[i].trim().split(/\s+/).map(parseFloat);
            nodes.push(coords[0], coords[1], coords[2]);
            i++;
          }
        }
        while (i < lines.length && lines[i].trim() !== "$EndNodes") i++;
        i++; continue;
      }

      if (line === "$Elements") {
        i++;
        const headerParts = lines[i].trim().split(/\s+/);
        const numEntityBlocks = parseInt(headerParts[0]);
        elementCount = parseInt(headerParts[1]);
        i++;
        for (let block = 0; block < numEntityBlocks; block++) {
          const blockHeader = lines[i].trim().split(/\s+/);
          const entityTag = parseInt(blockHeader[1]);
          const elementType = parseInt(blockHeader[2]);
          const numElementsInBlock = parseInt(blockHeader[3]);
          i++;
          for (let e = 0; e < numElementsInBlock; e++) {
            const parts = lines[i].trim().split(/\s+/).map((p) => parseInt(p));
            if (elementType === 2) {
              if (entityTag === 37) {
                airfoilElements.push(parts[1] - 1, parts[2] - 1, parts[3] - 1);
              } else {
                elements.push(parts[1] - 1, parts[2] - 1, parts[3] - 1);
              }
            }
            i++;
          }
        }
        while (i < lines.length && lines[i].trim() !== "$EndElements") i++;
        i++; continue;
      }
      i++;
    }
    return { nodes, elements, airfoilElements, nodeCount, elementCount };
  }

  // ─── the experience (verbatim from HEXARA, themed teal) ───
  class AirfoilExperience {
    constructor(meshData) {
      this.section = document.getElementById("meshExperience");
      this.canvas = document.getElementById("meshCanvas3D");

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);  /* aspect set in sizeToStage() */
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x060402, 0); // transparent — the stage's CSS background shows behind the model

      this.progress = 0;
      this.currentPhase = "surface";
      // demo NACA 0012 mesh size — the tally counts up to these as the wireframe forms
      this.NODE_TOTAL = 86747;
      this.ELEM_TOTAL = 172874;
      this.meshData = meshData;

      this.buildScene();
      /* portrait: a 50° vertical FOV collapses the horizontal view to ~24°
         and the model clips both edges — widen vFov so hFov never drops
         below the 50° the shots were composed for. buildScene() computed
         overviewDist from the base fov first, so the domain reveal fits the
         narrow axis with the same 1.3 margin desktop gets. */
      this.baseFov = this.camera.fov;
      this.sizeToStage();
      this.bindEvents();
      this.updateScroll();
      /* reduced motion: hold one representative frame (mesh phase), no loop,
         no scroll-scrubbed camera — this was the one ungated large motion */
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.progress = 0.55;
        this.applyCamera();
        this.renderer.render(this.scene, this.camera);
        return;
      }
      /* render only while the section is on screen — otherwise this loop
         burns GPU on a full-screen wireframe 20,000px off-viewport */
      this.visible = false;
      new IntersectionObserver((es) => es.forEach((en) => { this.visible = en.isIntersecting; })).observe(this.section);
      this.animate();
    }

    buildScene() {
      const { nodes, elements, airfoilElements } = this.meshData;
      const posAttr = new THREE.Float32BufferAttribute(nodes, 3);

      // Airfoil geometry (entity 37)
      const airfoilGeo = new THREE.BufferGeometry();
      airfoilGeo.setAttribute("position", posAttr);
      airfoilGeo.setIndex(airfoilElements);
      airfoilGeo.computeVertexNormals();

      this.airfoilSolid = new THREE.Mesh(airfoilGeo, new THREE.MeshPhongMaterial({
        color: TEAL, shininess: 40, transparent: true, opacity: 0.92,
        side: THREE.DoubleSide, specular: 0x222222,
      }));
      this.scene.add(this.airfoilSolid);

      const airfoilWireGeo = new THREE.WireframeGeometry(airfoilGeo);
      this.airfoilWire = new THREE.LineSegments(airfoilWireGeo, new THREE.LineBasicMaterial({
        color: TEAL, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false,   // all lines fade in together — no back-face "pop"
      }));
      this.airfoilWire.visible = false;
      this.scene.add(this.airfoilWire);

      // Domain geometry (everything else)
      const domainGeo = new THREE.BufferGeometry();
      domainGeo.setAttribute("position", posAttr);
      domainGeo.setIndex(elements);

      const domainWireGeo = new THREE.WireframeGeometry(domainGeo);
      this.domainWire = new THREE.LineSegments(domainWireGeo, new THREE.LineBasicMaterial({
        color: TEAL, transparent: true, opacity: 0,
      }));
      this.domainWire.visible = false;
      this.scene.add(this.domainWire);

      // Known geometry bounds
      this.airfoilCenter = new THREE.Vector3(50, 0, 25);
      this.center = new THREE.Vector3(100, 0, 25);
      this.maxDim = 800;

      // Lights
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir1 = new THREE.DirectionalLight(0xffffff, 0.8); dir1.position.set(100, 100, 100);
      const dir2 = new THREE.DirectionalLight(TEAL, 0.3); dir2.position.set(-100, -50, -100);
      this.scene.add(dir1, dir2);

      // Camera distances
      const fov = this.camera.fov * (Math.PI / 180);
      this.overviewDist = (this.maxDim / 2 / Math.tan(fov / 2)) * 1.3;
      this.zoomDist = 180;

      // Initial camera
      const ac = this.airfoilCenter;
      const startRadius = this.zoomDist * 0.8;
      this.camera.position.set(
        ac.x + Math.sin(-1.6) * startRadius,
        ac.y + startRadius * 0.35,
        ac.z + Math.cos(-1.6) * startRadius
      );
      this.camera.lookAt(ac);
    }

    /* size from the canvas's own CSS box (100% of the sticky stage), never
       window.innerWidth: innerWidth tracks the pinch-zoom VISUAL viewport on
       phones, which resized the buffer wider than the page column and
       clipped the model off the right edge. setSize(..., false) leaves the
       CSS sizing alone so the box stays locked to the layout. */
    sizeToStage() {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.fitFov();
    }

    fitFov() {
      const a = this.camera.aspect;
      this.camera.fov = a < 1
        ? (2 * Math.atan(Math.tan(this.baseFov * Math.PI / 360) / a)) * 180 / Math.PI
        : this.baseFov;
      this.camera.updateProjectionMatrix();
    }

    updateScroll() {
      const rect = this.section.getBoundingClientRect();
      const sectionHeight = this.section.offsetHeight;
      const viewportHeight = window.innerHeight;
      const scrolled = -rect.top;
      const scrollableDistance = sectionHeight - viewportHeight;
      this.progress = Math.max(0, Math.min(1, scrolled / scrollableDistance));
    }

    applyCamera() {
      const p = this.progress;
      const c = this.center;
      const ac = this.airfoilCenter;
      const zd = this.zoomDist;

      // phases stretched to fill the full scroll (no node phase); the
      // solid→wireframe fade is elongated.
      const rotateEnd = 0.20;
      const meshEnd = 0.60;
      const radius = zd * 0.8;

      if (p <= rotateEnd) {
        const t = p / rotateEnd;
        const azimuth = -1.6 + t * 1.5;
        const elev = 0.35 + t * 0.2;
        this.camera.position.set(ac.x + Math.sin(azimuth) * radius, ac.y + radius * elev, ac.z + Math.cos(azimuth) * radius);
        this.camera.lookAt(ac);
        this.airfoilSolid.visible = true; this.airfoilSolid.material.opacity = 0.92;
        this.airfoilWire.visible = false; this.airfoilWire.material.opacity = 0;
        this.domainWire.visible = false; this.domainWire.material.opacity = 0;
        this.currentPhase = "surface";
      } else if (p <= meshEnd) {
        const t = (p - rotateEnd) / (meshEnd - rotateEnd);
        const ease = t * t * (3 - 2 * t);
        const azimuth = -0.1 + t * 0.1;
        this.camera.position.set(ac.x + Math.sin(azimuth) * radius, ac.y + radius * 0.55, ac.z + Math.cos(azimuth) * radius);
        this.camera.lookAt(ac);
        this.airfoilSolid.visible = true; this.airfoilSolid.material.opacity = 0.92 * (1 - ease);
        this.airfoilWire.visible = true; this.airfoilWire.material.opacity = 0.5 * ease;
        this.domainWire.visible = false; this.domainWire.material.opacity = 0;
        this.currentPhase = "mesh";
      } else {
        const t = (p - meshEnd) / (1 - meshEnd);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const closeX = ac.x, closeY = ac.y + radius * 0.55, closeZ = ac.z + radius;
        const farX = c.x, farY = c.y, farZ = c.z + this.overviewDist;
        this.camera.position.set(closeX + (farX - closeX) * ease, closeY + (farY - closeY) * ease, closeZ + (farZ - closeZ) * ease);
        const lookAt = new THREE.Vector3().lerpVectors(ac, c, ease);
        this.camera.lookAt(lookAt);
        this.airfoilSolid.visible = false;
        this.airfoilWire.visible = true; this.airfoilWire.material.opacity = 0.5;
        this.domainWire.visible = true; this.domainWire.material.opacity = 0.4 * ease;
        this.currentPhase = "reveal";
      }

      this.updateUI();
    }

    updateUI() {
      const p = this.progress;
      const mp = document.getElementById("meshProgress");
      if (mp) mp.classList.toggle("visible", p > 0.02);

      const phases = ["surface", "mesh", "reveal"];
      const ids = ["stepSurface", "stepMesh", "stepReveal"];
      const ci = phases.indexOf(this.currentPhase);
      ids.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelector(".progress-dot").classList.toggle("active", idx === ci);
        el.querySelector(".progress-dot").classList.toggle("complete", idx < ci);
        el.classList.toggle("active", idx === ci);
      });

      // embedded process narrative (Send → Mesh → Export)
      const stepsEl = document.getElementById("meshSteps");
      if (stepsEl) {
        stepsEl.classList.toggle("visible", p > 0.02);
        stepsEl.querySelectorAll(".mstep").forEach((el) =>
          el.classList.toggle("active", el.dataset.step === this.currentPhase));
      }

      // live mesh tally — total nodes / elements count up as the wireframe forms,
      // synced to the same smoothstep as the camera, then lock when the mesh completes
      const tally = document.getElementById("meshTally");
      if (tally) {
        const rotEnd = 0.20, mEnd = 0.60;
        let frac;
        if (p <= rotEnd) frac = 0;
        else if (p <= mEnd) { const t = (p - rotEnd) / (mEnd - rotEnd); frac = t * t * (3 - 2 * t); }
        else frac = 1;
        // only once the mesh starts forming (not during the CAD/surface phase)
        tally.classList.toggle("visible", p > rotEnd);
        const nEl = tally.querySelector("[data-mesh-nodes]");
        const eEl = tally.querySelector("[data-mesh-elems]");
        if (nEl) nEl.textContent = Math.round(this.NODE_TOTAL * frac).toLocaleString();
        if (eEl) eEl.textContent = Math.round(this.ELEM_TOTAL * frac).toLocaleString();
      }
    }

    animateValue(id, start, end, dur) {
      const el = document.getElementById(id), t0 = performance.now();
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.floor(start + (end - start) * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    bindEvents() {
      window.addEventListener("scroll", () => this.updateScroll(), { passive: true });
      window.addEventListener("resize", () => this.sizeToStage());
    }

    animate() {
      requestAnimationFrame(() => this.animate());
      if (!this.visible) return;
      this.applyCamera();
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ─── boot: load + inflate the mesh, then start ───
  function boot() {
    if (typeof THREE === "undefined" || typeof pako === "undefined") { setTimeout(boot, 60); return; }
    if (!document.getElementById("meshExperience")) return;
    fetch("assets/airfoil.msh.gz")
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const raw = pako.inflate(new Uint8Array(buf), { to: "string" });
        const meshData = parseMshContent(raw);
        const loading = document.getElementById("meshLoading");
        if (loading) loading.classList.add("hidden");
        new AirfoilExperience(meshData);
      })
      .catch((e) => {
        console.error("Mesh load failed:", e);
        const l = document.getElementById("meshLoading");
        if (l) { const t = l.querySelector(".mesh-loading-text"); if (t) t.textContent = "Error loading mesh"; }
      });
  }
  boot();
})();
