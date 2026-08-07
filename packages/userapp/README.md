# @tt/userapp

The Transport Tycoon user app bridge. No React components, no CSS — a server
route or a headless script can depend on this.

```ts
import { notify, playSfx, sendCommand } from "@tt/userapp";
import { usePlayer, useTrigger } from "@tt/userapp/gamedata";
import { DOCUMENTED_KEYS, describeKey } from "@tt/userapp/gamekeys";
import { createSettingsStore } from "@tt/userapp/settings";
```

| Module | What it is |
| --- | --- |
| `.` | The outbound action list and the inbound listener. A transcription of the command table in the docs. |
| `./gamedata` | The client's key/value stream, accumulated into a cache and read as a typed `Player`. |
| `./gamekeys` | What each documented key means. Reference text for a panel, not something an app runs on. |
| `./settings` | `createSettingsStore` — dual-store persistence over the client cache and `localStorage`. |

Everything here is a transcription of <https://ttycoon.eu/userapps/docs>
(readme.md, updated April 16th 2025). Two things follow from that:

**Nothing here invents anything the client does not send.** Every field on
`Player` is nullable and stays that way — the page can be opened in an ordinary
browser tab, and there is no arrangement of loading states that makes a name
appear in that case.

**The docs call their key list incomplete.** Treat a missing entry in
`gamekeys` as a gap in the table, not as a key that cannot arrive.

The site refuses requests without a browser `User-Agent`, so `curl` needs one
spoofed to read it.
