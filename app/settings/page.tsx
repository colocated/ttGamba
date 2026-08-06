import { Account } from "@/components/account";
import { Stage } from "@/components/stage";

export const metadata = { title: "Settings · ttGamba" };

export default function SettingsPage() {
  return (
    <Stage
      title="Settings"
      blurb="Your account, and where you ask a banker to move chips in or out."
    >
      <Account />
    </Stage>
  );
}
