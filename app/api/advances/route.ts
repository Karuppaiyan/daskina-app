import { NextResponse } from "next/server";
import { z } from "zod";
import { AdvanceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { dateOnly, istDate } from "@/lib/attendance";

const schema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deductionMode: z.enum(["FULL", "PARTIAL", "INSTALLMENT"]).default("FULL"),
  installmentAmount: z.coerce.number().positive().optional(),
  reason: z.string().optional(),
});

const ROLES = ["OWNER", "ACCOUNTS", "HR", "PROJECT_MANAGER"] as const;

export async function GET(req: Request) {
  const auth = await requireRole(...ROLES);
  if ("error" in auth) return auth.error;
  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employeeId");
  const status = sp.get("status");

  const where: Prisma.AdvanceWhereInput = {};
  if (employeeId) where.employeeId = employeeId;
  if (status && status in AdvanceStatus) where.status = status as AdvanceStatus;

  const rows = await prisma.advance.findMany({
    where,
    include: { employee: { select: { empCode: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole(...ROLES);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const force = body?.force === true;
  const parsed = schema.safeParse(clean(body));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.deductionMode === "INSTALLMENT" && !d.installmentAmount)
    return NextResponse.json({ error: "installmentAmount required for INSTALLMENT mode" }, { status: 400 });

  const emp = await prisma.employee.findFirst({
    where: { id: d.employeeId, deletedAt: null, status: "ACTIVE" },
  });
  if (!emp) return NextResponse.json({ error: "Active employee not found" }, { status: 404 });

  const day = dateOnly(d.date ?? istDate(new Date()));

  if (!force) {
    const dup = await prisma.advance.findFirst({
      where: { employeeId: emp.id, date: day, amount: d.amount },
    });
    if (dup)
      return NextResponse.json(
        { duplicate: true, error: "Same advance (employee, date, amount) already exists" },
        { status: 409 }
      );
  }

  const row = await prisma.advance.create({
    data: {
      employeeId: emp.id,
      date: day,
      amount: d.amount,
      balance: d.amount,
      deductionMode: d.deductionMode,
      installmentAmount: d.installmentAmount,
      reason: d.reason,
    },
  });
  await logAudit({
    tableName: "Advance", recordId: row.id, action: "CREATE", newValue: row, userId: auth.user.id,
  });
  return NextResponse.json(row, { status: 201 });
}
