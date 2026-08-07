/**
 * The banker's desk, as a vocabulary.
 *
 * Deliberately holds data only — no Prisma client, no server functions, no
 * icon components — so the server layer and the client-side panel can both
 * import it. This is where the words live: what a status is called, which move
 * is legal from where, and what an audit action means. Anything that needs a
 * database goes in lib/banker.ts or lib/requests.ts; anything that needs the
 * DOM goes in components/banker/.
 *
 * The one rule the rest of the desk leans on: **every amount is a positive
 * number of whole chips, and direction is carried by the kind or the action.**
 * A signed amount would put the sign in two places at once — in the number and
 * in the word — and the two would eventually disagree.
 */

import type { Role, RequestKind, RequestStatus } from "./generated/prisma/enums";

export type { Role, RequestKind, RequestStatus };

// ── What the panel is handed ───────────────────────────────────────────────

/*
  Rows, as they cross from the server.

  Times are epoch milliseconds rather than `Date`. Both survive the trip, but a
  number cannot pick up a timezone or a locale on the way, and these figures
  are formatted twice — once on the server, once on the client — against a
  pinned locale for exactly that reason (lib/format.ts).
*/

/** One request, in a queue or open in the modal. */
export type RequestRow = {
  id: number;
  kind: RequestKind;
  status: RequestStatus;
  amount: number;
  vrpId: number;
  /** Who the player was when they asked — see prisma/schema.prisma. */
  playerName: string | null;
  discordId: string | null;
  steamId: string | null;
  factionName: string | null;
  factionTag: string | null;
  note: string | null;
  handledByVrpId: number | null;
  handledByName: string | null;
  handledAt: number | null;
  createdAt: number;
  updatedAt: number;
};

/** One line of the trail. `action` is a string because old rows outlive keys. */
export type AuditRow = {
  id: number;
  at: number;
  action: string;
  actorVrpId: number | null;
  actorName: string | null;
  actorRole: Role | null;
  subjectVrpId: number | null;
  subjectName: string | null;
  amount: number | null;
  balanceAfter: number | null;
  note: string | null;
  detail: string | null;
  requestId: number | null;
};

// ── Talking to the server ──────────────────────────────────────────────────

/**
 * Who says they are calling.
 *
 * Lives here, in the module both halves share, because the panel builds one
 * and the server checks it. The name rides along because the desk writes it
 * down — an audit row names the character that acted, captured then, not
 * whoever holds the account when the row is read back.
 *
 * It is the browser's word for both, and lib/auth.ts is the one place that
 * decides what to do about that.
 */
export type Caller = { vrpId: number; name?: string | null };

/**
 * Why a desk operation did not happen.
 *
 * Returned rather than thrown. A thrown error crossing a server function is
 * replaced with an opaque digest in production, which would leave the panel
 * unable to tell "you are not a banker any more" from "the database is down" —
 * and those want opposite responses from the interface. `message` is always
 * present and always safe to put on screen.
 */
export type Failure =
  | { ok: false; reason: "forbidden"; message: string }
  | { ok: false; reason: "unknown-player"; message: string }
  | { ok: false; reason: "gone"; message: string }
  | { ok: false; reason: "conflict"; message: string }
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "funds"; message: string }
  /** The call never landed — offline, or the server is mid-restart. */
  | { ok: false; reason: "unavailable"; message: string };

export type Outcome<T> = { ok: true; data: T } | Failure;

/**
 * A slice of a list that has no end.
 *
 * `more` rather than a total. Counting every audit row to render "1–25 of
 * 41,902" costs a full scan on every page, and the only question the button at
 * the bottom actually asks is whether to be there.
 */
export type Page<T> = { rows: T[]; more: boolean };

/** How much of a queue or a log arrives at a time. */
export const PAGE_SIZE = 30;

/**
 * The largest single request the desk will take. Not a policy about what a
 * banker should agree to — it is a sanity bound, so a typo or a tampered
 * payload cannot ask for a number that overflows the arithmetic behind it.
 *
 * ── Where the real ceiling is ─────────────────────────────────────────────
 * Chips are stored as `BigInt` and handled as `number`, and those have very
 * different limits. The database, being 64-bit, is not the constraint at any
 * figure this app will ever see. JavaScript is: every chip figure above
 * lib/rows.ts is an ordinary `number`, exact only up to `MAX_SAFE_INTEGER` —
 * about 9.007 *quadrillion*.
 *
 * A trillion a transaction leaves four orders of magnitude between the two,
 * which is what makes converting a `bigint` back to a `number` at the boundary
 * safe rather than merely usually-fine: it would take some nine thousand
 * maximum-sized deposits into one account to reach the point where a balance
 * stopped being exact. Raising this is a one-line change, and that ratio is
 * the thing to keep an eye on when doing it — past ~1e14 the argument gets
 * thin, and the app would want `bigint` end to end instead.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const AMOUNT_LIMIT = 1_000_000_000_000;

/**
 * The amounts worth one press in the request form.
 *
 * High rollers on this server bet in billions, and typing ten digits into a
 * field to cash out is both slow and the easiest possible place to add a zero
 * by accident. Round magnitudes only — these are a shortcut to a figure the
 * player already had in mind, not a suggestion about what to ask for.
 *
 * Here beside the limit rather than in the form, so that the two cannot drift
 * apart: every entry must be inside `AMOUNT_LIMIT`.
 */
