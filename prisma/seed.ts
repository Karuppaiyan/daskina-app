import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin@123", 10);

  await prisma.user.upsert({
    where: { email: "owner@daksina.local" },
    update: {},
    create: {
      name: "Owner",
      email: "owner@daksina.local",
      passwordHash,
      role: Role.OWNER,
    },
  });

  for (const lt of [
    { name: "Casual", isPaid: true, yearlyQuota: 12 },
    { name: "Sick", isPaid: true, yearlyQuota: 6 },
    { name: "Earned", isPaid: true, yearlyQuota: 15 },
    { name: "Unpaid", isPaid: false, yearlyQuota: 0 },
  ]) {
    await prisma.leaveType.upsert({
      where: { name: lt.name },
      update: {},
      create: lt,
    });
  }

  const customer = await prisma.customer.upsert({
    where: { name: "Saint-Gobain" },
    update: {},
    create: { name: "Saint-Gobain" },
  });

  const project = await prisma.project.upsert({
    where: { code: "SG-001" },
    update: {},
    create: {
      code: "SG-001",
      name: "Saint-Gobain Structural Erection",
      customerId: customer.id,
      contractValue: 5000000,
      status: "ACTIVE",
    },
  });

  const siteNames = [
    { name: "Saint-Gobain Site", projectId: project.id, isWorkshop: false },
    { name: "Workshop", projectId: null, isWorkshop: true },
  ];
  for (const s of siteNames) {
    const exists = await prisma.site.findFirst({ where: { name: s.name } });
    if (!exists) await prisma.site.create({ data: s });
  }

  console.log("Seed done. Login: owner@daksina.local / Admin@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
