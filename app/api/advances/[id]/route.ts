import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["approve", "reject"]) });

// Only OWNER approves advances. Recovery starts only after approval.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole("OWNER");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const old = await prisma.advance.findUnique({ where: { id: params.id } });
  if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (old.approvalStatus !== "PENDING")
    return NextResponse.json({ error: `Already ${old.approvalStatus}` }, { status: 409 });

  const approve = parsed.data.action === "approve";
  const row = await prisma.advance.update({
    where: { id: params.id },
    data: {
      approvalStatus: approve ? "APPROVED" : "REJECTED",
      approvedById: auth.user.id,
      status: approve ? "OPEN" : "CLOSED",
    },
  });
  await logAudit({
    tableName: "Advance", recordId: row.id, action: "UPDATE", oldValue: old, newValue: row, userId: auth.user.id,
  });
  return NextResponse.json(row);
}
