import { z } from "zod";

export const CATEGORIES = [
  "LABOUR", "DIESEL", "MATERIAL", "TRANSPORT", "EQUIPMENT", "FOOD",
  "ACCOMMODATION", "REPAIRS", "PETTY_CASH", "SUBCONTRACTOR", "OTHER",
] as const;

export const expenseSchema = z.object({
  siteId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(CATEGORIES),
  description: z.string().max(500).optional(),
  amount: z.coerce.number().positive().max(100000000),
  spentById: z.string().optional(),
  paymentMethod: z.enum(["CASH", "BANK", "UPI", "CARD", "CHEQUE"]).default("CASH"),
  receiptUrl: z.string().regex(/^\/api\/files\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/).optional(),
});
