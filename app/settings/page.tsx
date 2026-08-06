import { Account } from "@/components/account";
import { Stage } from "@/components/stage";

export const metadata = { title: "Settings · ttGamba" };

export default function SettingsPage() {
  return (
    <Stage title="Settings" blurb="View your account settings below.">
      <Account />
    </Stage>
  );
}
