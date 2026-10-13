import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { passwordSchema, peekResetToken, verifyResetToken } from "@/lib/password-reset";
import { limited } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({ token: z.string().min(20).max(1000), password: passwordSchema });
const BAD = { error: "This reset link is invalid or has expired. Request a new one." };

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (limited(`reset:${ip}`, 10, 15 * 60 * 1000))
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const uid = peekResetToken(token);
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user || !user.isActive || !verifyResetToken(token, user))
    return NextResponse.json(BAD, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await logAudit({
    tableName: "User", recordId: user.id, action: "UPDATE",
    newValue: { event: "password_reset_completed" }, userId: user.id,
  });
  return NextResponse.json({ ok: true });
}
