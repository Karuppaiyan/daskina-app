import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

// Converts Decimal/Date to plain JSON so it can be stored in a Json column
const plain = (v: unknown) =>
  v === undefined || v === null ? undefined : JSON.parse(JSON.stringify(v));

export async function logAudit(p: {
  tableName: string;
  recordId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  userId?: string;
  siteId?: string;
  deviceId?: string;
}) {
  await prisma.auditLog.create({
    data: {
      tableName: p.tableName,
      recordId: p.recordId,
      action: p.action,
      oldValue: plain(p.oldValue),
      newValue: plain(p.newValue),
      userId: p.userId,
      siteId: p.siteId,
      deviceId: p.deviceId,
    },
  });
}
