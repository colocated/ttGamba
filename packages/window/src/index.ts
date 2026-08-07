/**
 * The window, its chrome, and the pieces pages are built out of.
 *
 * `./next-config` and `./bootstrap` are deliberately *not* re-exported here.
 * Both are read by a server component or by the Next config file itself, and
 * this barrel pulls in `"use client"` modules — importing it from either would
 * hand the server a client reference instead of a string.
 */

// The window itself.
export { Tablet, ChromeButton, TitlebarLink, type TabletProps } from "./tablet";
export {
  useWindowFrame,
  type WindowCorner,
  type WindowFrameOptions,
  type WindowPhase,
  type WindowSettingsSource,
} from "./use-window-frame";
export {
  DEFAULT_WINDOW_SETTINGS,
  field,
  sanitiseWindowSettings,
  type WindowSettings,
} from "./window-settings";

// Navigation.
export { Shelf, type ShelfItem } from "./shelf";
export { Tabs, type Tab } from "./tabs";

// Things that cover the window.
export { Overlay, OverlayHost, CloseButton, useClose } from "./overlay";

// Page furniture.
export { Stage, Panel, Count } from "./layout";
export { Odometer } from "./odometer";
export { NamedIcon, useIcon, iconName } from "./icon";
export { InstallGuide } from "./install-guide";
export { UpdateBanner } from "./update-banner";
export { useUpdateAvailable } from "./version";
