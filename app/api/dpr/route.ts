import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { dprSchema } from "@/lib/dpr";
import { fileExists } from "@/lib/storage";
import { dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const READ = ["OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS"] as const;
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const auth = await requireRole(...READ);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const siteId = sp.get("siteId");
  const from = sp.get("from");
  const to = sp.get("to");

  const where: Prisma.DprWhereInput = {};
  if (siteId) where.siteId = siteId;
  if ((from && D.test(from)) || (to && D.test(to)))
    where.date = {
      ...(from && D.test(from) ? { gte: dateOnly(from) } : {}),
      ...(to && D.test(to) ? { lte: dateOnly(to) } : {}),
    };
  if (auth.user.role === "SITE_SUPERVISOR") where.site = { supervisorId: auth.user.id };

  const rows = await prisma.dpr.findMany({
    where,
    include: {
      site: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
      _count: { select: { media: true } },
    },
    orderBy: { date: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = dprSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.date > istDate(new Date()))
    return NextResponse.json({ error: "Cannot create a DPR for a future date" }, { status: 400 });

  const denied = await checkSiteAccess(auth.user, d.siteId, d.date, true);
  if (denied) return denied;

  const site = await prisma.site.findFirst({ where: { id: d.siteId, deletedAt: null } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const media = d.media ?? [];
  for (const m of media)
    if (!(await fileExists(m.url.split("/").pop()!)))
      return NextResponse.json({ error: "A photo file was not found, re-upload it" }, { status: 400 });

  // Manpower defaults to that day's present count from attendance
  const manpower =
    d.manpowerCount ??
    (await prisma.attendance.count({
      where: { siteId: d.siteId, date: dateOnly(d.date), status: { in: ["PRESENT", "HALF_DAY"] } },
    }));

  try {
    const row = await prisma.dpr.create({
      data: {
        siteId: d.siteId,
        date: dateOnly(d.date),
        workItems: d.workItems as unknown as Prisma.InputJsonValue,
        manpowerCount: manpower,
        equipmentUsed: d.equipmentUsed as unknown as Prisma.InputJsonValue | undefined,
        materialsUsed: d.materialsUsed as unknown as Prisma.InputJsonValue | undefined,
        delays: d.delays,
        delayReason: d.delayReason,
        safetyIssues: d.safetyIssues,
        tomorrowPlan: d.tomorrowPlan,
        submittedById: auth.user.id,
        media: {
          create: media.map((m) => ({
            url: m.url,
            stage: m.stage,
            type: m.url.endsWith(".pdf") ? "DOCUMENT" : "PHOTO",
            uploadedById: auth.user.id,
          })),
        },
      },
      include: { media: true },
    });
    await logAudit({
      tableName: "Dpr", recordId: row.id, action: "CREATE",
      newValue: row, userId: auth.user.id, siteId: d.siteId,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "A DPR already exists for this site and date. Open it and edit instead." },
        { status: 409 }
      );
    throw e;
  }
}
