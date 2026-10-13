import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("Admin@123", 10);
  const u = await prisma.user.upsert({
    where: { email: "owner@daksina.local" },
    update: { passwordHash: hash, isActive: true, role: "OWNER" },
    create: { name: "Owner", email: "owner@daksina.local", passwordHash: hash, role: "OWNER" },
  });
  console.log("OK", u.email, u.role, u.isActive);
}

main().finally(() => prisma.$disconnect());