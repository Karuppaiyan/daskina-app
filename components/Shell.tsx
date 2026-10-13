"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; icon: React.ReactNode; roles?: string[] };

const Ico = ({ children }: { children: React.ReactNode }) => (
  <svg
    className="w-5 h-5 text-gray-500 transition duration-75 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
  >
    {children}
  </svg>
);

const ICONS = {
  dashboard: <Ico><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Ico>,
  projects: <Ico><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" /><path d="M14 9h5a1 1 0 0 1 1 1v11" /><path d="M8 8h2M8 12h2M8 16h2" /><path d="M3 21h18" /></Ico>,
  employees: <Ico><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.8 0 4.5 1.9 4.5 4.5" /></Ico>,
  attendance: <Ico><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></Ico>,
  dpr: <Ico><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h6" /></Ico>,
  payroll: <Ico><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 10v.01M18 14v.01" /></Ico>,
  advances: <Ico><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8 13l4 4 4-4" /></Ico>,
  expenses: <Ico><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Ico>,
  suppliers: <Ico><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 4v3h-8z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></Ico>,
  orders: <Ico><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" /></Ico>,
  stock: <Ico><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></Ico>,
};

const NAV: { group: string; items: Item[] }[] = [
  {
    group: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
      { href: "/dashboard/projects", label: "Projects & Sites", icon: ICONS.projects, roles: ["OWNER", "PROJECT_MANAGER", "ACCOUNTS", "HR", "SITE_SUPERVISOR", "PURCHASE_MANAGER"] },
      { href: "/dashboard/employees", label: "Employees", icon: ICONS.employees, roles: ["OWNER", "HR", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"] },
      { href: "/dashboard/attendance", label: "Attendance", icon: ICONS.attendance, roles: ["OWNER", "HR", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"] },
      { href: "/dashboard/dpr", label: "Daily Progress (DPR)", icon: ICONS.dpr, roles: ["OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS"] },
    ],
  },
  {
    group: "Finance",
    items: [
      { href: "/dashboard/payroll", label: "Payroll", icon: ICONS.payroll, roles: ["OWNER", "ACCOUNTS", "HR"] },
      { href: "/dashboard/advances", label: "Advances", icon: ICONS.advances, roles: ["OWNER", "ACCOUNTS", "HR", "PROJECT_MANAGER"] },
      { href: "/dashboard/expenses", label: "Site Expenses", icon: ICONS.expenses, roles: ["OWNER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR", "PURCHASE_MANAGER"] },
    ],
  },
  {
    group: "Purchasing & Stock",
    items: [
      { href: "/dashboard/suppliers", label: "Suppliers & Materials", icon: ICONS.suppliers, roles: ["OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER"] },
      { href: "/dashboard/purchase-orders", label: "Purchase Orders", icon: ICONS.orders, roles: ["OWNER", "PURCHASE_MANAGER", "ACCOUNTS", "PROJECT_MANAGER", "SITE_SUPERVISOR"] },
      { href: "/dashboard/stock", label: "Stock", icon: ICONS.stock, roles: ["OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "SITE_SUPERVISOR", "ACCOUNTS"] },
    ],
  },
];

// table-cell text -> colour class (applied as a data attribute so React is not disturbed)
const STATUS: Record<string, string> = {
  PENDING: "warn", PARTIAL: "warn", HALF_DAY: "warn", ON_HOLD: "warn",
  APPROVED: "ok", RECEIVED: "ok", PAID: "ok", PRESENT: "ok", ACTIVE: "ok", COMPLETED: "ok",
  REJECTED: "bad", CANCELLED: "bad", ABSENT: "bad", TERMINATED: "bad",
  ISSUED: "info", OPEN: "info", LEAVE: "info",
  DRAFT: "gray", CLOSED: "gray", INACTIVE: "gray", PLANNED: "gray", WEEKLY_OFF: "gray", HOLIDAY: "gray",
};

export default function Shell({ name, role, children }: { name: string; role: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  useEffect(() => { setOpen(false); setMenu(false); }, [path]);

  useEffect(() => {
    const root = document.getElementById("app-main");
    if (!root) return;
    const run = () => {
      root.querySelectorAll("td").forEach((td) => {
        const k = STATUS[(td.textContent || "").trim()];
        if (k) { if (td.getAttribute("data-status") !== k) td.setAttribute("data-status", k); }
        else if (td.hasAttribute("data-status")) td.removeAttribute("data-status");
      });
    };
    run();
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }

  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
  const active = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));

  return (
    <div className="min-h-screen">
      {/* top navbar */}
      <nav className="fixed z-30 w-full bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="px-3 py-3 lg:px-5 lg:pl-3 flex items-center justify-between">
          <div className="flex items-center">
            <button
              aria-label="Toggle sidebar" onClick={() => setOpen(!open)}
              className="p-2 mr-2 text-gray-600 rounded cursor-pointer lg:hidden hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
            </button>
            <Link href="/dashboard" className="flex items-center">
              <span className="flex items-center justify-center w-8 h-8 mr-3 text-lg font-bold text-white rounded-lg bg-primary-700">D</span>
              <span className="self-center text-xl font-bold whitespace-nowrap sm:text-2xl dark:text-white">Daksina ERP</span>
            </Link>
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label="Toggle dark mode" onClick={toggleDark}
              className="p-2 text-gray-500 rounded-lg hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              {dark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>

            <div className="relative ml-2">
              <button
                aria-label="User menu" onClick={() => setMenu(!menu)}
                className="flex items-center justify-center w-8 h-8 text-sm font-semibold text-white rounded-full bg-primary-600 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
              >
                {initials}
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-50 w-56 mt-2 overflow-hidden bg-white border border-gray-100 rounded-lg shadow-lg dark:bg-gray-700 dark:border-gray-600">
                    <div className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{name}</p>
                      <p className="text-sm text-gray-500 truncate dark:text-gray-400">{role.replace(/_/g, " ")}</p>
                    </div>
                    <div className="border-t border-gray-100 dark:border-gray-600">
                      <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="block w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="flex pt-16 overflow-hidden">
        {/* sidebar */}
        {open && <div className="fixed inset-0 z-10 bg-gray-900/50 lg:hidden" onClick={() => setOpen(false)} />}
        <aside className={`${open ? "flex" : "hidden"} fixed top-0 left-0 z-20 flex-col w-64 h-full pt-16 lg:flex`}>
          <div className="relative flex flex-col flex-1 min-h-0 overflow-y-auto bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
            <div className="flex-1 px-3 pt-4 pb-4">
              {NAV.map((g) => {
                const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
                if (!items.length) return null;
                return (
                  <div key={g.group} className="mb-4">
                    <p className="px-2 mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">{g.group}</p>
                    <ul className="space-y-1">
                      {items.map((i) => (
                        <li key={i.href}>
                          <Link
                            href={i.href}
                            className={`flex items-center p-2 text-sm rounded-lg group ${
                              active(i.href)
                                ? "bg-gray-100 text-gray-900 font-semibold dark:bg-gray-700 dark:text-white"
                                : "text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                            }`}
                          >
                            {i.icon}
                            <span className="ml-3">{i.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="p-4 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700 dark:text-gray-400">
              Signed in as <span className="font-semibold">{role.replace(/_/g, " ")}</span>
            </div>
          </div>
        </aside>

        {/* content */}
        <div className="relative w-full min-w-0 h-full overflow-y-auto lg:ml-64">
          <main id="app-main" className="p-4 sm:p-6">{children}</main>
          <p className="p-4 text-xs text-center text-gray-500 dark:text-gray-400">
            © Daksina Techno Fab &amp; Engineering Contractor
          </p>
        </div>
      </div>
    </div>
  );
}
