import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateOnly, istDate } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const num = (v: unknown) => Number(v ?? 0);
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

async function load(money: boolean, owner: boolean) {
  const today = istDate(new Date());
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const todayDate = dateOnly(today);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));
  const none = <T,>() => Promise.resolve(null as T | null);

  const [
    sites, empBySite, attToday, dprToday, activeEmp, projects,
    expPending, advPending, payDraft, payApproved, monthExp, monthLabour,
    siteLabour, siteExp, openAdv, audit,
  ] = await Promise.all([
    prisma.site.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true, name: true, isWorkshop: true, projectId: true,
        project: { select: { code: true, status: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.employee.groupBy({
      by: ["currentSiteId"],
      where: { deletedAt: null, status: "ACTIVE", currentSiteId: { not: null } },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["siteId", "status"],
      where: { date: todayDate },
      _count: { _all: true },
    }),
    prisma.dpr.findMany({ where: { date: todayDate }, select: { siteId: true } }),
    prisma.employee.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "ON_HOLD"] } },
      select: { id: true, code: true, name: true, contractValue: true, status: true },
      orderBy: { code: "asc" },
    }),
    money
      ? prisma.expense.aggregate({
          where: { status: "PENDING", deletedAt: null },
          _count: { _all: true }, _sum: { amount: true },
        })
      : none<{ _count: { _all: number }; _sum: { amount: unknown } }>(),
    money ? prisma.advance.count({ where: { approvalStatus: "PENDING" } }) : none<number>(),
    money ? prisma.payroll.count({ where: { month: m, year: y, status: "DRAFT" } }) : none<number>(),
    money ? prisma.payroll.count({ where: { status: "APPROVED" } }) : none<number>(),
    money
      ? prisma.expense.groupBy({
          by: ["category"],
          where: { status: "APPROVED", deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
          _sum: { amount: true },
        })
      : none<{ category: string; _sum: { amount: unknown } }[]>(),
    money
      ? prisma.payrollSiteAllocation.aggregate({
          where: { payroll: { month: m, year: y } }, _sum: { amount: true },
        })
      : none<{ _sum: { amount: unknown } }>(),
    money
      ? prisma.payrollSiteAllocation.groupBy({
          by: ["siteId"],
          where: { payroll: { status: { in: ["APPROVED", "PAID"] } } },
          _sum: { amount: true },
        })
      : none<{ siteId: string; _sum: { amount: unknown } }[]>(),
    money
      ? prisma.expense.groupBy({
          by: ["siteId"],
          where: { status: "APPROVED", deletedAt: null },
          _sum: { amount: true },
        })
      : none<{ siteId: string; _sum: { amount: unknown } }[]>(),
    money
      ? prisma.advance.aggregate({
          where: { approvalStatus: "APPROVED", status: "OPEN" },
          _count: { _all: true }, _sum: { balance: true },
        })
      : none<{ _count: { _all: number }; _sum: { balance: unknown } }>(),
    owner
      ? prisma.auditLog.findMany({
          take: 10, orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        })
      : none<
          { id: string; tableName: string; action: string; createdAt: Date; user: { name: string } | null }[]
        >(),
  ]);

  // ---- attendance by site (today) ----
  const empMap = new Map(empBySite.map((e) => [e.currentSiteId!, e._count._all]));
  const attRows = sites
    .map((s) => {
      const rec = attToday.filter((a) => a.siteId === s.id);
      const c = (st: string[]) =>
        rec.filter((r) => st.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
      const emp = empMap.get(s.id) ?? 0;
      const present = c(["PRESENT", "HALF_DAY"]);
      const off = c(["ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY"]);
      return { id: s.id, name: s.name, emp, present, off, notMarked: Math.max(0, emp - present - off) };
    })
    .filter((r) => r.emp > 0 || r.present > 0 || r.off > 0);
  const presentTotal = attRows.reduce((a, r) => a + r.present, 0);

  // ---- DPR missing today (active-project sites only) ----
  const dprDone = new Set(dprToday.map((d) => d.siteId));
  const trackable = sites.filter((s) => !s.isWorkshop && s.project?.status === "ACTIVE");
  const dprMissing = trackable.filter((s) => !dprDone.has(s.id));

  // ---- project cost vs contract value ----
  const siteProject = new Map(sites.map((s) => [s.id, s.projectId ?? "none"]));
  const cost = new Map<string, { labour: number; exp: number }>();
  const bump = (siteId: string, k: "labour" | "exp", v: number) => {
    const key = siteProject.get(siteId) ?? "none";
    const c = cost.get(key) ?? { labour: 0, exp: 0 };
    c[k] += v;
    cost.set(key, c);
  };
  (siteLabour ?? []).forEach((r) => bump(r.siteId, "labour", num(r._sum.amount)));
  (siteExp ?? []).forEach((r) => bump(r.siteId, "exp", num(r._sum.amount)));
  const projRows = projects.map((p) => {
    const c = cost.get(p.id) ?? { labour: 0, exp: 0 };
    const total = c.labour + c.exp;
    const cv = num(p.contractValue);
    return { ...p, contract: cv, labour: c.labour, exp: c.exp, total, pct: cv > 0 ? (total / cv) * 100 : 0 };
  });
  const unassigned = cost.get("none");

  return {
    today, month: m, year: y, activeEmp, presentTotal, attRows, dprMissing, trackableCount: trackable.length,
    projRows, unassigned,
    pending: money
      ? {
          expCount: expPending?._count._all ?? 0,
          expSum: num(expPending?._sum.amount),
          adv: advPending ?? 0,
          payDraft: payDraft ?? 0,
          payApproved: payApproved ?? 0,
        }
      : null,
    monthLabour: num(monthLabour?._sum.amount),
    monthExpTotal: (monthExp ?? []).reduce((a, r) => a + num(r._sum.amount), 0),
    monthExp: (monthExp ?? [])
      .map((r) => ({ category: r.category, amount: num(r._sum.amount) }))
      .sort((a, b) => b.amount - a.amount),
    openAdv: money ? { count: openAdv?._count._all ?? 0, balance: num(openAdv?._sum.balance) } : null,
    audit: audit ?? [],
  };
}

