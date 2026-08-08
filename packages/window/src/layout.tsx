/**
 * The handful of primitives that make pages in the stage look like they belong
 * to the same window.
 *
 * Deliberately small. This is not a component library — anything with an
 * opinion about what an app *is* belongs to that app, and the line is roughly
 * "would a second, unrelated user app want this unchanged?". A page header and
 * a raised panel pass; a status pill whose colours mean something specific does
 * not.
 */

import { Tooltip } from "./tooltip";

/**
 * Shared chrome for anything rendered in the window's right-hand pane, so every
 * page gets the same header rhythm.
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
    <section className={`rounded-panel border border-edge bg-raised p-4 ${className}`.trim()}>
      {children}
    </section>
  );
}

/**
 * A figure carried beside a label — a queue's wait on a tab, the items waiting
 * inside a closed drawer.
 *
 * Accent gold, deliberately the same badge everywhere it appears: a number in
 * that colour means "there is something here for you" wherever it turns up, and
 * the moment there are two of them drawn differently it means nothing at all.
 */
export function Count({ value, title }: { value: number; title?: string }) {
  return (
    <Tooltip label={title}>
      <span className="rounded-chip border border-chip/50 bg-chip/10 px-1.5 py-0.5 font-mono text-[11px] tabular-nums leading-none text-chip">
        {value}
      </span>
    </Tooltip>
  );
}
