import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { patchUserSchema, safeUser } from "@/lib/users-admin";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const parsed = patchUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const old = await prisma.user.findUnique({ where: { id: params.id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deactivating = d.isActive === false && old.isActive;
  const roleChange = d.role !== undefined && d.role !== old.role;

  if (old.id === auth.user.id && (deactivating || roleChange))
    return NextResponse.json({ error: "You cannot change your own role or deactivate yourself" }, { status: 409 });

  // always keep at least one active OWNER
  if (old.role === "OWNER" && old.isActive && (deactivating || (roleChange && d.role !== "OWNER"))) {
    const others = await prisma.user.count({
      where: { role: "OWNER", isActive: true, id: { not: old.id } },
    });
    if (others === 0)
      return NextResponse.json({ error: "Keep at least one active OWNER" }, { status: 409 });
  }

  if (d.employeeId) {
    const e = await prisma.employee.findFirst({ where: { id: d.employeeId, deletedAt: null } });
    if (!e) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: old.id }, data: d });
      // leaving the supervisor role frees their sites
      if (roleChange && old.role === "SITE_SUPERVISOR")
        await tx.site.updateMany({ where: { supervisorId: old.id }, data: { supervisorId: null } });
      return u;
    });
    await logAudit({
      tableName: "User", recordId: row.id, action: "UPDATE",
      oldValue: safeUser(old), newValue: safeUser(row), userId: auth.user.id,
    });
    return NextResponse.json(safeUser(row));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "That employee is already linked to a user" }, { status: 409 });
    throw e;
  }
}
