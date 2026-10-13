import { prisma } from "@/lib/prisma";

const pad = (n: number) => String(n).padStart(4, "0");

export async function nextPoNumber() {
  const last = await prisma.purchaseOrder.findFirst({
    orderBy: { createdAt: "desc" }, select: { poNumber: true },
  });
  const n = last ? parseInt(last.poNumber.replace(/\D/g, ""), 10) + 1 : 1;
  return "PO-" + pad(n);
}

export async function nextGrnNumber() {
  const last = await prisma.goodsReceipt.findFirst({
    orderBy: { createdAt: "desc" }, select: { grnNumber: true },
  });
  const n = last ? parseInt(last.grnNumber.replace(/\D/g, ""), 10) + 1 : 1;
  return "GRN-" + pad(n);
}
