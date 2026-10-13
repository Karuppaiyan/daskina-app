import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { buildTimes, istTime } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const patchSchema = z.object({
  status: z.enum(["PRESENT", "ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY", "HALF_DAY"]).optional(),
  checkIn: z.string().regex(HHMM).optional(),
  checkOut: z.string().regex(HHMM).optional(),
  remarks: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER", "HR", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const old = await prisma.attendance.findUnique({
    where: { id: params.id },
    include: { employee: { select: { regularHours: true } } },
  });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const day = old.date.toISOString().slice(0, 10);
  const denied = await checkSiteAccess(auth.user, old.siteId, day, true);
  if (denied) return denied;

  const status = d.status ?? old.status;
  const inT = d.checkIn ?? (old.checkIn ? istTime(old.checkIn) : undefined);
  const outT = d.checkOut ?? (old.checkOut ? istTime(old.checkOut) : undefined);
  const t = buildTimes(day, status, inT, outT, Number(old.employee.regularHours));
  if (t.tooLong)
    return NextResponse.json({ error: "Check-in to check-out is over 20 hours. Check the times." }, { status: 400 });

  const { employee: _e, ...oldRow } = old;
  const row = await prisma.attendance.update({
    where: { id: params.id },
    data: {
      status,
      checkIn: t.checkIn,
      checkOut: t.checkOut,
      workedHours: t.workedHours,
      otHours: t.otHours,
      remarks: d.remarks ?? old.remarks,
      source: old.source === "DEVICE" ? "DEVICE+MANUAL" : "MANUAL",
    },
  });
  await logAudit({
    tableName: "Attendance",
    recordId: row.id,
    action: "UPDATE",
    oldValue: oldRow,
    newValue: row,
    userId: auth.user.id,
    siteId: row.siteId,
  });
  return NextResponse.json(row);
}
