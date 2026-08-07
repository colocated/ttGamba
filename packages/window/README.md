# @tt/window

The floating window a user app draws itself inside, and the tokens that colour
it. Depends on `@tt/userapp`.

A user app is handed the **entire game viewport** and holds the player's input
focus while it is open. Neither of those is a detail — most of what looks
over-careful in here follows from one of them. See the workspace README's
"What must not change" before changing any of it.

## Wiring an app up

```ts
// next.config.ts
import { withUserApp } from "@tt/window/next-config";
export default withUserApp({ /* app's own config */ });
```

It finds the workspace root by walking up for `pnpm-workspace.yaml` rather than
taking a `__dirname`, because a `next.config.ts` in a package without
`"type": "module"` may load as either CJS or ESM and only one of `__dirname` /
`import.meta.dirname` exists in each.

```css
/* app/globals.css */
@import "tailwindcss";
@import "@tt/window/base.css";
@import "@tt/window/tokens.css";
@source "../../../packages/window/src";
```

**That `@source` line is required.** Tailwind does not scan `node_modules`, so
without it every class used inside this package is absent from the built
stylesheet and the window renders unstyled. It is a path to the real directory
rather than to the symlink pnpm puts in `node_modules`.

```tsx
// app/layout.tsx — a server component, which is why bootstrap has its own
// export path: the barrel is full of "use client" modules.
import Script from "next/script";
import { bootstrapScript } from "@tt/window/bootstrap";

<Script id="bootstrap" strategy="beforeInteractive">
  {bootstrapScript(SETTINGS_KEY)}
</Script>
```

`beforeInteractive` is what puts it in the head ahead of any Next.js module,
which is the whole point — it has to beat both the first paint and any chance of
the bundle failing.

## The three levels of override

**Tokens.** `tokens.css` is nothing but custom properties. Restate any of them
in the app's own `@theme` after the import.

**Slots.** `Tablet` takes `brand`, `appName`, `status`, `nav` and `onRefresh`.
No `nav` means no shelf and no pin control.

**The hook.** `useWindowFrame` is the whole of the behaviour with no markup:
geometry derived against the live viewport, pointer capture, the four-phase
minimise, and the keybind toggle. `Tablet` is a ~250-line skin over it. An app
that wants a different frame writes its own against the same hook.

## Layout

| Module | |
| --- | --- |
| `tablet.tsx` | The default skin. Titlebar, shelf slot, stage, overlay host, corner grips. |
| `use-window-frame.ts` | The behaviour, headless. |
| `window-settings.ts` | The window's half of an app's settings store — parts, not a store. |
| `bootstrap.ts` | The pre-React script. Remembered geometry, and Escape → `pin`. |
| `shelf.tsx` | The collapsing side nav. |
| `overlay.tsx` | Modals, portalled inside the frame so they cover the window and not the game. |
| `odometer.tsx` | A figure that rolls, up for a gain and down for a loss. |
| `tabs.tsx`, `layout.tsx` | Page furniture — `Stage`, `Panel`, `Count`, `Tabs`. |
| `icon.tsx` | An icon named by a string, fetched on demand. The one dynamic-import exception. |
| `version.ts`, `update-banner.tsx` | Noticing the server is serving a newer build, and saying so. |
| `next-config.ts` | `withUserApp` — the config every app needs. Node-only. |

## Two things that read as bugs and are not

**Nothing here reloads the document, ever.** No `location` writes, no
`router.push` to the same page to force a refresh. The window cannot guarantee
it comes back, and a page that fails to return leaves an invisible full-screen
surface over a game the player can no longer click. This is why `UpdateBanner`
asks the player to re-paste the URL rather than doing it.

**Reduced motion shortens animations to 1ms rather than removing them.** The
minimise is committed by the frame's `animationend`; an animation that never
runs never fires it, and the window would refuse to minimise at all.
