import { NextResponse } from "next/server";
import { EmployeeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean, employeeSchema, p2002Target, stripPay } from "@/lib/employee";

async function nextCode() {
  const last = await prisma.employee.findFirst({
    orderBy: { empCode: "desc" },
    select: { empCode: true },
  });
  const n = last ? parseInt(last.empCode.replace(/\D/g, ""), 10) + 1 : 1;
  return "EMP" + String(n).padStart(4, "0");
}

export async function GET(req: Request) {
  const auth = await requireRole(
    "OWNER", "HR", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"
  );
  if ("error" in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q");
  const siteId = sp.get("siteId");
  const status = sp.get("status");

  const where: Prisma.EmployeeWhereInput = { deletedAt: null };
  if (siteId) where.currentSiteId = siteId;
  if (status && status in EmployeeStatus) where.status = status as EmployeeStatus;
  if (q)
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { empCode: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];

  const rows = await prisma.employee.findMany({
    where,
    include: { currentSite: { select: { id: true, name: true } } },
    orderBy: { empCode: "asc" },
    take: 500,
  });
  return NextResponse.json(rows.map((r) => stripPay(r, auth.user.role)));
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "HR");
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const force = body?.force === true;
  const parsed = employeeSchema.safeParse(clean(body));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Duplicate employee warning (same phone) - client may resend with force:true
  if (d.phone && !force) {
    const dup = await prisma.employee.findFirst({
      where: { phone: d.phone, deletedAt: null },
      select: { empCode: true, name: true },
    });
    if (dup)
      return NextResponse.json(
        {
          duplicate: true,
          error: `Possible duplicate: ${dup.empCode} (${dup.name}) already has this phone number`,
        },
        { status: 409 }
      );
  }

  const joining = d.joiningDate ? new Date(d.joiningDate) : new Date();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await prisma.employee.create({
        data: {
          empCode: await nextCode(),
          name: d.name,
          phone: d.phone,
          designation: d.designation,
          trade: d.trade,
          type: d.type,
          status: d.status ?? "ACTIVE",
          joiningDate: joining,
          currentSiteId: d.currentSiteId,
          supervisorId: d.supervisorId,
          wageType: d.wageType,
          wageRate: d.wageRate,
          regularHours: d.regularHours,
          otRate: d.otRate,
          holidayRate: d.holidayRate,
          bankName: d.bankName,
          accountNumber: d.accountNumber,
          ifsc: d.ifsc,
          faceId: d.faceId,
          siteHistory: d.currentSiteId
            ? { create: { siteId: d.currentSiteId, fromDate: joining } }
            : undefined,
        },
      });
      await logAudit({
        tableName: "Employee",
        recordId: row.id,
        action: "CREATE",
        newValue: row,
        userId: auth.user.id,
        siteId: d.currentSiteId,
      });
      return NextResponse.json(row, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const t = p2002Target(e);
        if (t.includes("faceId"))
          return NextResponse.json(
            { error: "This Face ID is already assigned to another employee" },
            { status: 409 }
          );
        if (t.includes("empCode")) continue; // race on code, retry
      }
      throw e;
    }
  }
  return NextResponse.json({ error: "Could not generate employee code" }, { status: 500 });
}
