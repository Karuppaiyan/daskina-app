import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { siteSchema } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = siteSchema.partial().safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.site.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  const row = await prisma.site.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.projectId !== undefined && { projectId: d.projectId || null }),
      ...(d.location !== undefined && { location: d.location || null }),
      ...(d.supervisorId !== undefined && { supervisorId: d.supervisorId || null }),
      ...(d.isWorkshop !== undefined && { isWorkshop: d.isWorkshop }),
      ...(d.isActive !== undefined && { isActive: d.isActive }),
    },
  });
  await logAudit({
    tableName: "Site",
    recordId: row.id,
    action: "UPDATE",
    oldValue: old,
    newValue: row,
    userId: auth.user.id,
    siteId: row.id,
  });
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const old = await prisma.site.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.site.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  });
  await logAudit({
    tableName: "Site",
    recordId: row.id,
    action: "DELETE",
    oldValue: old,
    newValue: row,
    userId: auth.user.id,
    siteId: row.id,
  });
  return NextResponse.json({ ok: true });
}
