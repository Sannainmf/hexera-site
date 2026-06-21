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
