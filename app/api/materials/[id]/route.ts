import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { materialSchema } from "@/lib/purchasing";

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = materialSchema.partial().safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.material.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const row = await prisma.material.update({ where: { id: old.id }, data: parsed.data });
    await logAudit({
      tableName: "Material", recordId: row.id, action: "UPDATE", oldValue: old, newValue: row, userId: auth.user.id,
    });
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "This material (name + specification) already exists" }, { status: 409 }
      );
    throw e;
  }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;
  const old = await prisma.material.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await prisma.material.update({ where: { id: old.id }, data: { deletedAt: new Date() } });
  await logAudit({
    tableName: "Material", recordId: row.id, action: "DELETE", oldValue: old, newValue: row, userId: auth.user.id,
  });
  return NextResponse.json({ ok: true });
}
