import { z } from "zod";

export const projectSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  customerId: z.string().min(1),
  poNumber: z.string().optional().nullable(),
  contractValue: z.coerce.number().min(0).default(0),
  startDate: z.string().optional().nullable(),
  expectedEndDate: z.string().optional().nullable(),
  scopeOfWork: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED"]).default("PLANNED"),
  progressPct: z.coerce.number().min(0).max(100).optional(),
  managerId: z.string().optional().nullable(),
});

export const siteSchema = z.object({
  name: z.string().min(1),
  projectId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  supervisorId: z.string().optional().nullable(),
  isWorkshop: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
