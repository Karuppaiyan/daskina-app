import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { userNames } from "@/lib/users";

export async function GET(req: Request) {
  const auth = await requireRole(
    "OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS"
  );
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const where: Prisma.StockMovementWhereInput = {};
  if (sp.get("siteId")) where.siteId = sp.get("siteId")!;
  if (sp.get("materialId")) where.materialId = sp.get("materialId")!;
  if (auth.user.role === "SITE_SUPERVISOR") where.site = { supervisorId: auth.user.id };

  const rows = await prisma.stockMovement.findMany({
    where,
    include: {
      site: { select: { name: true } },
      material: { select: { name: true, spec: true, unit: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.authorizedById]));
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      createdByName: names.get(r.createdById) ?? null,
      authorizedByName: r.authorizedById ? names.get(r.authorizedById) ?? null : null,
    }))
  );
}
