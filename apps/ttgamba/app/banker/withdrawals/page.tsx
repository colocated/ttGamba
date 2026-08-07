import { Queue } from "@/components/banker/queue";

export const metadata = { title: "Withdrawals · ttGamba" };

export default function WithdrawalsPage() {
  return <Queue kind="withdrawal" />;
}
