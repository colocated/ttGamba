import { Count, Panel, Stage } from "@tt/window";

import type { Tone } from "@/lib/desk";

/**
 * ttGamba's page furniture.
 *
 * `Stage`, `Panel` and `Count` are the window's own and are re-exported rather
 * than redefined, so a page imports its furniture from one place regardless of
 * which side of the package boundary a given piece lives on. What is defined
 * here is the part that is about *this* app: a tone vocabulary in which
 * `settled` means a request whose chips have moved.
 */
export { Count, Panel, Stage };

/**
 * A tone, as colours. Border, tint and text — the fill stays at a tenth so a
 * coloured label reads as a label rather than as the loudest thing on a page
 * whose job is to be scanned.
 *
 * Shared with the banker desk's status pills, so a green means the same thing
 * wherever it turns up.
 */
export const TONES: Record<Tone, string> = {
  neutral: "border-edge bg-tone-3 text-ink-soft",
  good: "border-felt/50 bg-felt/10 text-felt-hi",
  settled: "border-settled/50 bg-settled/10 text-settled",
  bad: "border-loss/50 bg-loss/10 text-loss",
  muted: "border-edge/60 bg-tone-2 text-ink-muted",
};

/**
 * Small inline label. Squared off — no pills anywhere (DESIGN.md).
 *
 * `inline-flex`, not plain inline, and that is load-bearing rather than tidy.
 * A tag often holds a glyph beside its text, and the obvious way to line those
 * up is a `flex` span inside — which makes a *block-level* child of an inline
 * box. CSS then splits the inline box around it, and the border and padding are
 * drawn once per fragment: two thin vertical slivers stacked above and below
 * the content, looking for all the world like a broken scrollbar.
 *
 * Being a flex container itself means an icon and a label just work, and there
 * is nothing to nest.
 */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  /** Left alone, a tag is the plain grey one. Colour is for labels worth picking out. */
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border px-2 py-1 text-xs uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Placeholder body for the games that haven't been built yet. */
export function ComingSoon({ what }: { what: string }) {
  return (
    <Panel className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Not built yet</h2>
      <p className="text-sm text-ink-soft">
        {what} lands in a later stage. This pane is here so the frame and the
        navigation can be checked in game first.
      </p>
    </Panel>
  );
}
