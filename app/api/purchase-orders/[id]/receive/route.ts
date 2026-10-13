import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { r3 } from "@/lib/purchasing";
import { nextGrnNumber } from "@/lib/seq";
import { dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceNo: z.string().max(50).optional(),
  vehicleNo: z.string().max(30).optional(),
  items: z
    .array(
      z.object({
        poItemId: z.string().min(1),
        receivedQty: z.coerce.number().positive(),
        rejectedQty: z.coerce.number().min(0).default(0),
        remarks: z.string().max(200).optional(),
      })
    )
    .min(1),
  force: z.boolean().optional(),
});

// Receive goods against a PO: accepted qty goes into site stock, rejected qty is recorded.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { items: { include: { material: true } } },
  });
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (po.status !== "ISSUED" && po.status !== "PARTIAL")
    return NextResponse.json({ error: `PO is ${po.status}. Only ISSUED or PARTIAL POs can receive goods.` }, { status: 409 });

  const date = d.date ?? istDate(new Date());
  if (date > istDate(new Date()))
    return NextResponse.json({ error: "Receipt date cannot be in the future" }, { status: 400 });
  const denied = await checkSiteAccess(auth.user, po.siteId, date, true);
  if (denied) return denied;

  const seen = new Set<string>();
  const lines: { poItem: (typeof po.items)[number]; received: number; rejected: number; accepted: number; remarks?: string }[] = [];
  const exceeds: { material: string; pending: number; accepted: number }[] = [];

  for (const l of d.items) {
    const poItem = po.items.find((i) => i.id === l.poItemId);
    if (!poItem) return NextResponse.json({ error: "Item does not belong to this PO" }, { status: 400 });
    if (seen.has(l.poItemId)) return NextResponse.json({ error: "Same PO line listed twice" }, { status: 400 });
    seen.add(l.poItemId);
    if (l.rejectedQty > l.receivedQty)
      return NextResponse.json({ error: `Rejected qty exceeds received qty for ${poItem.material.name}` }, { status: 400 });

    const accepted = r3(l.receivedQty - l.rejectedQty);
    const pending = r3(Number(poItem.qty) - Number(poItem.receivedQty));
    if (accepted > pending + 0.0005)
      exceeds.push({ material: poItem.material.name, pending, accepted });
    lines.push({ poItem, received: l.receivedQty, rejected: l.rejectedQty, accepted, remarks: l.remarks });
  }

  // PO quantity exceeded: block unless OWNER / PURCHASE_MANAGER forces it
  if (exceeds.length) {
    if (!d.force)
      return NextResponse.json(
        { exceeds: true, details: exceeds, error: "Received quantity exceeds the PO quantity for " + exceeds.map((e) => e.material).join(", ") },
        { status: 409 }
      );
    if (auth.user.role === "SITE_SUPERVISOR")
      return NextResponse.json({ error: "Only OWNER or PURCHASE_MANAGER can accept over-delivery" }, { status: 403 });
  }

  // Duplicate invoice
  if (d.invoiceNo) {
    const dup = await prisma.goodsReceipt.findFirst({
      where: { supplierId: po.supplierId, invoiceNo: d.invoiceNo }, select: { grnNumber: true },
    });
    if (dup)
      return NextResponse.json({ error: `Duplicate: invoice ${d.invoiceNo} was already received on ${dup.grnNumber}` }, { status: 409 });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const grnNumber = await nextGrnNumber();
      const grn = await prisma.$transaction(async (tx) => {
        const g = await tx.goodsReceipt.create({
          data: {
            grnNumber, poId: po.id, supplierId: po.supplierId, siteId: po.siteId,
            date: dateOnly(date), invoiceNo: d.invoiceNo, vehicleNo: d.vehicleNo,
            createdById: auth.user.id,
            items: {
              create: lines.map((l) => ({
                poItemId: l.poItem.id, materialId: l.poItem.materialId,
                receivedQty: l.received, rejectedQty: l.rejected, remarks: l.remarks,
              })),
            },
          },
          include: { items: true },
        });
        for (const l of lines) {
          if (l.accepted <= 0) continue;
          await tx.purchaseOrderItem.update({
            where: { id: l.poItem.id }, data: { receivedQty: { increment: l.accepted } },
          });
          await tx.stockMovement.create({
            data: {
              siteId: po.siteId, materialId: l.poItem.materialId, type: "RECEIPT",
              qty: l.accepted, rate: l.poItem.rate, date: dateOnly(date),
              refType: "GRN", refId: g.id, remarks: grnNumber, createdById: auth.user.id,
            },
          });
        }
        const fresh = await tx.purchaseOrderItem.findMany({ where: { poId: po.id } });
        const complete = fresh.every((i) => Number(i.receivedQty) >= Number(i.qty) - 0.0005);
        await tx.purchaseOrder.update({
          where: { id: po.id }, data: { status: complete ? "RECEIVED" : "PARTIAL" },
        });
        return g;
      });
      await logAudit({
        tableName: "GoodsReceipt", recordId: grn.id, action: "CREATE",
        newValue: grn, userId: auth.user.id, siteId: po.siteId,
      });
      return NextResponse.json(grn, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const t = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
        if (t.includes("invoiceNo"))
          return NextResponse.json({ error: "Duplicate: this invoice was just received" }, { status: 409 });
        continue; // GRN number race, retry
      }
      throw e;
    }
  }
  return NextResponse.json({ error: "Could not generate GRN number, retry" }, { status: 500 });
}
