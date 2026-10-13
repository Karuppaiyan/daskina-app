import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { buildTimes, dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const createSchema = z.object({
  employeeId: z.string().min(1),
  siteId: z.string().min(1),
  date: z.string().regex(DATE),
  status: z
    .enum(["PRESENT", "ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY", "HALF_DAY"])
    .default("PRESENT"),
  checkIn: z.string().regex(HHMM).optional(),
  checkOut: z.string().regex(HHMM).optional(),
  remarks: z.string().optional(),
});

const READ_ROLES = ["OWNER", "HR", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"] as const;

// Roster for one site + day: employees at the site merged with that day's records
export async function GET(req: Request) {
  const auth = await requireRole(...READ_ROLES);
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const date = sp.get("date");
  const siteId = sp.get("siteId");
  if (!date || !DATE.test(date) || !siteId)
    return NextResponse.json({ error: "date (YYYY-MM-DD) and siteId required" }, { status: 400 });

  const denied = await checkSiteAccess(auth.user, siteId, date, false);
  if (denied) return denied;

  const [emps, records] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null, status: "ACTIVE", currentSiteId: siteId },
      select: { id: true, empCode: true, name: true, trade: true, regularHours: true },
      orderBy: { empCode: "asc" },
    }),
    prisma.attendance.findMany({
      where: { siteId, date: dateOnly(date) },
      include: {
        employee: {
          select: { id: true, empCode: true, name: true, trade: true, regularHours: true },
        },
      },
    }),
  ]);

  const byEmp = new Map(records.map((r) => [r.employeeId, r]));
  const rows = emps.map((e) => ({ employee: e, record: byEmp.get(e.id) ?? null }));
  // Employees who punched here but belong to another site now
  for (const r of records)
    if (!emps.some((e) => e.id === r.employeeId))
      rows.push({ employee: r.employee, record: r });

  return NextResponse.json({ date, siteId, rows });
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "HR", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  if (d.date > istDate(new Date()))
    return NextResponse.json({ error: "Cannot mark attendance for a future date" }, { status: 400 });

  const denied = await checkSiteAccess(auth.user, d.siteId, d.date, true);
  if (denied) return denied;

  const [emp, site] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: d.employeeId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.site.findFirst({ where: { id: d.siteId, deletedAt: null } }),
  ]);
  if (!emp) return NextResponse.json({ error: "Active employee not found" }, { status: 404 });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const t = buildTimes(d.date, d.status, d.checkIn, d.checkOut, Number(emp.regularHours));
  if (t.tooLong)
    return NextResponse.json({ error: "Check-in to check-out is over 20 hours. Check the times." }, { status: 400 });

  try {
    const row = await prisma.attendance.create({
      data: {
        employeeId: emp.id,
        siteId: site.id,
        date: dateOnly(d.date),
        status: d.status,
        checkIn: t.checkIn,
        checkOut: t.checkOut,
        workedHours: t.workedHours,
        otHours: t.otHours,
        source: "MANUAL",
        remarks: d.remarks,
        createdById: auth.user.id,
      },
    });
    await logAudit({
      tableName: "Attendance",
      recordId: row.id,
      action: "CREATE",
      newValue: row,
      userId: auth.user.id,
      siteId: site.id,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Attendance already marked for this employee on this date. Edit it instead." },
        { status: 409 }
      );
    throw e;
  }
}
