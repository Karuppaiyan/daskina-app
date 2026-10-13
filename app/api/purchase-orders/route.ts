import { NextResponse } from "next/server";
import { POStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { poSchema, poTotal } from "@/lib/purchasing";
import { nextPoNumber } from "@/lib/seq";
import { dateOnly, istDate } from "@/lib/attendance";

export async function GET(req: Request) {
  const auth = await requireRole(
    "OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"
  );
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const supplierId = sp.get("supplierId");
  const siteId = sp.get("siteId");

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (status && status in POStatus) where.status = status as POStatus;
  if (supplierId) where.supplierId = supplierId;
  if (siteId) where.siteId = siteId;
  if (auth.user.role === "SITE_SUPERVISOR") where.site = { supervisorId: auth.user.id };

  const rows = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      site: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(
    rows.map(({ items, ...r }) => {
      const ordered = items.reduce((a, i) => a + Number(i.qty), 0);
      const received = items.reduce((a, i) => a + Number(i.receivedQty), 0);
      return {
        ...r,
        itemCount: items.length,
        receivedPct: ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0,
        total: poTotal(
          items.map((i) => ({ qty: Number(i.qty), rate: Number(i.rate), gstPct: Number(i.gstPct) })),
          Number(r.transport), Number(r.otherCharges)
        ),
      };
    })
  );
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const force = body?.force === true;
  const parsed = poSchema.safeParse(clean(body));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const ids = Array.from(new Set(d.items.map((i) => i.materialId)));
  if (ids.length !== d.items.length)
    return NextResponse.json({ error: "The same material is listed twice. Merge the lines." }, { status: 400 });

  const [supplier, site, matCount] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: d.supplierId, deletedAt: null } }),
    prisma.site.findFirst({ where: { id: d.siteId, deletedAt: null } }),
    prisma.material.count({ where: { id: { in: ids }, deletedAt: null } }),
  ]);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  if (!site) return NextResponse.json({ error: "Delivery site not found" }, { status: 404 });
  if (matCount !== ids.length) return NextResponse.json({ error: "Unknown material in items" }, { status: 400 });

  const date = d.date ?? istDate(new Date());
  const total = poTotal(d.items, d.transport, d.otherCharges);

  // Duplicate purchase warning: same supplier + site + date + total
  if (!force) {
    const same = await prisma.purchaseOrder.findMany({
      where: { supplierId: d.supplierId, siteId: d.siteId, date: dateOnly(date), status: { not: "CANCELLED" } },
      include: { items: true },
    });
    const dup = same.find(
      (p) =>
        Math.abs(
          poTotal(
            p.items.map((i) => ({ qty: Number(i.qty), rate: Number(i.rate), gstPct: Number(i.gstPct) })),
            Number(p.transport), Number(p.otherCharges)
          ) - total
        ) < 0.01
    );
    if (dup)
      return NextResponse.json(
        { duplicate: true, error: `Possible duplicate of ${dup.poNumber} (same supplier, site, date and amount)` },
        { status: 409 }
      );
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await prisma.purchaseOrder.create({
        data: {
          poNumber: await nextPoNumber(),
          supplierId: d.supplierId, siteId: d.siteId,
          date: dateOnly(date),
          expectedDate: d.expectedDate ? dateOnly(d.expectedDate) : null,
          transport: d.transport, otherCharges: d.otherCharges, notes: d.notes,
          createdById: auth.user.id,
          items: { create: d.items },
        },
        include: { items: true },
      });
      await logAudit({
        tableName: "PurchaseOrder", recordId: row.id, action: "CREATE",
        newValue: row, userId: auth.user.id, siteId: d.siteId,
      });
      return NextResponse.json({ ...row, total }, { status: 201 });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  return NextResponse.json({ error: "Could not generate PO number, retry" }, { status: 500 });
}
