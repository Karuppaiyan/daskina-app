import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  siteId: z.string().min(1),
  date: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole("OWNER", "HR", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { siteId, date } = parsed.data;

  const emp = await prisma.employee.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (emp.currentSiteId === siteId)
    return NextResponse.json(
      { error: "Employee is already at this site" },
      { status: 409 }
    );

  const site = await prisma.site.findFirst({
    where: { id: siteId, deletedAt: null, isActive: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const when = date ? new Date(date) : new Date();

  // Close the open history row, open a new one, move the employee - atomically
  await prisma.$transaction([
    prisma.employeeSiteHistory.updateMany({
      where: { employeeId: emp.id, toDate: null },
      data: { toDate: when },
    }),
    prisma.employeeSiteHistory.create({
      data: { employeeId: emp.id, siteId, fromDate: when },
    }),
    prisma.employee.update({
      where: { id: emp.id },
      data: { currentSiteId: siteId },
    }),
  ]);

  await logAudit({
    tableName: "Employee",
    recordId: emp.id,
    action: "UPDATE",
    oldValue: { currentSiteId: emp.currentSiteId },
    newValue: { currentSiteId: siteId, transferDate: when },
    userId: auth.user.id,
    siteId,
  });
  return NextResponse.json({ ok: true });
}
