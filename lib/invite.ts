import { makeResetToken } from "@/lib/password-reset";
import { sendMail } from "@/lib/mail";

export const INVITE_TTL_MS = 72 * 3600 * 1000; // 3 days

export function resetLink(user: { id: string; passwordHash: string }, ttl = INVITE_TTL_MS) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/reset-password?token=${makeResetToken(user, ttl)}`;
}

// Email the link if SMTP is configured; the link is always returned so the owner can share it (e.g. WhatsApp)
export async function sendInvite(
  user: { id: string; name: string; email: string; passwordHash: string },
  kind: "new" | "reset"
) {
  const link = resetLink(user);
  const intro =
    kind === "new"
      ? "An account has been created for you on Daksina ERP."
      : "Your Daksina ERP password was reset by an administrator.";
  const text =
    `Hello ${user.name},\n\n${intro}\nSet your password using this link (valid for 3 days):\n\n${link}\n\n` +
    `If you were not expecting this, ignore this email.`;
  const html =
    `<p>Hello ${user.name},</p><p>${intro}</p>` +
    `<p><a href="${link}">Set your password</a> (valid for 3 days)</p>` +
    `<p>If you were not expecting this, ignore this email.</p>`;
  let emailed = false;
  try {
    const r = await sendMail(user.email, "Your Daksina ERP account", text, html);
    emailed = r.sent;
  } catch (e) {
    console.error("[invite] mail failed:", e);
  }
  return { link, emailed };
}