export const QUICK_AMOUNTS: readonly { label: string; amount: number }[] = [
  { label: "1M", amount: 1_000_000 },
  { label: "10M", amount: 10_000_000 },
  { label: "100M", amount: 100_000_000 },
  { label: "1B", amount: 1_000_000_000 },
  { label: "5B", amount: 5_000_000_000 },
  { label: "10B", amount: 10_000_000_000 },
];

/** How long a note may be. Long enough to explain a denial, short enough to read. */
export const NOTE_LIMIT = 500;

// ── Tone ───────────────────────────────────────────────────────────────────

/** The palette a small label can paint itself in. Mapped to classes in components/stage.tsx. */
export type Tone = "neutral" | "good" | "settled" | "bad" | "muted";

// ── Roles ──────────────────────────────────────────────────────────────────

/** How a role reads to a person, who has never heard the word `superadmin`. */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Administrator",
  banker: "Banker",
  player: "Player",
};

/**
 * How a role reads at a glance.
 *
 * Staff are the exception, so staff are what carries colour: green for a
 * banker, who is the person chips are handed to, and red for an administrator,
 * who can move the ledger itself. A player is everyone, so it stays the plain
 * neutral tag. The tone names belong to the palette, not to the person — an
 * administrator is not "bad".
 */
export const ROLE_TONES: Record<Role, Tone> = {
  superadmin: "bad",
  banker: "good",
  player: "neutral",
};

// ── Kinds ──────────────────────────────────────────────────────────────────

/**
 * How a kind reads, and which way it moves a balance.
 *
 * `sign` is for display only — a `+` beside a figure — and never for
 * arithmetic. The two kinds settle at different moments and by different
 * routes (see lib/requests.ts), so a shared multiplier would be a shortcut
 * past the part that matters.
 */
export const KINDS: Record<RequestKind, { label: string; noun: string; sign: "+" | "−" }> = {
  deposit: { label: "Deposit", noun: "deposit", sign: "+" },
  withdrawal: { label: "Withdrawal", noun: "withdrawal", sign: "−" },
};

export const KIND_ORDER: readonly RequestKind[] = ["deposit", "withdrawal"];

// ── Statuses ───────────────────────────────────────────────────────────────

export const STATUSES: Record<
  RequestStatus,
  { label: string; tone: Tone; blurb: string; open: boolean }
> = {
  pending: {
    label: "Pending",
    tone: "neutral",
    blurb: "Waiting for a banker to pick it up.",
    open: true,
  },
  approved: {
    label: "Approved",
    tone: "good",
    blurb: "A banker has taken it on. Nothing has changed hands yet.",
    open: true,
  },
  closed: {
    label: "Actioned",
    tone: "settled",
    blurb: "Settled in game. Chips have moved.",
    open: false,
  },
  denied: {
    label: "Denied",
    tone: "bad",
    blurb: "Turned down. Nothing moved.",
    open: false,
  },
  cancelled: {
    label: "Cancelled",
    tone: "muted",
    blurb: "The player withdrew the request themselves.",
    open: false,
  },
};

/** Queue order: what a banker still has to deal with, oldest concern first. */
export const STATUS_ORDER: readonly RequestStatus[] = [
  "pending",
  "approved",
  "closed",
  "denied",
  "cancelled",
];

/**
 * Where a banker may take a request from here.
 *
 * `approved` can still fall back to `denied` because nothing has moved yet —
 * a banker who takes one on and then cannot find the player needs a way out
 * that is not settling a payment that never happened. Once `closed`, chips
 * have moved and there is no move back: correcting one is a new request in the
 * other direction, which is the only version of an undo that leaves a trail.
 */
export const STAFF_MOVES: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ["approved", "denied"],
  approved: ["closed", "denied"],
  closed: [],
  denied: [],
  cancelled: [],
};

/**
 * Where a *player* may take their own request. Only out of it, and only while
 * a banker has not committed to anything.
 */
export const PLAYER_MOVES: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ["cancelled"],
  approved: ["cancelled"],
  closed: [],
  denied: [],
  cancelled: [],
};

/** Chips are only actually held for a withdrawal while it could still happen. */
export function holdsChips(status: RequestStatus): boolean {
  return status === "pending" || status === "approved";
}

// ── Audit actions ──────────────────────────────────────────────────────────

