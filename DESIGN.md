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

Platform chrome
- This window is an iframe handed a game client's viewport. It is not a tab
  in a browser, and nothing here may assume a browser's chrome exists to
  draw around the page.
- Do not use the `title` attribute for supplementary text, a native
  `<select>` for a dropdown, or `alert`/`confirm`/`prompt` for a message or a
  question. These are the browser's own UI, drawn by the browser, outside
  the page — ask for one here and there is no browser side of that contract
  to answer it, so most of them render nothing at all rather than falling
  back to something plain.
- If it puts something on screen, this app draws it — no exceptions for
  "it's just a tooltip" or "it's just a confirm dialog". Build a component
  under DESIGN.md's own rules instead, or reuse one that already exists
  (`components/tooltip.tsx`) before adding another.

THE GAME SURFACE IS EXEMPT

Everything inside a game's box is a drawing of a physical object — felt,
leather, wood, a card with weight to it. Gradients, real curves, texture and
motion with some heft are how it reads as one, and every rule above would be
read as a bug if applied to it.

Inside the box, and only inside it:
- Curves and radii are whatever the object is. A betting circle is a circle.
- Gradients, texture and cast shadow are permitted, as light on a surface.
- Motion may take as long as the thing it depicts — a card crossing a table
  is ~400ms and looks wrong faster. It still never bounces.

The rules resume at the box's edge. The box itself is a panel: 8px, flat,
no shadow. Every control, keypad, readout and label outside the felt — the
betting keys, the action keys, the leave button — is ordinary app chrome and
obeys everything above. A game that leaks felt styling into its controls has
the same bug in reverse.

Reduced motion still shortens rather than removes (see base.css), and
decoration with no state behind it — an idle sway, a shimmer — stops
outright.