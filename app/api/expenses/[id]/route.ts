import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { expenseSchema } from "@/lib/expense";
import { dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const patchSchema = expenseSchema
  .omit({ siteId: true })
  .partial()
  .extend({ action: z.enum(["approve", "reject"]).optional() });

type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole(
    "OWNER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR", "PURCHASE_MANAGER"
  );
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { action, ...d } = parsed.data;

  const old = await prisma.expense.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (old.status !== "PENDING")
    return NextResponse.json({ error: `Expense is ${old.status} and locked` }, { status: 409 });

  const isFinance = auth.user.role === "OWNER" || auth.user.role === "ACCOUNTS";

  // ---- approve / reject ----
  if (action) {
    if (!isFinance)
      return NextResponse.json({ error: "Only OWNER or ACCOUNTS can approve" }, { status: 403 });
    if (old.createdById === auth.user.id && auth.user.role !== "OWNER")
      return NextResponse.json({ error: "You cannot approve your own expense" }, { status: 403 });
    const row = await prisma.expense.update({
      where: { id: old.id },
      data: { status: action === "approve" ? "APPROVED" : "REJECTED", approvedById: auth.user.id },
    });
    await logAudit({
      tableName: "Expense", recordId: row.id, action: "UPDATE",
      oldValue: old, newValue: row, userId: auth.user.id, siteId: row.siteId,
    });
    return NextResponse.json(row);
  }

  // ---- edit (pending only; creator or finance) ----
  if (!isFinance && old.createdById !== auth.user.id)
    return NextResponse.json({ error: "You can only edit your own expenses" }, { status: 403 });
  const denied = await checkSiteAccess(auth.user, old.siteId, old.date.toISOString().slice(0, 10), true);
  if (denied) return denied;
  if (d.date && d.date > istDate(new Date()))
    return NextResponse.json({ error: "Cannot use a future date" }, { status: 400 });

  const row = await prisma.expense.update({
    where: { id: old.id },
    data: {
      ...(d.date && { date: dateOnly(d.date) }),
      ...(d.category && { category: d.category }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.amount !== undefined && { amount: d.amount }),
      ...(d.spentById && { spentById: d.spentById }),
      ...(d.paymentMethod && { paymentMethod: d.paymentMethod }),
      ...(d.receiptUrl && { receiptUrl: d.receiptUrl }),
    },
  });
  await logAudit({
    tableName: "Expense", recordId: row.id, action: "UPDATE",
    oldValue: old, newValue: row, userId: auth.user.id, siteId: row.siteId,
  });
  return NextResponse.json(row);
}

// Soft delete, OWNER only
export async function DELETE(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const old = await prisma.expense.findFirst({ where: { id: params.id, deletedAt: null } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.expense.update({ where: { id: old.id }, data: { deletedAt: new Date() } });
  await logAudit({
    tableName: "Expense", recordId: row.id, action: "DELETE",
    oldValue: old, newValue: row, userId: auth.user.id, siteId: row.siteId,
  });
  return NextResponse.json({ ok: true });
}
