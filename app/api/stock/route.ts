import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

// Balance per site + material, with low-stock flag (balance <= material.minStock)
export async function GET(req: Request) {
  const auth = await requireRole(
    "OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS"
  );
  if ("error" in auth) return auth.error;

  const siteId = new URL(req.url).searchParams.get("siteId");
  const where: Prisma.StockMovementWhereInput = {};
  if (siteId) where.siteId = siteId;
  if (auth.user.role === "SITE_SUPERVISOR") where.site = { supervisorId: auth.user.id };

  const grouped = await prisma.stockMovement.groupBy({
    by: ["siteId", "materialId"], where, _sum: { qty: true },
  });
  const siteIds = Array.from(new Set(grouped.map((g) => g.siteId)));
  const matIds = Array.from(new Set(grouped.map((g) => g.materialId)));
  const [sites, mats] = await Promise.all([
    prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }),
    prisma.material.findMany({ where: { id: { in: matIds } } }),
  ]);

  const rows = grouped
    .map((g) => {
      const m = mats.find((x) => x.id === g.materialId);
      const balance = Number(g._sum.qty ?? 0);
      const min = Number(m?.minStock ?? 0);
      return {
        siteId: g.siteId,
        site: sites.find((s) => s.id === g.siteId)?.name ?? "?",
        materialId: g.materialId,
        material: m?.name ?? "?",
        spec: m?.spec ?? "",
        unit: m?.unit ?? "",
        balance,
        minStock: min,
        low: min > 0 && balance <= min,
      };
    })
    .sort((a, b) => a.site.localeCompare(b.site) || a.material.localeCompare(b.material));

  return NextResponse.json({ rows });
}