function Card({ title, value, sub, href }: { title: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md sm:p-6 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="text-sm font-normal text-gray-500 dark:text-gray-400">{title}</h3>
      <span className="text-2xl font-bold leading-none text-gray-900 sm:text-3xl dark:text-white">{value}</span>
      {sub && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  const role = session?.user.role;
  const owner = role === "OWNER";
  const money = owner || role === "ACCOUNTS";
  const ops = money || role === "PROJECT_MANAGER";
  const d = ops ? await load(money, owner) : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1>Dashboard</h1>
        <p className="text-sm text-gray-500">
          Welcome back, {session?.user.name}{d ? ` · ${d.today}` : ""}
        </p>
      </div>

      {!d && <p className="text-gray-600">Use the links above to open your modules.</p>}

      {d && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card title="Present today" value={`${d.presentTotal} / ${d.activeEmp}`} sub="active employees" href="/dashboard/attendance" />
            <Card title="Active projects" value={String(d.projRows.filter((p) => p.status === "ACTIVE").length)} href="/dashboard/projects" />
            {money && <Card title={`Labour cost (${d.month}/${d.year})`} value={inr(d.monthLabour)} sub="payroll gross, all statuses" href="/dashboard/payroll" />}
            {money && <Card title={`Site expenses (${d.month}/${d.year})`} value={inr(d.monthExpTotal)} sub="approved only" href="/dashboard/expenses" />}
          </div>

          {/* Pending approvals */}
          {d.pending && (
            <section className="plain">
              <h2 className="font-semibold mb-2">Needs attention</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card title="Expenses pending approval" value={String(d.pending.expCount)} sub={inr(d.pending.expSum)} href="/dashboard/expenses" />
                <Card title="Advances pending approval" value={String(d.pending.adv)} href="/dashboard/advances" />
                <Card title="Payroll drafts (this month)" value={String(d.pending.payDraft)} sub="not yet approved" href="/dashboard/payroll" />
                <Card title="Payroll approved, unpaid" value={String(d.pending.payApproved)} href="/dashboard/payroll" />
              </div>
            </section>
          )}

          {/* Attendance + DPR */}
          <div className="grid md:grid-cols-2 gap-6">
            <section>
              <h2 className="font-semibold mb-2">Today&apos;s attendance by site</h2>
              <table className="w-full text-sm border bg-white">
                <thead className="bg-gray-100 text-left">
                  <tr><th className="p-2">Site</th><th>Staff</th><th>Present</th><th>Absent/Off</th><th>Not marked</th></tr>
                </thead>
                <tbody>
                  {d.attRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.name}</td><td>{r.emp}</td><td>{r.present}</td><td>{r.off}</td>
                      <td className={r.notMarked > 0 ? "text-red-600 font-semibold" : ""}>{r.notMarked}</td>
                    </tr>
                  ))}
                  {d.attRows.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={5}>No staff assigned to sites yet.</td></tr>}
                </tbody>
              </table>
            </section>

            <section>
              <h2 className="font-semibold mb-2">Today&apos;s DPR</h2>
              {d.trackableCount === 0 ? (
                <p className="text-sm text-gray-500">No active-project sites to track.</p>
              ) : d.dprMissing.length === 0 ? (
                <p className="text-sm text-green-700">All {d.trackableCount} site reports submitted.</p>
              ) : (
                <div className="border rounded p-3 bg-white text-sm">
                  <p className="mb-1">
                    <b>{d.trackableCount - d.dprMissing.length}</b> of {d.trackableCount} submitted. Missing:
                  </p>
                  <ul className="list-disc ml-6">
                    {d.dprMissing.map((s) => <li key={s.id}>{s.name} {s.project ? `(${s.project.code})` : ""}</li>)}
                  </ul>
                  <Link className="text-blue-600 underline" href="/dashboard/dpr">Open DPR</Link>
                </div>
              )}
            </section>
          </div>

          {/* Money */}
          {money && (
            <>
              <section>
                <h2 className="font-semibold mb-2">Project cost vs contract value (approved/paid, all time)</h2>
                <table className="w-full text-sm border bg-white">
                  <thead className="bg-gray-100 text-left">
                    <tr><th className="p-2">Project</th><th>Contract</th><th>Labour</th><th>Expenses</th><th>Total cost</th><th className="w-48">% of contract</th></tr>
                  </thead>
                  <tbody>
                    {d.projRows.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.code} {p.name}{p.status === "ON_HOLD" ? " (on hold)" : ""}</td>
                        <td>{inr(p.contract)}</td><td>{inr(p.labour)}</td><td>{inr(p.exp)}</td>
                        <td className="font-semibold">{inr(p.total)}</td>
                        <td>
                          <div className="h-2 bg-gray-200 rounded">
                            <div
                              className={"h-2 rounded " + (p.pct > 90 ? "bg-red-600" : p.pct > 70 ? "bg-orange-500" : "bg-green-600")}
                              style={{ width: `${Math.min(100, p.pct)}%` }}
                            />
                          </div>
                          <span className="text-xs">{p.contract > 0 ? p.pct.toFixed(1) + "%" : "no contract value"}</span>
                        </td>
                      </tr>
                    ))}
                    {d.unassigned && (
                      <tr className="border-t text-gray-600">
                        <td className="p-2">Workshop / unassigned sites</td><td>-</td>
                        <td>{inr(d.unassigned.labour)}</td><td>{inr(d.unassigned.exp)}</td>
                        <td className="font-semibold">{inr(d.unassigned.labour + d.unassigned.exp)}</td><td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-1">Labour = approved/paid payroll gross split by site attendance. Billing and income arrive in Phase 3.</p>
              </section>

              <div className="grid md:grid-cols-2 gap-6">
                <section>
                  <h2 className="font-semibold mb-2">This month&apos;s expenses by category</h2>
                  <table className="w-full text-sm border bg-white">
                    <tbody>
                      {d.monthExp.map((e) => (
                        <tr key={e.category} className="border-t first:border-t-0">
                          <td className="p-2">{e.category}</td><td className="text-right p-2">{inr(e.amount)}</td>
                        </tr>
                      ))}
                      {d.monthExp.length === 0 && <tr><td className="p-2 text-gray-500">No approved expenses this month.</td></tr>}
                    </tbody>
                  </table>
                </section>
                {d.openAdv && (
                  <section className="plain">
                    <h2 className="font-semibold mb-2">Advances outstanding</h2>
                    <Card title="Open approved advances" value={inr(d.openAdv.balance)} sub={`${d.openAdv.count} advance(s) not yet recovered`} href="/dashboard/advances" />
                  </section>
                )}
              </div>
            </>
          )}

          {/* Recent activity (owner only) */}
          {owner && (
            <section>
              <h2 className="font-semibold mb-2">Recent activity</h2>
              <table className="w-full text-sm border bg-white">
                <tbody>
                  {d.audit.map((a) => (
                    <tr key={a.id} className="border-t first:border-t-0">
                      <td className="p-2 whitespace-nowrap">
                        {a.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td>{a.user?.name ?? "Device / system"}</td><td>{a.action}</td><td>{a.tableName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
