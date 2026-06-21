/* ============================================================
   Hexera hero — HUD count-up, sticky nav,
   and ambient background drift + subtle mouse parallax.
   (Background is a generated still image; no canvas engine.)
   ============================================================ */

(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* sticky nav */
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ambient background drift + subtle mouse parallax
     (single GPU transform on the fixed art layer; paused when hidden) */
  const art = document.querySelector(".hero-art");
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (art && !reduceMotion) {
    let tmx = 0, tmy = 0, mx = 0, my = 0, raf = 0;
    const start = performance.now();

    if (finePointer) {
      window.addEventListener("pointermove", (e) => {
        tmx = e.clientX / window.innerWidth - 0.5;
        tmy = e.clientY / window.innerHeight - 0.5;
      }, { passive: true });
    }

    const loop = (now) => {
      const t = (now - start) / 1000;
      const dx = Math.sin(t * 0.06) * 1.1;
      const dy = Math.cos(t * 0.045) * 0.85;
      mx += (tmx - mx) * 0.045;
      my += (tmy - my) * 0.045;
      const px = dx - mx * 1.4;
      const py = dy - my * 1.1;
      art.style.transform = `scale(1.06) translate(${px}%, ${py}%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) { raf = requestAnimationFrame(loop); }
    });
  }
})();
