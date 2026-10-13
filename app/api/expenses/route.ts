import { NextResponse } from "next/server";
import { ApprovalStatus, ExpenseCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { expenseSchema } from "@/lib/expense";
import { dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const READ = ["OWNER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR", "PURCHASE_MANAGER"] as const;

export async function GET(req: Request) {
  const auth = await requireRole(...READ);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const where: Prisma.ExpenseWhereInput = { deletedAt: null };
  const siteId = sp.get("siteId");
  const category = sp.get("category");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const D = /^\d{4}-\d{2}-\d{2}$/;

  if (siteId) where.siteId = siteId;
  if (category && category in ExpenseCategory) where.category = category as ExpenseCategory;
  if (status && status in ApprovalStatus) where.status = status as ApprovalStatus;
  if ((from && D.test(from)) || (to && D.test(to)))
    where.date = {
      ...(from && D.test(from) ? { gte: dateOnly(from) } : {}),
      ...(to && D.test(to) ? { lte: dateOnly(to) } : {}),
    };
  // Supervisors only see their own sites
  if (auth.user.role === "SITE_SUPERVISOR") where.site = { supervisorId: auth.user.id };

  const [rows, sums] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        site: { select: { id: true, name: true } },
        spentBy: { select: { empCode: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.expense.groupBy({ by: ["status"], where, _sum: { amount: true } }),
  ]);

  const totals: Record<string, number> = { APPROVED: 0, PENDING: 0, REJECTED: 0 };
  for (const s of sums) totals[s.status] = Number(s._sum.amount ?? 0);
  return NextResponse.json({ rows, totals });
}

export async function POST(req: Request) {
  const auth = await requireRole(...READ);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const force = body?.force === true;
  const parsed = expenseSchema.safeParse(clean(body));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.date > istDate(new Date()))
    return NextResponse.json({ error: "Cannot add an expense for a future date" }, { status: 400 });

  const denied = await checkSiteAccess(auth.user, d.siteId, d.date, true);
  if (denied) return denied;

  const site = await prisma.site.findFirst({ where: { id: d.siteId, deletedAt: null } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  if (d.spentById) {
    const e = await prisma.employee.findFirst({ where: { id: d.spentById, deletedAt: null } });
    if (!e) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Duplicate warning: same site + date + category + amount + person
  if (!force) {
    const dup = await prisma.expense.findFirst({
      where: {
        siteId: d.siteId, date: dateOnly(d.date), category: d.category,
        amount: d.amount, spentById: d.spentById ?? null, deletedAt: null,
      },
    });
    if (dup)
      return NextResponse.json(
        { duplicate: true, error: "An identical expense (site, date, category, amount) already exists" },
        { status: 409 }
      );
  }

  const auto = auth.user.role === "OWNER"; // owner entries need no approval
  const row = await prisma.expense.create({
    data: {
      siteId: d.siteId,
      date: dateOnly(d.date),
      category: d.category,
      description: d.description,
      amount: d.amount,
      spentById: d.spentById,
      paymentMethod: d.paymentMethod,
      receiptUrl: d.receiptUrl,
      status: auto ? "APPROVED" : "PENDING",
      approvedById: auto ? auth.user.id : null,
      createdById: auth.user.id,
    },
  });
  await logAudit({
    tableName: "Expense", recordId: row.id, action: "CREATE",
    newValue: row, userId: auth.user.id, siteId: d.siteId,
  });
  return NextResponse.json(row, { status: 201 });
}
