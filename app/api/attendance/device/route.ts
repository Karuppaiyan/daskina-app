import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { calcHours, dateOnly, istDate } from "@/lib/attendance";

// Face ID / biometric device punch endpoint.
// POST  header: x-device-key: <DEVICE_API_KEY>
// body: { "deviceCode": "DEV-001", "faceId": "F123", "timestamp": "2026-10-08T09:02:11+05:30" }
// Punches for a day: earliest = check-in, latest = check-out.

const schema = z.object({
  deviceCode: z.string().min(1),
  faceId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }).optional(),
});

function keyOk(h: string | null) {
  const k = process.env.DEVICE_API_KEY;
  if (!k || !h) return false;
  const a = Buffer.from(h);
  const b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!keyOk(req.headers.get("x-device-key")))
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const ts = d.timestamp ? new Date(d.timestamp) : new Date();
  const now = Date.now();
  if (ts.getTime() > now + 5 * 60000)
    return NextResponse.json({ error: "Timestamp is in the future" }, { status: 400 });
  if (ts.getTime() < now - 7 * 86400000)
    return NextResponse.json({ error: "Timestamp older than 7 days" }, { status: 400 });

  const device = await prisma.device.findUnique({ where: { deviceCode: d.deviceCode } });
  if (!device || !device.isActive)
    return NextResponse.json({ error: "Unknown or inactive device" }, { status: 404 });

  const emp = await prisma.employee.findUnique({ where: { faceId: d.faceId } });
  if (!emp || emp.deletedAt || emp.status !== "ACTIVE")
    return NextResponse.json({ error: "Face not recognised / employee inactive" }, { status: 404 });

  const day = istDate(ts);
  const date = dateOnly(day);
  const where = { employeeId_date: { employeeId: emp.id, date } };
  const regular = Number(emp.regularHours);

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await prisma.attendance.findUnique({ where });

    // First punch of the day
    if (!existing) {
      try {
        const row = await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            siteId: device.siteId,
            deviceId: device.id,
            date,
            checkIn: ts,
            status: "PRESENT",
            source: "DEVICE",
          },
        });
        await logAudit({
          tableName: "Attendance",
          recordId: row.id,
          action: "CREATE",
          newValue: row,
          deviceId: device.id,
          siteId: device.siteId,
        });
        return NextResponse.json({ result: "check_in", employee: emp.name, time: ts });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // race, retry as update
        throw e;
      }
    }

    // Day record exists with no times (e.g. manually marked absent) -> first punch becomes check-in
    const times = [existing.checkIn, existing.checkOut, ts].filter(Boolean) as Date[];
    let inn: Date;
    let out: Date | null = null;
    if (!existing.checkIn && !existing.checkOut) {
      inn = ts;
    } else {
      inn = new Date(Math.min(...times.map((t) => t.getTime())));
      out = new Date(Math.max(...times.map((t) => t.getTime())));
      // Ignore double taps (<5 min apart) and punches that change nothing
      if (out.getTime() - inn.getTime() < 5 * 60000)
        return NextResponse.json({ result: "ignored_duplicate_punch", employee: emp.name });
      if (
        existing.checkIn?.getTime() === inn.getTime() &&
        existing.checkOut?.getTime() === out.getTime()
      )
        return NextResponse.json({ result: "ignored_no_change", employee: emp.name });
    }

    const h = calcHours(inn, out, regular, "PRESENT");
    const row = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        status: "PRESENT",
        checkIn: inn,
        checkOut: h.checkOut,
        workedHours: h.workedHours,
        otHours: h.otHours,
        deviceId: device.id,
        source: existing.source === "MANUAL" ? "MANUAL+DEVICE" : existing.source,
      },
    });
    await logAudit({
      tableName: "Attendance",
      recordId: row.id,
      action: "UPDATE",
      oldValue: existing,
      newValue: row,
      deviceId: device.id,
      siteId: row.siteId,
    });
    return NextResponse.json({
      result: out ? "check_out" : "check_in",
      employee: emp.name,
      workedHours: h.workedHours,
      otHours: h.otHours,
    });
  }
  return NextResponse.json({ error: "Could not record punch, retry" }, { status: 503 });
}
