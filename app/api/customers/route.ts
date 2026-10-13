import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1),
  contact: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

export async function GET() {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "ACCOUNTS");
  if ("error" in auth) return auth.error;
  const rows = await prisma.customer.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "ACCOUNTS");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const row = await prisma.customer.create({ data: parsed.data });
    await logAudit({
      tableName: "Customer",
      recordId: row.id,
      action: "CREATE",
      newValue: row,
      userId: auth.user.id,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json(
        { error: "Customer with this name already exists" },
        { status: 409 }
      );
    throw e;
  }
}
