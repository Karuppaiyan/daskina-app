import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { makeResetToken } from "@/lib/password-reset";
import { sendMail } from "@/lib/mail";
import { limited } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({ email: z.string().email().max(200) });

// Same answer whether or not the email exists (no account enumeration)
const OK = { ok: true, message: "If this email is registered, a password reset link has been sent." };

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  if (limited(`ip:${ip}`, 10, 15 * 60 * 1000) || limited(`email:${email}`, 3, 60 * 60 * 1000))
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.isActive) {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const link = `${base}/reset-password?token=${makeResetToken(user)}`;
    const text =
      `Hello ${user.name},\n\nWe received a request to reset your Daksina ERP password.\n` +
      `Open this link within 1 hour to choose a new password:\n\n${link}\n\n` +
      `If you did not ask for this, ignore this email. Your password stays the same.`;
    const html =
      `<p>Hello ${user.name},</p><p>We received a request to reset your Daksina ERP password.</p>` +
      `<p><a href="${link}">Choose a new password</a> (valid for 1 hour)</p>` +
      `<p>If you did not ask for this, ignore this email. Your password stays the same.</p>`;
    try {
      await sendMail(user.email, "Reset your Daksina ERP password", text, html);
    } catch (e) {
      console.error("[forgot-password] mail failed:", e);
    }
    await logAudit({
      tableName: "User", recordId: user.id, action: "UPDATE",
      newValue: { event: "password_reset_requested" }, userId: user.id,
    });
  }
  return NextResponse.json(OK);
}
