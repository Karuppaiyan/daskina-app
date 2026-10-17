import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { mediaSchema } from "@/lib/dpr";
import { fileExists } from "@/lib/storage";
import { checkSiteAccess } from "@/lib/attendance-access";

type Ctx = { params: { id: string } };

// Add a photo/document to an existing DPR (file already uploaded via /api/upload)
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const parsed = mediaSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const m = parsed.data;

  const dpr = await prisma.dpr.findUnique({ where: { id: params.id } });
  if (!dpr) return NextResponse.json({ error: "DPR not found" }, { status: 404 });

  const denied = await checkSiteAccess(auth.user, dpr.siteId, dpr.date.toISOString().slice(0, 10), true);
  if (denied) return denied;

  if (!(await fileExists(m.url.split("/").pop()!)))
    return NextResponse.json({ error: "File not found, re-upload it" }, { status: 400 });

  const row = await prisma.dprMedia.create({
    data: {
      dprId: dpr.id, url: m.url, stage: m.stage,
      type: m.url.endsWith(".pdf") ? "DOCUMENT" : "PHOTO",
      uploadedById: auth.user.id,
    },
  });
  await logAudit({
    tableName: "DprMedia", recordId: row.id, action: "CREATE",
    newValue: row, userId: auth.user.id, siteId: dpr.siteId,
  });
  return NextResponse.json(row, { status: 201 });
}

// Remove a photo record (the file itself stays on disk for audit)
export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireRole("OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR");
  if ("error" in auth) return auth.error;

  const mediaId = z.string().min(1).safeParse(new URL(req.url).searchParams.get("mediaId"));
  if (!mediaId.success) return NextResponse.json({ error: "mediaId required" }, { status: 400 });

  const media = await prisma.dprMedia.findFirst({
    where: { id: mediaId.data, dprId: params.id },
    include: { dpr: true },
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const manager = auth.user.role === "OWNER" || auth.user.role === "PROJECT_MANAGER";
  if (!manager && media.uploadedById !== auth.user.id)
    return NextResponse.json({ error: "You can only remove your own uploads" }, { status: 403 });

  const denied = await checkSiteAccess(
    auth.user, media.dpr.siteId, media.dpr.date.toISOString().slice(0, 10), true
  );
  if (denied) return denied;

   // Exclude the nested dpr object from the audit log payload
  const old = { ...media, dpr: undefined };

  await prisma.dprMedia.delete({ where: { id: media.id } });
  await logAudit({
    tableName: "DprMedia", recordId: media.id, action: "DELETE",
    oldValue: old, userId: auth.user.id, siteId: media.dpr.siteId,
  });
  return NextResponse.json({ ok: true });
}
