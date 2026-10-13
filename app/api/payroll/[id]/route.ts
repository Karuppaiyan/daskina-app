import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { r2 } from "@/lib/payroll";

const schema = z.object({
  otherEarnings: z.coerce.number().min(0).optional(),
  otherDeductions: z.coerce.number().min(0).optional(),
  advanceDeduction: z.coerce.number().min(0).optional(),
});

// Edit a DRAFT row only. Approved/paid rows are locked.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER", "ACCOUNTS", "HR");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.payroll.findUnique({ where: { id: params.id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (old.status !== "DRAFT")
    return NextResponse.json({ error: `Payroll is ${old.status} and locked` }, { status: 409 });

  const oe = parsed.data.otherEarnings ?? Number(old.otherEarnings);
  const od = parsed.data.otherDeductions ?? Number(old.otherDeductions);
  const gross = r2(Number(old.basicPay) + Number(old.otPay) + oe);

  if (od > gross)
    return NextResponse.json({ error: "Deductions exceed gross pay" }, { status: 400 });

  const open = await prisma.advance.aggregate({
    where: { employeeId: old.employeeId, approvalStatus: "APPROVED", status: "OPEN", balance: { gt: 0 } },
    _sum: { balance: true },
  });
  const maxAdv = Math.min(Number(open._sum.balance ?? 0), gross - od);
  const ad = parsed.data.advanceDeduction ?? Math.min(Number(old.advanceDeduction), maxAdv);
  if (ad > maxAdv + 0.001)
    return NextResponse.json(
      { error: `Advance deduction cannot exceed ₹${r2(maxAdv)} (open balance / pay available)` },
      { status: 400 }
    );

  const row = await prisma.payroll.update({
    where: { id: params.id },
    data: {
      otherEarnings: oe, otherDeductions: od, grossPay: gross,
      advanceDeduction: r2(ad), netPay: r2(gross - ad - od),
    },
  });
  await logAudit({
    tableName: "Payroll", recordId: row.id, action: "UPDATE",
    oldValue: old, newValue: row, userId: auth.user.id,
  });
  return NextResponse.json(row);
}
