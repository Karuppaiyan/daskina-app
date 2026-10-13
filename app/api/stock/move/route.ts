import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { clean } from "@/lib/employee";
import { dateOnly, istDate } from "@/lib/attendance";
import { checkSiteAccess } from "@/lib/attendance-access";

const schema = z.object({
  siteId: z.string().min(1),
  materialId: z.string().min(1),
  type: z.enum(["ISSUE", "RETURN", "TRANSFER", "ADJUSTMENT"]),
  qty: z.coerce.number().refine((n) => n !== 0, "Quantity cannot be 0"),
  toSiteId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  remarks: z.string().max(300).optional(),
  override: z.boolean().optional(),
  force: z.boolean().optional(),
});

async function balanceOf(tx: Prisma.TransactionClient, siteId: string, materialId: string) {
  const a = await tx.stockMovement.aggregate({ where: { siteId, materialId }, _sum: { qty: true } });
  return Number(a._sum.qty ?? 0);
}

type Result =
  | { insufficient: true; available: number }
  | { insufficient?: false; rows: { id: string; siteId: string }[] };

export async function POST(req: Request) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const parsed = schema.safeParse(clean(await req.json()));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const date = d.date ?? istDate(new Date());
  if (date > istDate(new Date()))
    return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 });

  if (d.type !== "ADJUSTMENT" && d.qty < 0)
    return NextResponse.json({ error: "Quantity must be positive" }, { status: 400 });
  if (d.type === "ADJUSTMENT") {
    if (user.role !== "OWNER")
      return NextResponse.json({ error: "Only OWNER can post stock adjustments" }, { status: 403 });
    if (!d.remarks)
      return NextResponse.json({ error: "Adjustments need a reason in remarks" }, { status: 400 });
  }
  if (d.type === "TRANSFER" && (!d.toSiteId || d.toSiteId === d.siteId))
    return NextResponse.json({ error: "Pick a different destination site" }, { status: 400 });

  const canOverride = user.role === "OWNER" || user.role === "PROJECT_MANAGER";
  if (d.override) {
    if (!canOverride)
      return NextResponse.json({ error: "Only OWNER or PROJECT_MANAGER can authorize issue beyond stock" }, { status: 403 });
    if (!d.remarks)
      return NextResponse.json({ error: "Authorizing beyond stock needs a reason in remarks" }, { status: 400 });
  }

  const denied = await checkSiteAccess(user, d.siteId, date, true);
  if (denied) return denied;

  const [site, toSite, mat] = await Promise.all([
    prisma.site.findFirst({ where: { id: d.siteId, deletedAt: null } }),
    d.toSiteId ? prisma.site.findFirst({ where: { id: d.toSiteId, deletedAt: null } }) : Promise.resolve(null),
    prisma.material.findFirst({ where: { id: d.materialId, deletedAt: null } }),
  ]);
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  if (d.type === "TRANSFER" && !toSite)
    return NextResponse.json({ error: "Destination site not found" }, { status: 404 });
  if (!mat) return NextResponse.json({ error: "Material not found" }, { status: 404 });

  // Duplicate issue warning (same user, site, material, qty, date within 10 minutes)
  if (d.type === "ISSUE" && !d.force) {
    const dup = await prisma.stockMovement.findFirst({
      where: {
        siteId: d.siteId, materialId: d.materialId, type: "ISSUE", qty: -d.qty,
        date: dateOnly(date), createdById: user.id,
        createdAt: { gte: new Date(Date.now() - 10 * 60000) },
      },
    });
    if (dup)
      return NextResponse.json(
        { duplicate: true, error: "An identical issue was posted in the last 10 minutes" },
        { status: 409 }
      );
  }

  const last = await prisma.stockMovement.findFirst({
    where: { materialId: d.materialId, type: "RECEIPT" },
    orderBy: { createdAt: "desc" }, select: { rate: true },
  });
  const rate = last?.rate ?? null;

  async function run(): Promise<Result> {
    return prisma.$transaction(
      async (tx) => {
        const bal = await balanceOf(tx, d.siteId, d.materialId);
        const outflow = d.type === "ISSUE" || d.type === "TRANSFER" || (d.type === "ADJUSTMENT" && d.qty < 0);
        const need = d.type === "ADJUSTMENT" ? -d.qty : d.qty;

        let authorizedById: string | undefined;
        if (outflow && bal < need - 0.0005) {
          // adjustments can never push stock negative; issues/transfers need an authorized override
          if (d.type === "ADJUSTMENT" || !(d.override && canOverride))
            return { insufficient: true, available: bal };
          authorizedById = user.id;
        }

        const base = {
          materialId: d.materialId, date: dateOnly(date), remarks: d.remarks,
          createdById: user.id, authorizedById,
        };
        const rows: { id: string; siteId: string }[] = [];

        if (d.type === "ISSUE") {
          rows.push(await tx.stockMovement.create({ data: { ...base, siteId: d.siteId, type: "ISSUE", qty: -d.qty, rate } }));
        } else if (d.type === "RETURN") {
          rows.push(await tx.stockMovement.create({ data: { ...base, siteId: d.siteId, type: "RETURN", qty: d.qty, rate } }));
        } else if (d.type === "ADJUSTMENT") {
          rows.push(await tx.stockMovement.create({ data: { ...base, siteId: d.siteId, type: "ADJUSTMENT", qty: d.qty } }));
        } else {
          const ref = randomUUID();
          rows.push(await tx.stockMovement.create({
            data: { ...base, siteId: d.siteId, type: "TRANSFER_OUT", qty: -d.qty, rate, refType: "TRANSFER", refId: ref },
          }));
          rows.push(await tx.stockMovement.create({
            data: { ...base, authorizedById: undefined, siteId: d.toSiteId!, type: "TRANSFER_IN", qty: d.qty, rate, refType: "TRANSFER", refId: ref },
          }));
        }
        return { rows };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  let result: Result;
  try {
    result = await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") result = await run(); // serialization conflict, retry once
    else throw e;
  }

  if (result.insufficient)
    return NextResponse.json(
      {
        insufficient: true, available: result.available,
        error: `Only ${result.available} ${mat.unit} of ${mat.name} available at ${site.name}`,
      },
      { status: 409 }
    );

  for (const r of result.rows)
    await logAudit({
      tableName: "StockMovement", recordId: r.id, action: "CREATE",
      newValue: r, userId: user.id, siteId: r.siteId,
    });
  return NextResponse.json({ ok: true, created: result.rows.length }, { status: 201 });
}
