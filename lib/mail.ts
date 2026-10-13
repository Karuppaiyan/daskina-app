// SMTP mail. If SMTP_HOST is not set (local dev), the message is printed in the terminal instead.
import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log("\n──────── MAIL (SMTP not configured, printed here) ────────");
    console.log("To:     " + to);
    console.log("Subject:" + " " + subject);
    console.log(text);
    console.log("───────────────────────────────────────────────────────────\n");
    return { sent: false };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Daksina ERP <no-reply@daksina.com>",
    to, subject, text, html,
  });
  return { sent: true };
}
