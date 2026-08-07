import { AdminShell } from "@/components/admin/shell";

/**
 * The tools' frame.
 *
 * A layout rather than a wrapper in each page, so the tabs and the access check
 * are one thing every tab shares — and so switching tabs does not unmount the
 * shell.
 *
 * The shell is a client component because the whole panel is: there is no
 * session to render a server component against, and nothing behind these tabs
 * happens on the server anyway (components/admin/shell.tsx).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
