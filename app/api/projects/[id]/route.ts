import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { projectSchema } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const auth = await requireRole(
    "OWNER", "PROJECT_MANAGER", "ACCOUNTS", "HR", "SITE_SUPERVISOR", "PURCHASE_MANAGER"
  );
  if ("error" in auth) return auth.error;

  const row = await prisma.project.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { customer: true, manager: { select: { id: true, name: true } }, sites: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = projectSchema.partial().safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.project.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  const data: Prisma.ProjectUncheckedUpdateInput = {};
  if (d.code !== undefined) data.code = d.code;
  if (d.name !== undefined) data.name = d.name;
  if (d.customerId !== undefined) data.customerId = d.customerId;
  if (d.poNumber !== undefined) data.poNumber = d.poNumber || null;
  if (d.contractValue !== undefined) data.contractValue = d.contractValue;
  if (d.startDate !== undefined) data.startDate = d.startDate ? new Date(d.startDate) : null;
  if (d.expectedEndDate !== undefined)
    data.expectedEndDate = d.expectedEndDate ? new Date(d.expectedEndDate) : null;
  if (d.scopeOfWork !== undefined) data.scopeOfWork = d.scopeOfWork || null;
  if (d.status !== undefined) data.status = d.status;
  if (d.progressPct !== undefined) data.progressPct = d.progressPct;
  if (d.managerId !== undefined) data.managerId = d.managerId || null;

  try {
    const row = await prisma.project.update({ where: { id: params.id }, data });
    await logAudit({
      tableName: "Project",
      recordId: row.id,
      action: "UPDATE",
      oldValue: old,
      newValue: row,
      userId: auth.user.id,
    });
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Duplicate: project code or customer PO number already exists" },
        { status: 409 }
      );
    throw e;
  }
}

// Soft delete only
export async function DELETE(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const old = await prisma.project.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.project.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  await logAudit({
    tableName: "Project",
    recordId: row.id,
    action: "DELETE",
    oldValue: old,
    newValue: row,
    userId: auth.user.id,
  });
  return NextResponse.json({ ok: true });
}
