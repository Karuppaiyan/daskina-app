import { prisma } from "@/lib/prisma";

export async function userNames(ids: (string | null | undefined)[]) {
  const list = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!list.length) return new Map<string, string>();
  const u = await prisma.user.findMany({
    where: { id: { in: list } },
    select: { id: true, name: true },
  });
  return new Map(u.map((x) => [x.id, x.name]));
}
