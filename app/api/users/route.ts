import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { createUserSchema, safeUser } from "@/lib/users-admin";
import { sendInvite } from "@/lib/invite";

export async function GET() {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const rows = await prisma.user.findMany({
    include: {
      employee: { select: { empCode: true, name: true } },
      supervisedSites: { where: { deletedAt: null }, select: { id: true, name: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(rows.map((r) => safeUser(r)));
}

// Creates the user with an unusable random password and returns a set-password link (valid 3 days)
export async function POST(req: Request) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const parsed = createUserSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.employeeId) {
    const e = await prisma.employee.findFirst({ where: { id: d.employeeId, deletedAt: null } });
    if (!e) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: d.name,
        email: d.email.toLowerCase(),
        phone: d.phone,
        role: d.role,
        employeeId: d.employeeId,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
      },
    });
    await logAudit({
      tableName: "User", recordId: user.id, action: "CREATE",
      newValue: safeUser(user), userId: auth.user.id,
    });
    const invite = await sendInvite(user, "new");
    return NextResponse.json({ user: safeUser(user), ...invite }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const t = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
      return NextResponse.json(
        { error: t.includes("employeeId") ? "That employee is already linked to a user" : "A user with this email already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
}
