import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { computePay, r2, splitAmount } from "@/lib/payroll";
import { dateOnly, istDate } from "@/lib/attendance";

const ROLES = ["OWNER", "ACCOUNTS", "HR"] as const;
const DAY = 86400000;

const q = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
});

export async function GET(req: Request) {
  const auth = await requireRole(...ROLES);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const p = q.safeParse({ month: sp.get("month"), year: sp.get("year") });
  if (!p.success) return NextResponse.json({ error: "month and year required" }, { status: 400 });
  const { month, year } = p.data;

  const rows = await prisma.payroll.findMany({
    where: { month, year },
    include: { employee: { select: { empCode: true, name: true, wageType: true } } },
    orderBy: { employee: { empCode: "asc" } },
  });

  // Project/site-wise labour cost (gross)
  const grouped = await prisma.payrollSiteAllocation.groupBy({
    by: ["siteId"],
    where: { payroll: { month, year } },
    _sum: { amount: true, days: true, hours: true },
  });
  const sites = await prisma.site.findMany({
    where: { id: { in: grouped.map((g) => g.siteId) } },
    select: { id: true, name: true, project: { select: { code: true } } },
  });
  const siteCost = grouped.map((g) => {
    const s = sites.find((x) => x.id === g.siteId);
    return {
      siteId: g.siteId,
      site: s?.name ?? "?",
      project: s?.project?.code ?? null,
      amount: g._sum.amount,
      days: g._sum.days,
      hours: g._sum.hours,
    };
  });

  return NextResponse.json({ rows, siteCost });
}

const postSchema = q.extend({
  action: z.enum(["generate", "approve", "pay"]),
  paymentMethod: z.enum(["CASH", "BANK", "UPI", "CARD", "CHEQUE"]).optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(...ROLES);
  if ("error" in auth) return auth.error;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { month, year, action, paymentMethod } = parsed.data;

  if (action !== "generate" && auth.user.role === "HR")
    return NextResponse.json({ error: "Only OWNER or ACCOUNTS can approve or pay" }, { status: 403 });

  if (action === "generate") return generate(month, year, auth.user.id);
  if (action === "approve") return approve(month, year, auth.user.id);
  return pay(month, year, paymentMethod ?? "BANK", auth.user.id);
}

// ---------- generate (drafts only; approved/paid rows are locked) ----------
async function generate(month: number, year: number, userId: string) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = dateOnly(istDate(new Date()));
  const lastDay = new Date(Math.min(end.getTime() - DAY, today.getTime()));

  const emps = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: "ACTIVE" }, { attendance: { some: { date: { gte: start, lt: end } } } }],
    },
  });
  const ids = emps.map((e) => e.id);

  const [existing, att, advs] = await Promise.all([
    prisma.payroll.findMany({ where: { month, year, employeeId: { in: ids } } }),
    prisma.attendance.findMany({ where: { date: { gte: start, lt: end }, employeeId: { in: ids } } }),
    prisma.advance.findMany({
      where: { employeeId: { in: ids }, approvalStatus: "APPROVED", status: "OPEN", balance: { gt: 0 } },
    }),
  ]);
  const exMap = new Map(existing.map((p) => [p.employeeId, p]));

  let generated = 0;
  let skippedLocked = 0;
  const noRecords: { empCode: string; name: string; days: number }[] = [];

  for (const e of emps) {
    const ex = exMap.get(e.id);
    if (ex && ex.status !== "DRAFT") { skippedLocked++; continue; }
    if (e.joiningDate && e.joiningDate >= end) continue;

    const eligStart = e.joiningDate && e.joiningDate > start ? e.joiningDate : start;
    const eligibleDays = daysInMonth - (eligStart.getUTCDate() - 1);
    const days = att.filter((a) => a.employeeId === e.id);

    const c = computePay(
      { wageType: e.wageType, wageRate: Number(e.wageRate), otRate: Number(e.otRate) },
      days.map((a) => ({
        status: a.status, siteId: a.siteId,
        workedHours: Number(a.workedHours), otHours: Number(a.otHours),
      })),
      daysInMonth,
      eligibleDays
    );

    // Info only: days with no attendance record so far
    const span = Math.max(0, Math.round((lastDay.getTime() - eligStart.getTime()) / DAY) + 1);
    const missing = Math.max(0, span - days.length);
    if (missing > 0) noRecords.push({ empCode: e.empCode, name: e.name, days: missing });

    const otherEarnings = ex ? Number(ex.otherEarnings) : 0;
    const otherDeductions = ex ? Number(ex.otherDeductions) : 0;
    const gross = r2(c.basicPay + c.otPay + otherEarnings);

    // Auto advance recovery: FULL = whole balance, INSTALLMENT = one instalment, PARTIAL = manual
    let advWanted = 0;
    for (const a of advs.filter((x) => x.employeeId === e.id)) {
      const bal = Number(a.balance);
      if (a.deductionMode === "FULL") advWanted += bal;
      else if (a.deductionMode === "INSTALLMENT")
        advWanted += Math.min(Number(a.installmentAmount ?? bal), bal);
    }
    const advDed = r2(Math.min(advWanted, Math.max(0, gross - otherDeductions)));
    const net = r2(gross - advDed - otherDeductions);

    await prisma.$transaction(async (tx) => {
      const data = {
        presentDays: c.presentDays, absentDays: c.absentDays, leaveDays: c.leaveDays,
        regularHours: c.regularHours, otHours: c.otHours,
        basicPay: c.basicPay, otPay: c.otPay, otherEarnings, grossPay: gross,
        advanceDeduction: advDed, otherDeductions, netPay: net,
      };
      const row = await tx.payroll.upsert({
        where: { employeeId_month_year: { employeeId: e.id, month, year } },
        update: data,
        create: { employeeId: e.id, month, year, status: "DRAFT", ...data },
      });
      await tx.payrollSiteAllocation.deleteMany({ where: { payrollId: row.id } });

      let list = c.sites.filter((s) => s.days > 0 || s.hours > 0);
      if (!list.length && gross > 0 && e.currentSiteId)
        list = [{ siteId: e.currentSiteId, days: 1, hours: 0 }];
      if (list.length) {
        const amts = splitAmount(gross, list.map((s) => s.days || 1));
        await tx.payrollSiteAllocation.createMany({
          data: list.map((s, i) => ({
            payrollId: row.id, siteId: s.siteId, days: s.days, hours: s.hours, amount: amts[i],
          })),
        });
      }
    });
    generated++;
  }

  await logAudit({
    tableName: "Payroll", recordId: `${year}-${String(month).padStart(2, "0")}`,
    action: "CREATE", newValue: { generated, skippedLocked }, userId,
  });
  return NextResponse.json({ generated, skippedLocked, noRecords });
}

