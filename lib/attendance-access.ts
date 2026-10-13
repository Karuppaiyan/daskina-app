import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { istDate } from "@/lib/attendance";

// Site supervisors: own site only, and (for edits) today/yesterday only.
export async function checkSiteAccess(
  user: { id: string; role: Role },
  siteId: string,
  day: string,
  enforceDay: boolean
) {
  if (user.role !== "SITE_SUPERVISOR") return null;
  const site = await prisma.site.findFirst({
    where: { id: siteId, supervisorId: user.id, deletedAt: null },
  });
  if (!site)
    return NextResponse.json(
      { error: "You are not the supervisor of this site" },
      { status: 403 }
    );
  if (enforceDay) {
    const today = istDate(new Date());
    const yest = istDate(new Date(Date.now() - 86400000));
    if (day !== today && day !== yest)
      return NextResponse.json(
        { error: "Supervisors can only edit today or yesterday" },
        { status: 403 }
      );
  }
  return null;
}
