import { BankerShell } from "@/components/banker/shell";

/**
 * The desk's frame.
 *
 * A layout rather than a wrapper in each page, so the tabs and the access
 * check are one thing that every tab shares — and so switching tabs does not
 * unmount the shell, which is what keeps the queue badges from flickering on
 * every navigation.
 *
 * The shell is a client component because the whole panel is: there is no
 * session to render a server component against. Every page reads the player
 * out of the game client, in the browser, and hands that to the server
 * functions behind it (lib/staff.ts).
 */
export default function BankerLayout({ children }: LayoutProps<"/banker">) {
  return <BankerShell>{children}</BankerShell>;
}
