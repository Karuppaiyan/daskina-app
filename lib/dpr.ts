import { z } from "zod";

export const URL_RE = /^\/api\/files\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export const mediaSchema = z.object({
  url: z.string().regex(URL_RE),
  stage: z.enum(["BEFORE", "DURING", "COMPLETED"]).default("DURING"),
});

const text = z.string().max(2000).optional();

export const dprSchema = z.object({
  siteId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workItems: z
    .array(
      z.object({
        item: z.string().min(1).max(300),
        qty: z.coerce.number().optional(),
        unit: z.string().max(20).optional(),
        area: z.string().max(100).optional(),
      })
    )
    .min(1)
    .max(50),
  manpowerCount: z.coerce.number().int().min(0).max(5000).optional(),
  equipmentUsed: z
    .array(z.object({ name: z.string().min(1).max(100), hours: z.coerce.number().min(0).max(24).optional() }))
    .max(50)
    .optional(),
  materialsUsed: z
    .array(z.object({ name: z.string().min(1).max(100), qty: z.coerce.number().optional(), unit: z.string().max(20).optional() }))
    .max(50)
    .optional(),
  delays: text,
  delayReason: text,
  safetyIssues: text,
  tomorrowPlan: text,
  media: z.array(mediaSchema).max(30).optional(),
});
