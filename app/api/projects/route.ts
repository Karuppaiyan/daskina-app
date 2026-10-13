import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { projectSchema } from "@/lib/schemas";


const toDate = (s?: string | null) => (s ? new Date(s) : null);

export async function GET() {
  const auth = await requireRole(
    "OWNER", "PROJECT_MANAGER", "ACCOUNTS", "HR", "SITE_SUPERVISOR", "PURCHASE_MANAGER"
  );
  if ("error" in auth) return auth.error;

  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      _count: { select: { sites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = projectSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const row = await prisma.project.create({
      data: {
        code: d.code,
        name: d.name,
        customerId: d.customerId,
        poNumber: d.poNumber || null,
        contractValue: d.contractValue,
        startDate: toDate(d.startDate),
        expectedEndDate: toDate(d.expectedEndDate),
        scopeOfWork: d.scopeOfWork || null,
        status: d.status,
        progressPct: d.progressPct ?? 0,
        managerId: d.managerId || null,
      },
    });
    await logAudit({
      tableName: "Project",
      recordId: row.id,
      action: "CREATE",
      newValue: row,
      userId: auth.user.id,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Duplicate: project code or customer PO number already exists" },
        { status: 409 }
      );
    throw e;
  }
}
