import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { sendInvite } from "@/lib/invite";

// Owner generates a fresh set-password link for a user (valid 3 days)
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!user.isActive)
    return NextResponse.json({ error: "User is deactivated. Activate first." }, { status: 409 });

  const invite = await sendInvite(user, "reset");
  await logAudit({
    tableName: "User", recordId: user.id, action: "UPDATE",
    newValue: { event: "admin_reset_link_issued" }, userId: auth.user.id,
  });
  return NextResponse.json({ name: user.name, ...invite });
}
