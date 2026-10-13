import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Shell from "@/components/Shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <Shell name={session?.user.name ?? "User"} role={session?.user.role ?? ""}>
      {children}
    </Shell>
  );
}
