"use client";

/**
 * The games, as something you can rearrange.
 *
 * ── This is the first thing in the admin panel that writes ────────────────
 * Everything else behind these tabs is a `postMessage` to the player's own game
 * client — a sound on their machine, text on their screen — which is why the
 * role check in components/admin/shell.tsx has been the whole of the gate. This
 * tab is not like that. It writes rows that every player in the casino then
 * reads, so it goes through a server function with `authorise` behind it
 * (lib/catalogue.ts), and the panel below is a form rather than a permission.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── One draft, one Save ───────────────────────────────────────────────────
 * The whole catalogue is held here as a draft and posted in one call. Not to
 * save code: the thing being edited is a *list*, and reordering it is a change
 * to every row at once. A panel that saved each row as it was touched would
 * have to decide what half a reorder means, and the person doing the reordering
 * would have to guess whether it had taken. This way the button is the honest
 * question — either the arrangement on screen is now the one in the database,
 * or nothing moved.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { GameControllerIcon } from "@phosphor-icons/react/dist/csr/GameController";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { NamedIcon, iconName, useIcon } from "@tt/window";

import { Button, Problem, Skeleton } from "@/components/banker/ui";
import { Panel, Tag } from "@/components/stage";
import {
  MAX_FLOOR,
  MAX_GAMES,
  MAX_SEATS,
  MAX_TIERS,
  MIN_SEATS,
  slugify,
  type GameDraft,
  type TierDraft,
} from "@/lib/casino";
import { getCatalogue, saveCatalogue, type CatalogueEntry } from "@/lib/catalogue";
import { AMOUNT_LIMIT } from "@/lib/desk";
import { ENGINE_IDS, engineFault } from "@/lib/engines";
import { formatMagnitude } from "@/lib/format";
import { refreshRail } from "@/lib/rail";
import { useDeskAction, useDeskCall } from "@/lib/staff";

/** A blank game, for the button at the bottom. */
const NEW_GAME: Omit<GameDraft, "tiers"> = {
  id: null,
  slug: "",
  name: "",
  blurb: "",
  icon: "PokerChip",
  engine: "",
  inRail: false,
};

/** A blank tier. Sensible middle-of-the-road stakes, meant to be edited. */
const NEW_TIER: TierDraft = {
  id: null,
  name: "New stakes",
  minBet: 100_000,
  maxBet: 10_000_000,
  seats: 5,
  floor: 1,
};

/**
 * A stable handle for a row in the draft.
 *
 * A saved game is its id; one that has only ever existed in this panel has
 * none, so it is identified by where it sits. That is good enough because the
 * only thing it is used for — React's key, and which drawers are open — is
 * thrown away by the save that gives it a real id.
 */
const keyOf = (game: GameDraft, index: number): string =>
  game.id === null ? `new-${index}` : `game-${game.id}`;

const asDraft = (entry: CatalogueEntry): GameDraft => ({
  id: entry.game.id,
  slug: entry.game.slug,
  name: entry.game.name,
  blurb: entry.game.blurb ?? "",
  icon: entry.game.icon,
  engine: entry.game.engine,
  inRail: entry.game.inRail,
  tiers: entry.tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    minBet: tier.minBet,
    maxBet: tier.maxBet,
    seats: tier.seats,
    floor: tier.floor,
  })),
});

