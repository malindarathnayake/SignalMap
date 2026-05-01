# Nano Banana 2 — image generation prompts for SignalMap

Two prompts: a **GitHub repo banner** (1280×640 hero) and a **refined app
logo**. Both reference the existing inline SVG mark in
`src/components/chrome/CommandBar.tsx` (concentric radar rings + a center
node + an offset incident dot), and the design tokens in
`src/styles/tokens.css`:

- **Background:** very dark navy/near-black (`#07090d` / `#0c1016`)
- **Accent (primary):** SignalMap cyan `#4cc9f0`
- **Accent dim:** `#1e6680`
- **Severity / incident:** orange `#ff6b35`
- **Text:** very light grey `#e8eef7`

The app vibe is "operations console / threat intel terminal" — closer to a
Bloomberg-style dashboard or a SOC display than a consumer SaaS landing
page. Avoid corporate gradients, generic globe clip-art, and anything
that looks AI-generated-stock.

---

## 1. GitHub repository banner (1280×640)

**Use case:** Repo "Social preview" image, README hero, release post.

```
Create a 1280x640 cinematic hero banner for an open-source operational
intelligence project called "SignalMap".

VISUAL CONCEPT:
A wide, dark dashboard composition showing a stylized world map fading
into a constellation of glowing data points. The map is rendered as a
fine dot-grid (Mercator-like outlines) in the lower-left two thirds of
the canvas, with subtle latitude/longitude lines and a few brighter
"incident" markers pulsing on key cities. Overlaid on the right are
abstract telemetry shapes — concentric radar rings sweeping from a
center node, a thin sparkline, a stack of source-health status pills,
and a few small terminal-style cards with mono-spaced numerics
("0.62 < 0.70", "45 / 50", "T1") just legible enough to feel real but
not a screenshot.

TYPOGRAPHY:
The word "SignalMap" appears top-left in a clean geometric sans-serif
(think Inter / IBM Plex Sans), all lowercase or smallcaps, in the cyan
accent color. Below it in much smaller, monospaced grey:
"operational signal intelligence — open source".

PALETTE (strict):
- Background gradient: very-dark navy #07090d at corners to #0c1016 in
  the center.
- Primary glow / type / radar rings: cyan #4cc9f0 with a soft bloom.
- Secondary structure (graticule, ring outlines, pill borders): muted
  cyan #1e6680, used at 30-50% opacity.
- Incident markers + one or two highlight strokes: warm orange #ff6b35.
- Text body: off-white #e8eef7.
- No purple, no magenta, no green, no rainbow.

LIGHTING:
Cool ambient with focused cyan rim-light on the map dots. The orange
incident markers should feel hot — slight bloom, not flat.

FEEL:
Quiet, technical, calm. SOC at 3 AM, not a launch announcement. No
people, no hands, no faces. No brand mascots. No glassmorphism. No
photorealistic earth from space. Flat-but-luminous, like a vector
operational display rendered through a soft glass filter.

NEGATIVE PROMPTS (do NOT include):
photo, realistic earth, satellite imagery, lens flare clipart, fingers
typing, 3D globe, bitmap world map texture, stock-photo people, neon
purple, cyberpunk pink, anime, generic AI-art "data" particles, text
that's wrong / scrambled, overly busy.

ASPECT: 1280x640 (2:1). High-detail vector look.
```

**Tip:** if the model insists on rendering type incorrectly, regenerate
with `"leave space for typography (no rendered text)"` and add the
"SignalMap" wordmark afterwards in Figma over the result. The visual
furniture is what the model is good at; the text is what it's bad at.

---

## 2. App logo (square, scalable mark)

**Current placeholder:** an inline SVG in `CommandBar.tsx` — three
concentric circles (radii 10.5, 6.5, 2.5) on the same center, plus a
small offset orange dot at (19, 6). It reads as: *radar sweep + a
detected anomaly off-axis*. Keep that semantic.

```
Create a square 1024x1024 vector-style icon for "SignalMap", an
operational intelligence tool. Flat, single-layer, no inner gradients.

CONCEPT:
A "radar with one off-axis incident" mark. Three concentric circles of
decreasing radius, sharing a center, rendered as thin strokes. A small
solid filled dot at the exact center represents the observer / station.
A second smaller dot, brighter and warmer in color, sits OUTSIDE the
outermost ring at roughly 1-o'clock — the detected signal off the
sweep.

STYLE:
- Two-color flat. No gradients within shapes. No drop shadow.
- Outer rings: cyan #4cc9f0 strokes at varying opacity (outermost 50%,
  middle 70%, innermost 100%).
- Center dot: cyan #4cc9f0 solid, ~10% of total canvas diameter.
- Off-axis incident dot: warm orange #ff6b35 solid, ~6% of total
  canvas diameter.
- Background: transparent. (For the version with a tile, use a solid
  near-black #07090d square with 12% rounded corners.)

PROPORTIONS:
- Outermost ring radius ≈ 44% of canvas.
- Middle ring radius ≈ 27%.
- Innermost ring radius ≈ 10% (this is the one that visually frames
  the center dot — the dot sits inside it).
- Stroke width ≈ 2% of canvas.
- Off-axis dot positioned at angle ≈ 17° above the horizontal (1 o'clock),
  centered at ~78% of canvas diagonal from center.

NEGATIVE PROMPTS:
no globe, no map, no text, no compass rose, no sweeping animated arc,
no needles, no military targeting reticles, no crosshairs, no
glassmorphism, no inner glow, no skeuomorphism, no 3D, no isometric,
no neon haze.

DELIVER:
1. The transparent-background version (for app icons / favicon).
2. A second version on a #07090d rounded-square tile (for the GitHub
   repo profile picture).
```

**Note on the existing logo:** the SVG in `CommandBar.tsx` already
matches the brief above — this prompt is for a higher-fidelity
rendering (clean strokes, anti-aliased, proper proportions) suitable
for app icon export, favicon, and repo avatar. If Nano Banana keeps
adding flourishes, ask for "minimal, no extra elements, exactly three
rings + two dots."

---

## 3. Tips for using these prompts

- **Generate 4-8 variants per prompt.** Pick the cleanest, then refine.
- **For the banner**, the typography is the weakest link. If the
  generated "SignalMap" wordmark is mangled, ask for "no text, leave
  the upper-left third empty for a wordmark to be added later."
- **For the logo**, ask for the file in SVG if Nano Banana 2 supports
  vector export in your tier; otherwise PNG at 2048×2048 minimum.
- **Negative prompts matter more than you'd think** — the explicit
  "no globe, no neon purple, no people" lines do the heavy lifting.
- **Iterate on color, not concept.** The concentric-rings + offset-dot
  semantic is doing the brand work; don't let the model wander to
  gauges, dials, or arrows.

## 4. Where to put the outputs

| File | Purpose |
| --- | --- |
| `docs/assets/banner.png` | README hero, GitHub social preview |
| `docs/assets/logo.svg` | Source vector |
| `public/logo.png` | App favicon source |
| `public/icon-512.png` | PWA / repo avatar |
