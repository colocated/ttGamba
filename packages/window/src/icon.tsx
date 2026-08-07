"use client";

/**
 * An icon named by a string, fetched when something asks for it.
 *
 * An icon named by data — free text an administrator typed, a value out of a
 * database row — cannot be an import, because the name is not known until the
 * row comes back. This is the one component that handles that case, and it
 * should stay the only one.
 *
 * ── The cost, and why it is paid here and nowhere else ────────────────────
 * Every other icon is imported deep and by name —
 * `@phosphor-icons/react/dist/csr/GearSix` — because the package root is a
 * barrel over ~1500 icon modules and importing from it pulls all of them. See
 * `withUserApp` in ./next-config.ts, which is configured specifically against
 * that.
 *
 * The import below is that discipline's one exception: an import whose path is
 * not known until it runs is a path the bundler cannot narrow, so the icon set
 * ends up in the module graph as a group of lazily-loaded chunks. What that
 * buys is that any icon Phosphor ships can be named in data and simply work,
 * which is the point. What it costs is felt at build and in dev rather than by
 * a player: a chunk is fetched per icon actually used, and a shelf of six
 * entries fetches six of them.
 *
 * Anything with a name known at author time must keep importing it directly.
 * This is not a general-purpose icon component and using it as one would put
 * the whole set on a path that had no need of it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
// The `Icon` type from the barrel is free: types are erased, so nothing is
// pulled in. The fallback glyph is imported the ordinary deep way.
import type { Icon } from "@phosphor-icons/react";
import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";

/**
 * What is drawn when the name is not an icon.
 *
 * A neutral glyph rather than a question mark or a warning triangle: an entry
 * whose icon is misspelled is still an entry, and painting it as an error would
 * make the shelf look broken over a picture. Wherever the name was typed is the
 * place to point the mistake out, beside the field that caused it — which is
 * what `known` below is for.
 *
 * An app with a better default for its own domain passes one; ttGamba uses a
 * game controller, because everything in its shelf is a game.
 */
const FALLBACK: Icon = SquaresFourIcon;

/**
 * Resolved names, so a name is fetched once per session however many places
 * draw it. `null` is a name that is not an icon and is worth remembering as
 * firmly as one that is — otherwise every render of a misspelled icon starts a
 * fresh request for a module that does not exist.
 */
const resolved = new Map<string, Icon | null>();
/** In-flight requests, so two components asking at once make one request. */
const inFlight = new Map<string, Promise<Icon | null>>();

/**
 * A typed name, as Phosphor spells it.
 *
 * Administrators write icon names from wherever they found them — the Phosphor
 * site says `poker-chip`, the import in this repository says `PokerChipIcon`,
 * and somebody typing from memory will write `poker chip`. All three mean the
 * same glyph, and refusing two of them would be pedantry about a field whose
 * only job is to name a picture.
 *
 * Exported because the admin panel normalises as you type, so what is stored is
 * what was resolved rather than whatever spelling reached the box.
 */
export function iconName(value: string): string {
  const words = value
    .trim()
    // Split camel humps so `PokerChipIcon` and `poker-chip` end up as the same
    // list of words before either is rebuilt.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  const pascal = words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // `SpadeIcon` is what the import is called; `Spade` is what the module is.
  // Guarded against the icon actually called `Icon`, which does exist.
  return pascal.length > 4 && pascal.endsWith("Icon") ? pascal.slice(0, -4) : pascal;
}

function fetchIcon(name: string): Promise<Icon | null> {
  const existing = inFlight.get(name);
  if (existing) return existing;

  const request = import(`@phosphor-icons/react/dist/csr/${name}`)
    .then((module: Record<string, unknown>) => {
      // Every icon module exports both `SpadeIcon` and a deprecated `Spade`.
      // The suffixed one is the current name, so it is tried first.
      const glyph = module[`${name}Icon`] ?? module[name];

      /*
        An icon is an *object*, not a function, and that is worth a line
        because getting it wrong is silent. Every Phosphor icon is built with
        `React.forwardRef`, which returns an exotic component — a plain object
        carrying a `$$typeof` symbol — so `typeof glyph === "function"` is
        false for every single one of them. A guard written that way rejects
        the whole icon set and the app draws fallbacks forever, with no error
        anywhere to say why.
      */
      const usable =
        typeof glyph === "object" ? glyph !== null : typeof glyph === "function";

      return usable ? (glyph as Icon) : null;
    })
    .catch(() => null)
    .then((glyph) => {
      resolved.set(name, glyph);
      inFlight.delete(name);
      return glyph;
    });

  inFlight.set(name, request);
  return request;
}

/**
 * Whether a name is an icon, and which one.
 *
 * `known` is `null` while the answer is still being fetched — which the admin
 * panel needs, because "not an icon" and "not looked yet" want different things
 * on screen and telling a player their perfectly good icon name is wrong for
 * the two frames it takes to load would be worse than saying nothing.
 */
export function useIcon(
  name: string,
  fallback: Icon = FALLBACK,
): { Glyph: Icon; known: boolean | null } {
  const key = iconName(name);

  /*
    State adjusted during render rather than in an effect, the same pattern
    `useAccumulated` uses (lib/staff.ts): a name that has already been resolved
    is drawn on the first render that asks for it, and a name that changes does
    not spend a frame showing the icon it used to be.
  */
  const [seen, setSeen] = useState<{ key: string; glyph: Icon | null; settled: boolean }>(() => ({
    key,
    glyph: resolved.get(key) ?? null,
    settled: resolved.has(key),
  }));

  if (seen.key !== key) {
    setSeen({ key, glyph: resolved.get(key) ?? null, settled: resolved.has(key) });
  }

  useEffect(() => {
    if (resolved.has(key)) return;

    let cancelled = false;
    void fetchIcon(key).then((glyph) => {
      if (!cancelled) setSeen({ key, glyph, settled: true });
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    Glyph: seen.glyph ?? fallback,
    known: seen.settled ? seen.glyph !== null : null,
  };
}

/**
 * Draw the icon some data names.
 *
 * The props are Phosphor's own, so this drops in wherever a directly-imported
 * glyph would. On the server, and on the first client render, this is the
 * fallback — the name has not been fetched yet and cannot be — so the two agree
 * and the real icon lands as an ordinary update rather than a hydration
 * mismatch.
 */
export function NamedIcon({
  name,
  size = 18,
  weight = "regular",
  className,
  fallback,
}: {
  name: string;
  size?: number;
  weight?: "regular" | "fill" | "bold";
  className?: string;
  /** Drawn when `name` is not an icon. A neutral glyph if left alone. */
  fallback?: Icon;
}) {
  const { Glyph } = useIcon(name, fallback);
  return <Glyph size={size} weight={weight} className={className} aria-hidden />;
}
