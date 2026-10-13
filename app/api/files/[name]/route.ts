import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { readStored } from "@/lib/storage";

// Files are private: login required.
export async function GET(_: Request, { params }: { params: { name: string } }) {
  const auth = await requireRole();
  if ("error" in auth) return auth.error;

  const f = await readStored(params.name);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(f.buf), {
    headers: {
      "Content-Type": f.type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
