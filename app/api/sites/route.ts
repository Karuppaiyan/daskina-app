import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { siteSchema } from "@/lib/schemas";


export async function GET(req: Request) {
  const auth = await requireRole(
    "OWNER", "PROJECT_MANAGER", "ACCOUNTS", "HR", "SITE_SUPERVISOR", "PURCHASE_MANAGER"
  );
  if ("error" in auth) return auth.error;

  const projectId = new URL(req.url).searchParams.get("projectId");
  const rows = await prisma.site.findMany({
    where: { deletedAt: null, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER");
  if ("error" in auth) return auth.error;

  const parsed = siteSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  // Duplicate warning: same site name inside same project
  const dup = await prisma.site.findFirst({
    where: { name: d.name, projectId: d.projectId || null, deletedAt: null },
  });
  if (dup)
    return NextResponse.json(
      { error: "Duplicate: a site with this name already exists in this project" },
      { status: 409 }
    );

  const row = await prisma.site.create({
    data: {
      name: d.name,
      projectId: d.projectId || null,
      location: d.location || null,
      supervisorId: d.supervisorId || null,
      isWorkshop: d.isWorkshop ?? false,
      isActive: d.isActive ?? true,
    },
  });
  await logAudit({
    tableName: "Site",
    recordId: row.id,
    action: "CREATE",
    newValue: row,
    userId: auth.user.id,
    siteId: row.id,
  });
  return NextResponse.json(row, { status: 201 });
}