// ---------- approve: recover advances, lock the rows ----------
async function approve(month: number, year: number, userId: string) {
  const drafts = await prisma.payroll.findMany({ where: { month, year, status: "DRAFT" } });
  let approved = 0;

  for (const p of drafts) {
    const row = await prisma.$transaction(async (tx) => {
      let ded = Number(p.advanceDeduction);
      if (ded > 0) {
        const advs = await tx.advance.findMany({
          where: { employeeId: p.employeeId, approvalStatus: "APPROVED", status: "OPEN", balance: { gt: 0 } },
          orderBy: { date: "asc" },
        });
        let left = ded;
        for (const a of advs) {
          if (left <= 0) break;
          const take = Math.min(left, Number(a.balance));
          await tx.advanceRecovery.create({ data: { advanceId: a.id, payrollId: p.id, amount: take } });
          const nb = r2(Number(a.balance) - take);
          await tx.advance.update({
            where: { id: a.id },
            data: { balance: nb, status: nb <= 0 ? "CLOSED" : "OPEN" },
          });
          left = r2(left - take);
        }
        ded = r2(ded - left); // if balances shrank since draft, deduct only what was recovered
      }
      const net = r2(Number(p.grossPay) - ded - Number(p.otherDeductions));
      return tx.payroll.update({
        where: { id: p.id },
        data: { status: "APPROVED", advanceDeduction: ded, netPay: net },
      });
    });
    await logAudit({
      tableName: "Payroll", recordId: row.id, action: "UPDATE",
      oldValue: p, newValue: row, userId,
    });
    approved++;
  }
  return NextResponse.json({ approved });
}

// ---------- pay: approved -> paid ----------
async function pay(
  month: number, year: number,
  method: "CASH" | "BANK" | "UPI" | "CARD" | "CHEQUE",
  userId: string
) {
  const rows = await prisma.payroll.findMany({ where: { month, year, status: "APPROVED" } });
  const paidOn = dateOnly(istDate(new Date()));
  for (const p of rows) {
    const row = await prisma.payroll.update({
      where: { id: p.id },
      data: { status: "PAID", paidOn, paymentMethod: method },
    });
    await logAudit({
      tableName: "Payroll", recordId: row.id, action: "UPDATE",
      oldValue: p, newValue: row, userId,
    });
  }
  return NextResponse.json({ paid: rows.length });
}
