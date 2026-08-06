import { Queue } from "@/components/banker/queue";

export const metadata = { title: "Deposits · ttGamba" };

export default function DepositsPage() {
  return <Queue kind="deposit" />;
}