export function GamesEditor() {
  const { data, failure, reload } = useDeskCall(getCatalogue);
  const { run, busy, failure: saveFailure } = useDeskAction();

  /**
   * The draft, and the answer it was taken from.
   *
   * Held together so the two cannot come apart: a fetch landing while somebody
   * is typing must not quietly replace what they have written, and the way to
   * be sure of that is to only adopt an answer this has not adopted before.
   * Same identity trick as `useAccumulated` (lib/staff.ts) — the query settles
   * to a fresh object per answer, so a re-render folds nothing in twice.
   */
  const [draft, setDraft] = useState<{ from: CatalogueEntry[] | null; games: GameDraft[] }>({
    from: null,
    games: [],
  });
  /** Which game's stakes are open. Ids, so a reorder does not move the drawer. */
  const [expanded, setExpanded] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  if (data !== null && draft.from !== data) {
    setDraft({ from: data, games: data.map(asDraft) });
  }

  // The confirmation clears itself. It is a full stop on an action that is
  // already visible in the list above it, not something to be dismissed.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  const games = draft.games;
  const dirty = data !== null && JSON.stringify(data.map(asDraft)) !== JSON.stringify(games);

  const update = (index: number, patch: Partial<GameDraft>) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      games: current.games.map((game, at) => (at === index ? { ...game, ...patch } : game)),
    }));
  };

  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= games.length) return;
    setSaved(false);
    setDraft((current) => {
      const next = [...current.games];
      [next[index], next[to]] = [next[to], next[index]];
      return { ...current, games: next };
    });
  };

  const remove = (index: number) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      games: current.games.filter((_, at) => at !== index),
    }));
  };

  const add = () => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      games: [...current.games, { ...NEW_GAME, tiers: [{ ...NEW_TIER }] }],
    }));
  };

  const save = () => {
    void run((caller) => saveCatalogue(caller, games)).then((result) => {
      if (!result) return;
      setDraft({ from: result, games: result.map(asDraft) });
      setSaved(true);
      // The person who just moved a game is the one most likely to look at the
      // shelf next, so it catches up now rather than on the next app load.
      refreshRail();
    });
  };

  // Every problem the panel can name before the server is asked. Shown as one
  // line above the button rather than beside each field, because the button is
  // where somebody finds out they cannot save yet.
  const problems = games.flatMap((game, index) => {
    const label = game.name.trim() === "" ? `Game ${index + 1}` : game.name.trim();
    const found: string[] = [];
    if (game.name.trim() === "") found.push(`${label} has no name.`);
    if (slugify(game.slug || game.name) === "") found.push(`${label} has no usable address.`);
    if (game.tiers.length === 0) found.push(`${label} has no table limits, so it cannot be played.`);
    for (const tier of game.tiers) {
      if (tier.minBet > tier.maxBet) {
        found.push(`${label}: ${tier.name} has a minimum above its maximum.`);
      }
    }
    return found;
  });

  const duplicate = (() => {
    const seen = new Set<string>();
    for (const game of games) {
      const slug = slugify(game.slug || game.name);
      if (slug !== "" && seen.has(slug)) return slug;
      seen.add(slug);
    }
    return null;
  })();

  if (data === null) {
    return failure ? <Problem failure={failure} onRetry={reload} /> : <Skeleton rows={3} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <EngineSuggestions />

      {failure ? <Problem failure={failure} onRetry={reload} /> : null}
      {saveFailure ? <Problem failure={saveFailure} /> : null}

      <Panel className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">What this changes</h2>
        <p className="text-sm text-ink-soft">
          The shelf every player sees, and the tables behind each game. Order here is order there.
          A game left out of the shelf keeps its tables and its history — it is simply not listed,
          which is how one is built or retired without deleting anything.
        </p>
      </Panel>

      <ul className="flex flex-col gap-3">
        {games.map((game, index) => (
          <li key={keyOf(game, index)}>
            <GameCard
              game={game}
              first={index === 0}
              last={index === games.length - 1}
              open={expanded.includes(keyOf(game, index))}
              onToggle={() =>
                setExpanded((current) => {
                  const key = keyOf(game, index);
                  return current.includes(key)
                    ? current.filter((held) => held !== key)
                    : [...current, key];
                })
              }
              onChange={(patch) => update(index, patch)}
              onMove={(by) => move(index, by)}
              onRemove={() => remove(index)}
            />
          </li>
        ))}
      </ul>

      {games.length < MAX_GAMES ? (
        <div>
          <Button onClick={add}>
            <span className="flex items-center gap-2">
              <PlusIcon size={14} weight="bold" aria-hidden />
              Add a game
            </span>
          </Button>
        </div>
      ) : null}

      <Panel className="flex flex-col gap-3">
        {problems.length > 0 || duplicate ? (
          <ul className="flex flex-col gap-1">
            {duplicate ? (
              <li className="text-sm text-loss">
                Two games share the address <span className="font-mono">{duplicate}</span>.
              </li>
            ) : null}
            {problems.map((problem) => (
              <li key={problem} className="text-sm text-loss">
                {problem}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            tone="go"
            onClick={save}
            disabled={busy || !dirty || problems.length > 0 || duplicate !== null}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>

          <span aria-live="polite" className="text-xs text-ink-muted">
            {saved
              ? "Saved. The shelf has caught up."
              : dirty
                ? "Unsaved changes."
                : "Nothing to save."}
          </span>
        </div>
      </Panel>
    </div>
  );
}

/** One game: the fields across the top, its stakes in a drawer underneath. */
function GameCard({
  game,
  first,
  last,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  game: GameDraft;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<GameDraft>) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const fault = engineFault(game.engine);
  const { known: iconKnown } = useIcon(game.icon, GameControllerIcon);
  const address = slugify(game.slug || game.name);

  const setTier = (index: number, patch: Partial<TierDraft>) => {
    onChange({
      tiers: game.tiers.map((tier, at) => (at === index ? { ...tier, ...patch } : tier)),
    });
  };

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 text-ink-soft">
          <NamedIcon name={game.icon} size={20} weight="fill" fallback={GameControllerIcon} />
        </span>

        <input
          value={game.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Game name"
          aria-label="Game name"
          className="min-w-0 flex-1 rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
        />

        {/*
          Reordering by button rather than by drag. It is the same two moves, it
          works from a keyboard, and it does not need a pointer gesture to be
          discovered — on a window a player is already dragging around the
          screen, one more draggable thing is one too many.
        */}
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
            <ArrowUpIcon size={14} weight="bold" aria-hidden />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
            <ArrowDownIcon size={14} weight="bold" aria-hidden />
          </IconButton>
          <IconButton label="Remove this game" onClick={onRemove} danger>
            <TrashIcon size={14} aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Phosphor icon"
          hint={
            iconKnown === false
              ? "Not an icon — the shelf will draw a game controller instead."
              : `Stored as ${iconName(game.icon) || "—"}. Any name from phosphoricons.com.`
          }
          bad={iconKnown === false}
        >
          <input
            value={game.icon}
            onChange={(event) => onChange({ icon: event.target.value })}
            placeholder="Spade"
            className="w-full rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
          />
        </Field>

        <Field
          label="Game engine"
          hint={fault ?? "This engine exists and will load."}
          bad={fault !== null}
        >
          <input
            value={game.engine}
            onChange={(event) => onChange({ engine: event.target.value })}
            placeholder={ENGINE_IDS[0]}
            list="ttgamba-engines"
            className="w-full rounded-control border border-edge bg-tone-1 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
          />
        </Field>

        <Field label="Address" hint={`Players reach it at /play/${address || "…"}`}>
          <input
            value={game.slug}
            onChange={(event) => onChange({ slug: event.target.value })}
            placeholder={slugify(game.name)}
            className="w-full rounded-control border border-edge bg-tone-1 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
          />
        </Field>

        <Field label="Blurb" hint="One line, under the name on the game's own page.">
          <input
            value={game.blurb}
            onChange={(event) => onChange({ blurb: event.target.value })}
            placeholder="Beat the dealer to 21 without going bust."
            className="w-full rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={game.inRail}
          onChange={(event) => onChange({ inRail: event.target.checked })}
          className="shrink-0 accent-felt"
        />
        Show in the shelf
      </label>

      <div className="border-t border-edge pt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="group flex w-full cursor-pointer items-center gap-2 text-left text-sm"
        >
          <span className="flex shrink-0 text-ink-muted transition-colors duration-120 ease-out group-hover:text-ink-soft">
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={`transition-transform duration-[var(--tt-drawer-time)] ease-out ${
                open ? "" : "-rotate-90"
              }`}
            />
          </span>
          <span className="font-medium">Table limits</span>
          <span className="ml-auto flex items-center gap-2">
            <Tag tone={game.tiers.length === 0 ? "bad" : "neutral"}>
              {game.tiers.length === 0
                ? "none"
                : `${game.tiers.length} ${game.tiers.length === 1 ? "set" : "sets"}`}
            </Tag>
          </span>
        </button>

        {/* The same 0fr → 1fr drawer the settings page uses — see Drawer in
            components/settings/fields.tsx for why a grid rather than a height. */}
        <div
          inert={!open}
          className={`grid transition-[grid-template-rows] duration-[var(--tt-drawer-time)] ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-3 pt-3">
              <p className="text-sm text-ink-soft">
                Each set of limits is a class of table. Players are shown the tables of each class
                and sit at one; when they are all full another opens, and it is taken away again
                when it empties.
              </p>

              {game.tiers.map((tier, index) => (
                <TierFields
                  key={tier.id ?? `new-${index}`}
                  tier={tier}
                  onChange={(patch) => setTier(index, patch)}
                  onRemove={() =>
                    onChange({ tiers: game.tiers.filter((_, at) => at !== index) })
                  }
                />
              ))}

              {game.tiers.length < MAX_TIERS ? (
                <div>
                  <Button onClick={() => onChange({ tiers: [...game.tiers, { ...NEW_TIER }] })}>
                    <span className="flex items-center gap-2">
                      <PlusIcon size={14} weight="bold" aria-hidden />
                      Add limits
                    </span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TierFields({
  tier,
  onChange,
  onRemove,
}: {
  tier: TierDraft;
  onChange: (patch: Partial<TierDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-edge bg-tone-1 p-3">
      <div className="flex items-center gap-2">
        <input
          value={tier.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="High Roller"
          aria-label="What these stakes are called"
          className="min-w-0 flex-1 rounded-control border border-edge bg-tone-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
        />
        <IconButton label="Remove these limits" onClick={onRemove} danger>
          <TrashIcon size={14} aria-hidden />
        </IconButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Chips
          label="Smallest bet"
          value={tier.minBet}
          onChange={(minBet) => onChange({ minBet })}
          bad={tier.minBet > tier.maxBet}
        />
        <Chips
          label="Largest bet"
          value={tier.maxBet}
          onChange={(maxBet) => onChange({ maxBet })}
          bad={tier.minBet > tier.maxBet}
        />
        <Count
          label="Seats a table"
          hint="The engine caps this at what it can deal to."
          value={tier.seats}
          min={MIN_SEATS}
          max={MAX_SEATS}
          onChange={(seats) => onChange({ seats })}
        />
        <Count
          label="Tables kept open"
          hint="Zero opens one when somebody asks, and closes it after."
          value={tier.floor}
          min={0}
          max={MAX_FLOOR}
          onChange={(floor) => onChange({ floor })}
        />
      </div>
    </div>
  );
}

/**
 * A chip figure, read back in words underneath.
 *
 * Thirteen digits is past the point where anyone can count zeros at a glance,
 * and a table limit is exactly where one zero too many does damage — so the
 * same magnitude readout the player's own request form uses is here too
 * (lib/format.ts).
 */
function Chips({
  label,
  value,
  onChange,
  bad,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  bad?: boolean;
}) {
  /*
    What is in the box, and the figure it was last agreed with.

    The field cannot simply render `String(value)`: clearing it to type a new
    number would parse as nothing, the draft would keep the old figure, and the
    box would refill itself under the cursor. So the text is held here — and
    adopted from the draft only when the draft moved for a reason that was not
    this box, which is what `from` records. Adjusted during render rather than
    in an effect, like the odometer and `useAccumulated` before it.
  */
  const [entry, setEntry] = useState({ from: value, text: String(value) });
  if (entry.from !== value) setEntry({ from: value, text: String(value) });

  return (
    <Field
      label={label}
      hint={value > 0 ? formatMagnitude(value) : "Must be at least one chip."}
      bad={bad}
    >
      <input
        value={entry.text}
        inputMode="numeric"
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9]/g, "");
          const parsed = Number(next);
          const usable = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= AMOUNT_LIMIT;
          setEntry({ from: usable ? parsed : entry.from, text: next });
          if (usable) onChange(parsed);
        }}
        className="w-full rounded-control border border-edge bg-tone-2 px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none focus:border-edge-strong"
      />
    </Field>
  );
}

/** A small whole number, with the arrows the browser gives a number input. */
function Count({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (!Number.isSafeInteger(parsed)) return;
          onChange(Math.min(max, Math.max(min, parsed)));
        }}
        className="w-full rounded-control border border-edge bg-tone-2 px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none focus:border-edge-strong"
      />
    </Field>
  );
}

/** A field with its name above it and its caveat — or its complaint — below. */
function Field({
  label,
  hint,
  bad,
  children,
}: {
  label: string;
  hint: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
      <span className={`text-xs ${bad ? "text-loss" : "text-ink-muted"}`}>{hint}</span>
    </label>
  );
}

/** A square icon-only control. Squared off, like everything else (DESIGN.md). */
function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded-control border p-2 transition-colors duration-120 ease-out ${
        disabled
          ? "cursor-not-allowed border-edge bg-tone-2 text-ink-muted/50"
          : danger
            ? "cursor-pointer border-loss/50 bg-loss/10 text-loss hover:bg-loss/20"
            : "cursor-pointer border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
      }`}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/**
 * The engine names, offered as suggestions to the free-text fields.
 *
 * A `datalist` rather than a `select`, and it is the same argument lib/engines.ts
 * makes: an administrator must be able to type the name of an engine that is
 * still being written, so this is help rather than a constraint. One of them for
 * the whole panel, since every engine field points at the same id.
 */
function EngineSuggestions() {
  return (
    <datalist id="ttgamba-engines">
      {ENGINE_IDS.map((id) => (
        <option key={id} value={id} />
      ))}
    </datalist>
  );
}
