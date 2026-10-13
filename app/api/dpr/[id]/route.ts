import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { dprSchema } from "@/lib/dpr";
import { checkSiteAccess } from "@/lib/attendance-access";

type Ctx = { params: { id: string } };

const patchSchema = dprSchema.omit({ siteId: true, date: true, media: true }).partial();

export async function GET(_: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS");
  if ("error" in auth) return auth.error;

  const row = await prisma.dpr.findUnique({
    where: { id: params.id },
    include: {
      site: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
      media: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const denied = await checkSiteAccess(auth.user, row.siteId, row.date.toISOString().slice(0, 10), false);
  if (denied) return denied;
  return NextResponse.json(row);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const old = await prisma.dpr.findUnique({ where: { id: params.id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const denied = await checkSiteAccess(auth.user, old.siteId, old.date.toISOString().slice(0, 10), true);
  if (denied) return denied;

  const row = await prisma.dpr.update({
    where: { id: old.id },
    data: {
      ...(d.workItems && { workItems: d.workItems as unknown as Prisma.InputJsonValue }),
      ...(d.manpowerCount !== undefined && { manpowerCount: d.manpowerCount }),
      ...(d.equipmentUsed && { equipmentUsed: d.equipmentUsed as unknown as Prisma.InputJsonValue }),
      ...(d.materialsUsed && { materialsUsed: d.materialsUsed as unknown as Prisma.InputJsonValue }),
      ...(d.delays !== undefined && { delays: d.delays }),
      ...(d.delayReason !== undefined && { delayReason: d.delayReason }),
      ...(d.safetyIssues !== undefined && { safetyIssues: d.safetyIssues }),
      ...(d.tomorrowPlan !== undefined && { tomorrowPlan: d.tomorrowPlan }),
    },
  });
  await logAudit({
    tableName: "Dpr", recordId: row.id, action: "UPDATE",
    oldValue: old, newValue: row, userId: auth.user.id, siteId: row.siteId,
  });
  return NextResponse.json(row);
}
