import { Stage } from "@/components/stage";
import { Tabs, type Tab } from "@tt/window";

/**
 * Settings, divided up.
 *
 * The front tab is what a player came for — their character, their chips, and
 * the two buttons that move chips across the boundary. Everything else earns a
 * tab of its own rather than another panel below it: a settings page is read by
 * scrolling, and anything under the fold is something the player has to know is
 * there before they will look.
 */
const TABS: Tab[] = [
  // `exact`, because `/settings` is a prefix of every other tab.
  { href: "/settings", label: "Account", exact: true },
  { href: "/settings/identifiers", label: "Identifiers" },
];

/**
 * A layout rather than a wrapper in each page, so the header and the tabs are
 * one thing every tab shares — and so switching tabs does not unmount them.
 *
 * This one stays a server component. Unlike the banker desk there is nothing to
 * guard here, and the tabs are a plain list of links: only `Tabs` itself needs
 * the browser, to know which of them is the current page.
 */
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <Stage title="Settings" blurb="Your character, your chips, and the account behind them.">
      <Tabs label="Settings" tabs={TABS} />
      {children}
    </Stage>
  );
}
