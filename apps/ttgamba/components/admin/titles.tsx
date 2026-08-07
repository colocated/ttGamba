"use client";

/**
 * The four ways to put text on a player's screen, side by side.
 *
 * `info`, `popup`, `oneliner` and `message` are all "some words appear" from the
 * outside, and the difference between them — where they land, how long they
 * stay, whether they have a box around them — is not written down anywhere you
 * can read while you are writing the call. It is something you find out by
 * sending one. This is the place to send one.
 *
 * ── The preview is the payload ────────────────────────────────────────────
 * The action shown on screen is the same object the button sends: one value,
 * built from the fields, rendered as JSON and handed to `sendAction`. A preview
 * assembled separately would be a second implementation of the same thing, and
 * would eventually describe a message the app does not actually send — which is
 * the one failure a tester cannot survive.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneRight";

import { Panel } from "@/components/stage";
import { Button } from "@/components/banker/ui";
import { closeApp, sendAction, type UserAppAction } from "@tt/userapp";

type Command = "info" | "popup" | "oneliner" | "message";

/**
 * What each one does, and which fields it takes.
 *
 * The blurbs are the app's own reading of them (lib/userapp.ts), which is what
 * you are here to check — if one of these turns out to be wrong, this file and
 * that one both want correcting.
 */
const COMMANDS: Record<
  Command,
  { label: string; blurb: string; title: boolean; seconds: boolean }
> = {
  info: {
    label: "Info",
    blurb: "Lingering message in the bottom-right corner. The only one you choose a duration for.",
    title: false,
    seconds: true,
  },
  popup: {
    label: "Popup",
    blurb: "Full-screen title and body. The only one with a heading of its own.",
    title: true,
    seconds: false,
  },
  oneliner: {
    label: "One-liner",
    blurb: "Black box in the middle of the screen.",
    title: false,
    seconds: false,
  },
  message: {
    label: "Message",
    blurb: "Mid-screen text with no box behind it.",
    title: false,
    seconds: false,
  },
};

const ORDER: readonly Command[] = ["info", "popup", "oneliner", "message"];

/** Sensible for a thing you are watching land, and inside anything the client would balk at. */
const DEFAULT_SECONDS = 5;
const MAX_SECONDS = 120;

/**
 * When a send happened, to the second. Pinned locale, like everything else the
 * app prints (lib/format.ts) — and with seconds, because two sends a moment
 * apart otherwise carry the same stamp and the confirmation stops confirming.
 */
const SENT_AT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function TitleTester() {
  const [command, setCommand] = useState<Command>("info");
  /*
    One set of fields across all four commands, rather than one per command.
    The whole point of the tab is to send the same words four ways and see which
    of them looks right, and state that resets on every switch turns that into
    retyping the sentence four times.
  */
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(String(DEFAULT_SECONDS));
  /** Hand the screen back on send, so the message is not behind this window. */
  const [hide, setHide] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const spec = COMMANDS[command];
  const time = Number(seconds);
  const timeOk = Number.isFinite(time) && time > 0 && time <= MAX_SECONDS;

  const action = build(command, { title, text, seconds: time });
  const ready = text.trim() !== "" && (!spec.seconds || timeOk);

  const send = () => {
    if (!ready) return;
    sendAction(action);
    setSentAt(Date.now());
    // After the send, never before: closing the app is the last thing that
    // should happen, and doing it first would race the message it is meant to
    // let you watch.
    if (hide) closeApp();
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Command</h2>

        <div className="flex flex-wrap gap-2">
          {ORDER.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setCommand(name)}
              aria-pressed={command === name}
              className={`cursor-pointer rounded-control border px-3 py-2 text-sm transition-colors duration-120 ease-out ${
                command === name
                  ? "border-edge-strong bg-tone-3 font-medium text-ink"
                  : "border-edge bg-tone-2 text-ink-soft hover:bg-raised-hover hover:text-ink"
              }`}
            >
              {COMMANDS[name].label}
            </button>
          ))}
        </div>

        <p className="text-sm text-ink-soft">{spec.blurb}</p>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Content</h2>

        {/*
          Only `popup` has one, and the field goes rather than greying out: a
          disabled input beside a live one is a thing to wonder about on every
          other command, for the sake of one.
        */}
        {spec.title ? (
          <Labelled label="Title" hint="The heading, above the body.">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ttGamba"
              className="w-full rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
            />
          </Labelled>
        ) : null}

        <Labelled
          label="Text"
          hint="Whatever the command puts on screen. Sent exactly as typed — nothing here escapes or trims it."
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            placeholder="The house always wins."
            className="w-full resize-y rounded-control border border-edge bg-tone-1 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-edge-strong"
          />
        </Labelled>

        {spec.seconds ? (
          <Labelled label="Seconds" hint={`How long it stays. Up to ${MAX_SECONDS}.`}>
            <div className="flex items-center gap-2">
              <input
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                inputMode="numeric"
                aria-invalid={!timeOk}
                className="w-24 rounded-control border border-edge bg-tone-1 px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none focus:border-edge-strong"
              />
              {!timeOk ? (
                <span className="text-xs text-loss">
                  A number of seconds between 1 and {MAX_SECONDS}.
                </span>
              ) : null}
            </div>
          </Labelled>
        ) : null}
      </Panel>

      <Panel className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Send</h2>

        {/*
          Worth saying rather than leaving to be discovered: three of these four
          land in the middle of the screen, which is where this window is. The
          message fires either way — it is just behind you.
        */}
        <p className="text-sm text-ink-soft">
          The game draws these behind the app. A popup, one-liner or message lands where this
          window already is, so unless you hand the screen back you will only see the edges of
          it.
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={hide}
            onChange={(event) => setHide(event.target.checked)}
            className="mt-0.5 shrink-0 accent-felt"
          />
          <span>
            Hide the app after sending, so you can watch it land. Re-open with the usual user app
            key.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <Button onClick={send} tone="go" disabled={!ready}>
            <span className="flex items-center gap-2">
              <PaperPlaneRightIcon size={14} weight="fill" aria-hidden />
              Send {spec.label.toLowerCase()}
            </span>
          </Button>

          {/*
            Nothing on this screen changes when a message is sent — the whole
            effect is elsewhere — so a send that reached a client that ignored
            it and a button that did nothing are the same picture without this.
          */}
          <span aria-live="polite" className="text-xs text-ink-muted">
            {sentAt === null
              ? "Nothing sent yet."
              : `Sent at ${SENT_AT.format(sentAt)}.`}
          </span>
        </div>
      </Panel>

      <Panel className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">What gets posted</h2>
          <span className="text-xs text-ink-muted">The exact action, ready to paste</span>
        </div>
        <pre className="overflow-x-auto rounded-control border border-edge bg-tone-1 px-3 py-2 font-mono text-xs text-ink-soft">
          {JSON.stringify(action, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}

/**
 * The action a set of fields means.
 *
 * Total over the four commands rather than a lookup with holes in it, so adding
 * a fifth is a compile error here rather than a silent no-op at the button.
 */
function build(
  command: Command,
  fields: { title: string; text: string; seconds: number },
): UserAppAction {
  switch (command) {
    case "info":
      // The client's own field name. `time`, and in seconds — see lib/userapp.ts.
      return { type: "info", text: fields.text, time: fields.seconds };
    case "popup":
      return { type: "popup", title: fields.title, text: fields.text };
    case "oneliner":
      return { type: "oneliner", text: fields.text };
    case "message":
      return { type: "message", text: fields.text };
  }
}

/** A field with its name above it and its caveat below. */
function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
      <span className="text-xs text-ink-muted">{hint}</span>
    </label>
  );
}
