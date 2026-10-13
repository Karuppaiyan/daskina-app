import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean, employeeSchema, p2002Target, stripPay } from "@/lib/employee";

type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const auth = await requireRole(
    "OWNER", "HR", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"
  );
  if ("error" in auth) return auth.error;

  const row = await prisma.employee.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      currentSite: { select: { id: true, name: true } },
      siteHistory: {
        include: { site: { select: { id: true, name: true } } },
        orderBy: { fromDate: "desc" },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stripPay(row, auth.user.role));
}

// Site changes go through /transfer so history stays correct
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "HR");
  if ("error" in auth) return auth.error;

  const parsed = employeeSchema
    .omit({ currentSiteId: true })
    .partial()
    .safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.employee.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { joiningDate, ...rest } = parsed.data;
  try {
    const row = await prisma.employee.update({
      where: { id: params.id },
      data: { ...rest, ...(joiningDate && { joiningDate: new Date(joiningDate) }) },
    });
    await logAudit({
      tableName: "Employee",
      recordId: row.id,
      action: "UPDATE",
      oldValue: old,
      newValue: row,
      userId: auth.user.id,
      siteId: row.currentSiteId ?? undefined,
    });
    return NextResponse.json(row);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      p2002Target(e).includes("faceId")
    )
      return NextResponse.json(
        { error: "This Face ID is already assigned to another employee" },
        { status: 409 }
      );
    throw e;
  }
}

// Soft delete only
export async function DELETE(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "HR");
  if ("error" in auth) return auth.error;

  const old = await prisma.employee.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.employee.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
  await logAudit({
    tableName: "Employee",
    recordId: row.id,
    action: "DELETE",
    oldValue: old,
    newValue: row,
    userId: auth.user.id,
    siteId: old.currentSiteId ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
