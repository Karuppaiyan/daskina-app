import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/password-reset";
import { limited } from "@/lib/rate-limit";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

// Any signed-in user changes their own password
export async function POST(req: Request) {
  const auth = await requireRole();
  if ("error" in auth) return auth.error;

  if (limited(`pw:${auth.user.id}`, 5, 15 * 60 * 1000))
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  if (currentPassword === newPassword)
    return NextResponse.json({ error: "New password must be different" }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  await logAudit({
    tableName: "User", recordId: user.id, action: "UPDATE",
    newValue: { event: "password_changed" }, userId: user.id,
  });
  return NextResponse.json({ ok: true });
}
