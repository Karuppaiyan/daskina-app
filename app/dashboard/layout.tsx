import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Shell from "@/components/Shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login"); // deactivated or signed-out users
  return (
    <Shell name={session.user.name ?? "User"} role={session.user.role}>
      {children}
    </Shell>
  );
}
