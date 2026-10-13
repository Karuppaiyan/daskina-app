import { z } from "zod";
import type { Role } from "@prisma/client";

export const PAY_VIEW_ROLES: Role[] = ["OWNER", "HR", "ACCOUNTS"];

export const employeeSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  designation: z.string().optional(),
  trade: z.string().optional(),
  type: z.enum(["PERMANENT", "CONTRACT", "SUBCONTRACT"]).default("PERMANENT"),
  status: z.enum(["ACTIVE", "INACTIVE", "TERMINATED"]).optional(),
  joiningDate: z.string().optional(),
  currentSiteId: z.string().optional(),
  supervisorId: z.string().optional(),
  wageType: z.enum(["DAILY", "MONTHLY"]).default("DAILY"),
  wageRate: z.coerce.number().min(0).default(0),
  regularHours: z.coerce.number().min(0).max(24).default(8),
  otRate: z.coerce.number().min(0).default(0),
  holidayRate: z.coerce.number().min(0).optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifsc: z.string().optional(),
  faceId: z.string().optional(),
});

// Drop empty strings / nulls so optional fields validate cleanly
export function clean(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined
    )
  );
}

const SENSITIVE = [
  "wageType", "wageRate", "regularHours", "otRate", "holidayRate",
  "bankName", "accountNumber", "ifsc", "faceId",
];

// Pay/bank/biometric data only for OWNER, HR, ACCOUNTS
export function stripPay<T extends object>(row: T, role: Role): Partial<T> {
  if (PAY_VIEW_ROLES.includes(role)) return row;
  const copy = { ...row } as Record<string, unknown>;
  for (const k of SENSITIVE) delete copy[k];
  return copy as Partial<T>;
}

export function p2002Target(e: { meta?: unknown }): string {
  const t = (e.meta as { target?: string | string[] } | undefined)?.target;
  return Array.isArray(t) ? t.join(",") : t ?? "";
}
