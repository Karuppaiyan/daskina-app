import { z } from "zod";

export const ROLE_LIST = [
  "OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR", "HR", "ACCOUNTS", "PURCHASE_MANAGER", "EMPLOYEE",
] as const;

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  role: z.enum(ROLE_LIST),
  employeeId: z.string().min(1).optional(),
});

export const patchUserSchema = z
  .object({
    name: z.string().min(1).max(100),
    phone: z.string().max(30).nullable(),
    role: z.enum(ROLE_LIST),
    isActive: z.boolean(),
    employeeId: z.string().min(1).nullable(),
  })
  .partial();

// Never return or log the password hash
export function safeUser<T extends { passwordHash?: unknown }>(u: T) {
  const { passwordHash, ...rest } = u;
  void passwordHash;
  return rest;
}
