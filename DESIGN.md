# Design

## Theme

Dark technical instrument. Warm-obsidian near-black surface; the brand colors and a
generated aero/fluid background carry the mood. Committed dark strategy: the surface
is the void of a wind tunnel, gold is the dominant brand/precision color, teal is the
computational/flow accent. Mood phrase: *"a wind-tunnel readout at 2am — gold
streamlines over obsidian, teal where the computation runs."*

Reference lane (named, on purpose): Navier AI's dark-technical hero + impeccable.style's
gold-on-obsidian palette and big-thin-display *treatment*. Distinctiveness comes from
our own fonts, an abstract (non-marble) flow background, and a real, rendered CFD mesh
of the customer's own geometry — not stock illustration. Bans honored: no gradient
text, no card grid, no cream, no per-section eyebrows.

## Color

Palette committed by the brand owner (obsidian / gold / teal / champagne) — identity
preservation wins over any seed. Values as implemented in `styles.css`.

| Role | Value | Use |
|---|---|---|
| `--bg` | `#0b0903` | Warm obsidian page background |
| `--bg-2` | `#14110a` | Slightly raised surface |
| `--ink` | `oklch(0.93 0 0)` | Headlines, primary text (champagne-white) |
| `--muted` | `oklch(0.80 0 0)` | Body / secondary text (≥4.5:1 on bg) |
| `--faint` | `oklch(0.60 0.01 95)` | Mono labels, captions |
| `--teal` / `--teal-deep` | `#0fb6ac` / `#0a8b84` | Flow accent, mesh glow, links, status |
| `--gold` / `--gold-soft` | `#ddab46` / `#e8c879` | Primary CTA, key-word accent, airfoil render |
| `--gold-ink` | `#1c1404` | Dark text on the pale gold CTA only |

Text-on-color: dark ink only on the gold CTA; everything else champagne/white. Teal is
stroke/glow, never a text-bearing fill. (Crimson was trialed as a "cost" accent and
removed — palette stays four colors.)

## Typography

