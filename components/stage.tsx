/**
 * Shared chrome for anything rendered in the window's right-hand pane, so every
 * game and settings page gets the same header rhythm.
 */
export function Stage({
  title,
  blurb,
  aside,
  children,
}: {
  title: string;
  blurb?: string;
  /** Optional top-right slot — status pills, round timers, and so on. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {blurb ? <p className="text-sm text-ink-soft">{blurb}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** An opaque raised surface. Opacity against the translucent stage is the depth cue. */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-panel border border-edge bg-raised p-4 ${className}`.trim()}
    >
      {children}
    </section>
  );
}

/** Small inline label. Squared off — no pills anywhere (DESIGN.md). */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-chip border border-edge bg-tone-3 px-2 py-1 text-xs uppercase tracking-wide text-ink-soft">
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
