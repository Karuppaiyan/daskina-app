// Single place that decides "who is the current user".
// DEV_AUTO_LOGIN=true (development only) signs you in as the first active OWNER, no login screen.
// It is ignored when NODE_ENV is "production".
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const AUTH_OFF =
  process.env.DEV_AUTO_LOGIN === "true" && process.env.NODE_ENV !== "production";

export async function getSession(): Promise<Session | null> {
  if (!AUTH_OFF) {
    const s = await getServerSession(authOptions);
    if (!s) return null;
    // Role changes and deactivation take effect immediately (not after the 8 h token expires)
    const u = await prisma.user.findUnique({
      where: { id: s.user.id },
      select: { isActive: true, role: true, name: true },
    });
    if (!u || !u.isActive) return null;
    return { ...s, user: { ...s.user, role: u.role, name: u.name } };
  }

  // Real DB user, because tables have foreign keys to User (expenses, DPR, audit log...)
  let u = await prisma.user.findFirst({
    where: { role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!u) {
    u = await prisma.user.create({
      data: {
        name: "Owner",
        email: "owner@daksina.local",
        passwordHash: await bcrypt.hash("Admin@123", 10),
        role: "OWNER",
      },
    });
  }
  return {
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
    expires: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };
}
