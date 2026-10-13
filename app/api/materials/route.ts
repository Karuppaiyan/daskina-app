import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { materialSchema } from "@/lib/purchasing";

export async function GET() {
  const auth = await requireRole(
    "OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"
  );
  if ("error" in auth) return auth.error;
  const rows = await prisma.material.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: "asc" }, { spec: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = materialSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const row = await prisma.material.create({
      data: { name: d.name, spec: d.spec ?? "", unit: d.unit, minStock: d.minStock ?? 0 },
    });
    await logAudit({
      tableName: "Material", recordId: row.id, action: "CREATE", newValue: row, userId: auth.user.id,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "This material (name + specification) already exists" }, { status: 409 }
      );
    throw e;
  }
}
