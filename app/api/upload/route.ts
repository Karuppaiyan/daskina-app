import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { MAX_BYTES, saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  const auth = await requireRole(
    "OWNER", "ACCOUNTS", "HR", "PROJECT_MANAGER", "SITE_SUPERVISOR", "PURCHASE_MANAGER"
  );
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file (field name: file)" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

  try {
    const saved = await saveFile(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 415 });
  }
}
