import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({ siteIds: z.array(z.string().min(1)).max(200) });

// Set exactly which sites this supervisor is responsible for
// (site supervisors can only mark attendance / DPR / expenses for these sites)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const siteIds = Array.from(new Set(parsed.data.siteIds));

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "SITE_SUPERVISOR")
    return NextResponse.json({ error: "Only users with the SITE_SUPERVISOR role can be assigned to sites" }, { status: 400 });

  const found = await prisma.site.count({ where: { id: { in: siteIds }, deletedAt: null } });
  if (found !== siteIds.length)
    return NextResponse.json({ error: "A selected site was not found" }, { status: 400 });

  const before = await prisma.site.findMany({ where: { supervisorId: user.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.site.updateMany({
      where: { supervisorId: user.id, id: { notIn: siteIds } },
      data: { supervisorId: null },
    }),
    prisma.site.updateMany({ where: { id: { in: siteIds } }, data: { supervisorId: user.id } }),
  ]);
  await logAudit({
    tableName: "User", recordId: user.id, action: "UPDATE",
    oldValue: { supervisedSiteIds: before.map((s) => s.id) },
    newValue: { supervisedSiteIds: siteIds }, userId: auth.user.id,
  });
  return NextResponse.json({ ok: true, count: siteIds.length });
}
