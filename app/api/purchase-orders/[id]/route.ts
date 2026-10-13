import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { poTotal } from "@/lib/purchasing";
import { userNames } from "@/lib/users";

type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const auth = await requireRole(
    "OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"
  );
  if ("error" in auth) return auth.error;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      supplier: true,
      site: { select: { id: true, name: true, supervisorId: true } },
      items: { include: { material: true } },
      receipts: { include: { items: { include: { material: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.user.role === "SITE_SUPERVISOR" && po.site.supervisorId !== auth.user.id)
    return NextResponse.json({ error: "Not your site" }, { status: 403 });

  const names = await userNames([po.createdById, po.approvedById]);
  return NextResponse.json({
    ...po,
    createdByName: names.get(po.createdById) ?? null,
    approvedByName: po.approvedById ? names.get(po.approvedById) ?? null : null,
    total: poTotal(
      po.items.map((i) => ({ qty: Number(i.qty), rate: Number(i.rate), gstPct: Number(i.gstPct) })),
      Number(po.transport), Number(po.otherCharges)
    ),
  });
}

const schema = z.object({ action: z.enum(["issue", "cancel"]) });

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PURCHASE_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.purchaseOrder.findUnique({
    where: { id: params.id }, include: { items: true, receipts: { select: { id: true } } },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { items, receipts, ...oldRow } = old;

  if (parsed.data.action === "issue") {
    if (old.status !== "DRAFT")
      return NextResponse.json({ error: `PO is ${old.status}, only DRAFT can be issued` }, { status: 409 });
    const row = await prisma.purchaseOrder.update({
      where: { id: old.id }, data: { status: "ISSUED", approvedById: auth.user.id },
    });
    await logAudit({
      tableName: "PurchaseOrder", recordId: row.id, action: "UPDATE",
      oldValue: oldRow, newValue: row, userId: auth.user.id, siteId: row.siteId,
    });
    return NextResponse.json(row);
  }

  // cancel: only if nothing has been received
  if (old.status === "CANCELLED" || old.status === "RECEIVED" || receipts.length > 0 ||
      items.some((i) => Number(i.receivedQty) > 0))
    return NextResponse.json(
      { error: "Cannot cancel: PO is already cancelled, completed or has goods received" },
      { status: 409 }
    );
  const row = await prisma.purchaseOrder.update({ where: { id: old.id }, data: { status: "CANCELLED" } });
  await logAudit({
    tableName: "PurchaseOrder", recordId: row.id, action: "UPDATE",
    oldValue: oldRow, newValue: row, userId: auth.user.id, siteId: row.siteId,
  });
  return NextResponse.json(row);
}