/**
 * Where an action leaves the total number of chips in the world.
 *
 * `intake` and `exfill` are the desk's own figures: chips that came into
 * existence because someone handed a banker in-game cash, and chips that
 * stopped existing because a banker handed it back. Bets and payouts also move
 * the total, but they are the tables' business rather than the desk's, and
 * folding them in would bury a day's deposits under an evening of blackjack.
 */
export type Flow = "intake" | "exfill" | null;

/**
 * Everything the app is allowed to write down.
 *
 * A registry rather than a database enum: games are still being built and each
 * one arrives with events of its own, and a schema migration is too high a
 * price for adding a line to a log. The cost of that choice is that a row can
 * name an action this table has forgotten — `describeAction` is written to
 * cope, and the audit tab renders the raw key rather than nothing.
 *
 * Keys are `subject.pastTense`, so they sort into related groups and read as
 * sentences beside the name in front of them.
 */
export const AUDIT_ACTIONS = {
  "account.created": {
    label: "Account opened",
    blurb: "First time the player opened the app.",
    flow: null as Flow,
  },
  "role.changed": {
    label: "Role changed",
    blurb: "Someone was made — or unmade — a banker.",
    flow: null as Flow,
  },
  "balance.credited": {
    label: "Balance credited",
    blurb: "Chips added by hand, outside a request.",
    flow: "intake" as Flow,
  },
  "balance.debited": {
    label: "Balance debited",
    blurb: "Chips removed by hand, outside a request.",
    flow: "exfill" as Flow,
  },

  "deposit.requested": {
    label: "Deposit requested",
    blurb: "A player asked to buy chips.",
    flow: null as Flow,
  },
  "deposit.cancelled": {
    label: "Deposit cancelled",
    blurb: "The player took their own request back.",
    flow: null as Flow,
  },
  "deposit.approved": {
    label: "Deposit approved",
    blurb: "A banker took it on.",
    flow: null as Flow,
  },
  "deposit.denied": {
    label: "Deposit denied",
    blurb: "A banker turned it down.",
    flow: null as Flow,
  },
  "deposit.closed": {
    label: "Deposit actioned",
    blurb: "Cash taken in game, chips credited.",
    flow: "intake" as Flow,
  },

  "withdrawal.requested": {
    label: "Withdrawal requested",
    blurb: "A player asked to cash out. Chips held from this moment.",
    flow: null as Flow,
  },
  "withdrawal.cancelled": {
    label: "Withdrawal cancelled",
    blurb: "The player took it back; held chips returned.",
    flow: null as Flow,
  },
  "withdrawal.approved": {
    label: "Withdrawal approved",
    blurb: "A banker took it on.",
    flow: null as Flow,
  },
  "withdrawal.denied": {
    label: "Withdrawal denied",
    blurb: "A banker turned it down; held chips returned.",
    flow: null as Flow,
  },
  "withdrawal.closed": {
    label: "Withdrawal actioned",
    blurb: "Cash paid out in game, held chips consumed.",
    flow: "exfill" as Flow,
  },

  /*
    The tables. Nothing emits these yet — the games are not built — and they
    are registered anyway so that the first one to be wired up has a name to
    write down and the audit tab already knows how to render it.
  */
  "game.bet": {
    label: "Bet placed",
    blurb: "Chips staked on a round.",
    flow: null as Flow,
  },
  "game.payout": {
    label: "Bet won",
    blurb: "A round paid out.",
    flow: null as Flow,
  },
  "game.refund": {
    label: "Bet refunded",
    blurb: "A round was voided and the stake returned.",
    flow: null as Flow,
  },
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Every registered action, in the order the audit tab's filter lists them. */
export const AUDIT_ACTION_KEYS = Object.keys(AUDIT_ACTIONS) as AuditAction[];

/**
 * How an action reads. Falls back to the raw key, because a log that hides
 * rows it does not recognise is worse than useless — it is quietly wrong.
 */
export function describeAction(action: string): { label: string; known: boolean } {
  const known = AUDIT_ACTIONS[action as AuditAction];
  return known ? { label: known.label, known: true } : { label: action, known: false };
}

/** Which way an action moved the total, if it moved it at all. */
export function flowOf(action: string): Flow {
  return AUDIT_ACTIONS[action as AuditAction]?.flow ?? null;
}

/** Every action that counts towards one of the desk's 24-hour figures. */
export const FLOW_ACTIONS: Record<"intake" | "exfill", AuditAction[]> = {
  intake: AUDIT_ACTION_KEYS.filter((key) => AUDIT_ACTIONS[key].flow === "intake"),
  exfill: AUDIT_ACTION_KEYS.filter((key) => AUDIT_ACTIONS[key].flow === "exfill"),
};

/**
 * The audit key for a request reaching a status. `pending` has no key of its
 * own — a request arriving *is* `*.requested`.
 */
export function requestAction(kind: RequestKind, status: RequestStatus): AuditAction {
  const verb = status === "pending" ? "requested" : status;
  return `${kind}.${verb}` as AuditAction;
}
