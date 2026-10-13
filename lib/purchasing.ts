import { z } from "zod";
import { r2 } from "@/lib/payroll";

export const r3 = (n: number) => Math.round(n * 1000) / 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const supplierSchema = z.object({
  name: z.string().min(1).max(150),
  contactPerson: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  gstin: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  products: z.string().max(300).optional(),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
});

export const materialSchema = z.object({
  name: z.string().min(1).max(150),
  spec: z.string().max(200).optional(),
  unit: z.string().min(1).max(20),
  minStock: z.coerce.number().min(0).optional(),
});

export const quotationSchema = z.object({
  materialId: z.string().min(1),
  supplierId: z.string().min(1),
  date: z.string().regex(DATE).optional(),
  qty: z.coerce.number().positive().default(1),
  basicRate: z.coerce.number().positive(),
  transport: z.coerce.number().min(0).default(0),
  gstPct: z.coerce.number().min(0).max(100).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  validUntil: z.string().regex(DATE).optional(),
  remarks: z.string().max(300).optional(),
});

export const poSchema = z.object({
  supplierId: z.string().min(1),
  siteId: z.string().min(1),
  date: z.string().regex(DATE).optional(),
  expectedDate: z.string().regex(DATE).optional(),
  transport: z.coerce.number().min(0).default(0),
  otherCharges: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        materialId: z.string().min(1),
        qty: z.coerce.number().positive(),
        rate: z.coerce.number().positive(),
        gstPct: z.coerce.number().min(0).max(100).default(0),
      })
    )
    .min(1)
    .max(100),
});

// Actual per-unit cost: basic + GST + (transport + other) spread over the quoted qty
export const landedPerUnit = (q: {
  basicRate: number; gstPct: number; transport: number; otherCharges: number; qty: number;
}) => r2(q.basicRate * (1 + q.gstPct / 100) + (q.transport + q.otherCharges) / q.qty);

export const poTotal = (
  items: { qty: number; rate: number; gstPct: number }[],
  transport: number,
  other: number
) => r2(items.reduce((a, i) => a + i.qty * i.rate * (1 + i.gstPct / 100), 0) + transport + other);