Own system, distinct from both references (impeccable's Alumni Sans Pinstripe and
Navier's Berkeley Mono). Tall, thin display + clean grotesque body + mono for data.

- **Display:** `Big Shoulders Display`, **weight 300** (thin, tall, condensed —
  aerospace-signage character). Hero headline `clamp(2.4rem, 1rem + 4vw, 4.6rem)`,
  line-height ~0.97, letter-spacing ~0, champagne with one key word ("engineer") in
  gold. Condensed → fills the column at size without overflowing.
- **Body / UI / nav / wordmark:** `Geist`, weight 400–600 — clean, modern, neutral;
  HEXERA wordmark tracked 0.24em.
- **Data / labels:** `Geist Mono`, weight 400–500 — the eyebrow kicker, window chrome,
  agent-step lines, and the mesh HUD readout (engineering vernacular; not the headline).

Avoid: bold/heavy display weights, monospace headlines, cloning Alumni Sans Pinstripe.

## Signature

Two coordinated pieces:

1. **Generated background** (`assets/hero-bg.jpg`, ~154 KB, Higgsfield · Recraft 4.1,
   palette-locked): an abstract aerodynamic flow — gold streamline ribbons with woven
   teal accents over obsidian, like wind-tunnel flow-vis. Gold-dominant, multiple
   shades, deliberately NOT impeccable's kintsugi marble. Fixed layer with ambient
   drift + subtle mouse-parallax. (Raw option sets kept in `assets/options*/`,
   current = `options2/g2`.)

2. **In-hero product demo** — a `hexera · mesh studio` window on the right of the hero
   that plays a single sequence: animated cursor + typed chat (define the CFD run) →
   four agent steps with a self-correcting QA beat → **fly-in to a rendered view of the
   customer's real mesh**. The mesh is extracted from the actual Gmsh file
   (`naca_airfoil_tunnel.msh`) into `assets/mesh2.json` as two LODs in one shared
   chord-unit frame: `ov` (full tunnel domain — C-grid inlet, refinement cross, coarse
   quadrants; ~20k edges) and `dt` (airfoil close-up keeping the boundary-layer cells;
   ~52k edges). Rendered on `<canvas>` with a perspective camera: opens on the full
   domain, eases in, LOD-swaps to the close-up, then orbits (±35°, eased) while the
   cursor pans. Mesh HUD shows real counts (172,874 cells · 86,747 nodes). Extraction
   scripts in `tools/`.

## Layout

- Two-column hero (`.hero__grid`): text left (eyebrow · headline · sub · two CTAs),
  the product window right — modeled on impeccable's localhost mockup, but the window
  swaps chat→mesh rather than sitting side-by-side (avoids over-wide layout).
- Fixed top nav (logo · links · gold "Request access"); bottom-left scroll cue.
- Fluid `clamp()` spacing. Stacks to one column at ≤1000px (window below text); cursor
  hidden and chat shown statically on touch/reduced-motion.
- z-index scale: background(0) → content(10) → nav(20); window-internal cursor(30).

## Motion

- Page-load: eyebrow → headline lines → sub → CTAs → window rise+fade (staggered,
  ease-out-expo).
- Ambient: background drift + mouse parallax (single GPU transform, paused when hidden).
- Demo: cursor move/click, typewriter input, agent-step spinners → checks, camera
  fly-in (smootherstep), continuous eased orbit, cursor pan; auto-plays once on scroll
  (IntersectionObserver), Replay control.
- `prefers-reduced-motion`: no entrance/parallax; demo shows the conversation populated
  statically plus one static 3/4 render of the mesh.

## Refit (Sep 2026): the Inngest / Railway pass

Lives in `refit.css` (loaded after `orange-theme.css`) plus three feature-detected
blocks at the end of `pages.js`. Nothing below is a new dependency.

- **From Inngest:** a fine static grain tile (`assets/grain.png`, tone just above the
  page black) behind every quiet section, fading out where a flat-black canvas
  set-piece follows; a miniature of the pipeline (four nodes, one loop) in the pipeline header; display lines set uppercase 600 with a solid line paired with an
  outlined one (`-webkit-text-stroke`); mono uppercase taglines and buttons;
  square bullets; the footer's mesh mark (`[data-meshmark]`, canvas): a point cloud
  that streams in as you near the page end and seats itself as the Hexera cube,
  meshed with a grid over its faces, beside a stippled HEXERA.
- **From Railway:** the pipeline is a vertical rail (`.rail`), one node per phase,
  tinted mono pill over a bold Geist heading, a small readout card per phase, the
  Gate → Mesh retry drawn as a dotted loop with a running pulse; the industries
  switcher is a segmented control; the readout board (`.board`, `[data-flap]`)
  flips its tiles in once on view.
- Untouched: fluid hero art, in-hero demo, mesh scroll, industries stage,
  ambition list, Lenis, entrances, waitlist form.


## Midnight (November 2026)

The shipped theme. One file, `midnight-theme.css`, loaded last; drop its `<link>` to go back to the orange look.

- **Colour:** three and no more. Black `#050505` (the page, as before), stone `#AFAEA2` (ink, hairlines, wireframes), crimson `#D21319` (the one accent, where international orange used to be). Small crimson type uses `#E8403D` so it holds on black. A navy page was tried first and rejected: the site stays black.
- **Type:** the site's own faces: Saira Semi Condensed capitals for headlines (first line crimson, second solid stone; no outline, no italic), Geist Mono for nav, buttons, taglines and data, Geist for body. The serif, Cormorant, sets the HEXERA wordmark and the headings inside sections: the mesh-scroll steps, the pipeline's step and phase names, the industry names, the frontier label and the footer's column heads. The rule: the three big statements that open, turn and close the page (the hero, "Engineers lose weeks", "Send us a part") are Saira capitals; everything inside a section, its heading included ("Four phases, one pipeline"), is the serif. Serif in the hero was tried and pulled back as too much.
- **Hero art and smoke:** the original plates, re-inked rather than replaced (orange to crimson, blue-grey to stone): `assets/hero-bg-midnight.jpg` from `hero-bg-orange.jpg`, `assets/header-smoke3-midnight.png` from `header-smoke3.png`. The fluid still masks against `hero-bg.jpg` (same geometry).
- **ASCII (`ascii.js`):** three pieces, all real text.
  - *Interlude:* an airliner wing beside the statement (swept and tapered with a kink, winglet, engine on its pylon): a shaded solid with its panel lines, then meshed by hand one cell at a time, then meshed by Hexera in one sweep. 288 x 120 characters on a wide stage, 168 x 70 on a phone. No caption.
  - *Pipeline plates:* the four phases are four spreads, copy on one side and a figure drawn in text on the other, alternating. Fig. 1 is the interview as a transcript. Fig. 2 is a manifold (one inlet, three outlets, a flange on each) as shaded text, the edge of each opening in the accent, and nothing else (the part is a signed distance of cylinders and quarter tori, ray-marched by `make_manifold.py`). Fig. 3 is an FEA case: a sprocket meshed with gmsh, graded fine at the tooth roots, keyway and holes, drawn as a solid seen from above and to one side: its faces as bright as the mesh is fine, its outside walls lit, the walls of its holes in shade (`make_sprocket.py render3d`). Fig. 4 is the gates as bars against their limits. The header carries the whole pipeline as one line (`svg.flowline`, written by `hexera_ops/site_theme/make_flowline.py`): a dotted streamline that weaves down from CAD to a solver-ready mesh, each phase named beside it on alternating sides with its number set on the line, dashes running along it as the air does in the footer, and the gate's retry as a crimson line running back up to the mesh. Tried there and replaced: a horizontal ASCII box diagram (lined up with nothing) and a ruled table of rows (blocky). The figures are static HTML written by `hexera_ops/site_theme/build_pipeline.py`; the old rail, cards and pills are gone from the markup.
  - *Footer:* two full screens. Screen one is the pitch with the meshed cube (its canvas sits in `.fend__stage`, one screen tall, and finishes when that screen is in view). Screen two is a wind tunnel that fills the screen, with the link columns and legal line set over it, larger. One 3D scene, standing still. The car is a real Hexera mesh (`assets/car2.json.gz`) seen from the front quarter: its own mesh lines with hidden lines removed, lit, with the silhouette drawn bright, set as characters at 230 columns, the brightest in a second layer. `hexera_ops/site_theme/car_scene.py` writes it to `assets/ascii-car-3d.json` together with the depth of every car cell, the map from model space to the text grid, and the height the air must clear in each vertical plane along the car. `ascii.js` draws the air in that same space: every streamline runs along the car, nose to tail, in its own plane at its own height, lifts over the body, is hidden where it passes behind the car and drawn over it where it passes in front. There are twenty-five streamlines, laid out in order so each can be followed: five hug the body across its width (the centre one in the accent), ten stack above them, five pass each side; each is a dotted path with solid dashes led by an arrowhead, all at one speed, and they rise only near the nose. Only the dashes move, until the pointer comes in: over the scene it acts as an obstacle, and the lines part round it with a short wake. (A screen-filling field of about 45 short dashes plus a dotted floor was tried and rejected as messy, with no clear direction.) (A rotating car with flat left-to-right streamlines was tried and rejected: the car must not turn, and the air must run in the scene's 3D direction.)
  - Tried and removed: a contour map behind the frontier list (read as scratches), an octree mesh figure and a boxed shaded wing with lettered edges (both read as blocks, not as the idea). An equation plot with a facts table was also dropped as overdone. The figures deliberately use different parts (manifold, sprocket, car) so the page does not lean on the airfoil.
- **Labels:** the step tags over the mesh scroll and the mode line over each industry are the word alone in mono capitals: no box, and no rule in front (a rule before a label reads as machine-made).
- **Scenes:** the industries canvases read the theme tokens; colours baked into the scene assets are mapped to the three roles in `pages.js` (`themed`). The cut-plane images are re-inked copies (`*-midnight.jpg`).
- **Fluid:** the wall mask measures distance from the page colour (`--bg-rgb`) instead of raw brightness.
