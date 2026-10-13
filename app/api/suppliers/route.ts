import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { supplierSchema } from "@/lib/purchasing";

export async function GET() {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;
  const rows = await prisma.supplier.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { purchaseOrders: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const force = body?.force === true;
  const parsed = supplierSchema.safeParse(clean(body));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.gstin && !force) {
    const dup = await prisma.supplier.findFirst({
      where: { gstin: d.gstin, deletedAt: null }, select: { name: true },
    });
    if (dup)
      return NextResponse.json(
        { duplicate: true, error: `GSTIN already used by supplier "${dup.name}"` },
        { status: 409 }
      );
  }

  try {
    const row = await prisma.supplier.create({ data: d });
    await logAudit({
      tableName: "Supplier", recordId: row.id, action: "CREATE", newValue: row, userId: auth.user.id,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "A supplier with this name already exists" }, { status: 409 });
    throw e;
  }
}
