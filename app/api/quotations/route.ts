import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { landedPerUnit, quotationSchema } from "@/lib/purchasing";
import { dateOnly, istDate } from "@/lib/attendance";

// Latest quote per supplier for one material, ranked by TRUE landed cost per unit
export async function GET(req: Request) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const materialId = new URL(req.url).searchParams.get("materialId");
  if (!materialId) return NextResponse.json({ error: "materialId required" }, { status: 400 });

  const rows = await prisma.quotation.findMany({
    where: { materialId, supplier: { deletedAt: null } },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.supplierId)) latest.set(r.supplierId, r);

  const today = istDate(new Date());
  const quotes = Array.from(latest.values()).map((r) => {
    const q = {
      basicRate: Number(r.basicRate), gstPct: Number(r.gstPct),
      transport: Number(r.transport), otherCharges: Number(r.otherCharges), qty: Number(r.qty),
    };
    return {
      id: r.id, supplier: r.supplier, date: r.date, qty: q.qty, basicRate: q.basicRate,
      gstPct: q.gstPct, transport: q.transport, otherCharges: q.otherCharges,
      validUntil: r.validUntil, remarks: r.remarks,
      landedRate: landedPerUnit(q),
      expired: r.validUntil ? r.validUntil.toISOString().slice(0, 10) < today : false,
    };
  });

  const valid = quotes.filter((q) => !q.expired);
  const minLanded = valid.length ? Math.min(...valid.map((q) => q.landedRate)) : null;
  const minBasic = valid.length ? Math.min(...valid.map((q) => q.basicRate)) : null;
  quotes.sort((a, b) => a.landedRate - b.landedRate);

  return NextResponse.json({
    quotes: quotes.map((q) => ({
      ...q,
      lowestLanded: !q.expired && q.landedRate === minLanded,
      lowestBasic: !q.expired && q.basicRate === minBasic,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = quotationSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const [mat, sup] = await Promise.all([
    prisma.material.findFirst({ where: { id: d.materialId, deletedAt: null } }),
    prisma.supplier.findFirst({ where: { id: d.supplierId, deletedAt: null } }),
  ]);
  if (!mat) return NextResponse.json({ error: "Material not found" }, { status: 404 });
  if (!sup) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const row = await prisma.quotation.create({
    data: {
      materialId: d.materialId, supplierId: d.supplierId,
      date: dateOnly(d.date ?? istDate(new Date())),
      qty: d.qty, basicRate: d.basicRate, transport: d.transport,
      gstPct: d.gstPct, otherCharges: d.otherCharges,
      validUntil: d.validUntil ? dateOnly(d.validUntil) : null,
      remarks: d.remarks, createdById: auth.user.id,
    },
  });
  await logAudit({
    tableName: "Quotation", recordId: row.id, action: "CREATE", newValue: row, userId: auth.user.id,
  });
  return NextResponse.json(row, { status: 201 });
}
