ANTI-PATTERNS — do not generate these

Shape
- Max border-radius is 8px. Chips/badges max 6px. Never rounded-full,
  never pill-shaped buttons, never circular icon buttons.
- No FABs. No squircles. No shape morphing.

Motion
- Animate when it does a job: showing that something fired, where a thing
  went, or that the app is waiting. Decoration is not a job.
- Keep it quick and flat — 120ms ease-out for colour, up to ~500ms for
  anything larger. No spring/bounce/overshoot easing.
- Don't animate whole screens in. Entrance animations, stagger and scroll
  reveals cost the player time on every view for nothing back.
- No ripple effects on click.

Depth
- box-shadow is banned outside focus rings. Depth is surface tone steps
  only.
- No gradients, no glassmorphism/backdrop-blur on cards, no glow.

Libraries
- Do not use MUI, Material Web Components, or any Material component lib.
- Do not import Material Symbols/Material Icons. Use Lucide.