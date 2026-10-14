"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errText } from "@/lib/client";

const ROLES = ["OWNER", "PROJECT_MANAGER", "SITE_SUPERVISOR", "HR", "ACCOUNTS", "PURCHASE_MANAGER", "EMPLOYEE"];

type U = {
  id: string; name: string; email: string; phone: string | null; role: string; isActive: boolean;
  lastLoginAt: string | null; employee: { empCode: string; name: string } | null;
  supervisedSites: { id: string; name: string }[];
};
type Site = { id: string; name: string; supervisor: { id: string; name: string } | null };
type Emp = { id: string; empCode: string; name: string };
type Invite = { name: string; link: string; emailed: boolean };

const inp = "border p-2 rounded w-full";
const blank = { name: "", email: "", phone: "", role: "SITE_SUPERVISOR", employeeId: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(blank);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [assign, setAssign] = useState<U | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [u, s, e] = await Promise.all([api("/api/users"), api("/api/sites"), api("/api/employees")]);
    if (u.ok) setUsers(u.j as unknown as U[]);
    else setMsg(errText(u.j));
    if (s.ok) setSites(s.j as unknown as Site[]);
    if (e.ok) setEmps(e.j as unknown as Emp[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const r = await api("/api/users", "POST", f);
    if (!r.ok) return setMsg(errText(r.j));
    const j = r.j as unknown as { user: U; link: string; emailed: boolean };
    setInvite({ name: j.user.name, link: j.link, emailed: j.emailed });
    setMsg(`User ${j.user.name} created`);
    setF(blank);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    const r = await api(`/api/users/${id}`, "PATCH", body);
    setMsg(r.ok ? ok : errText(r.j));
    load();
  }

  async function resetLink(u: U) {
    const r = await api(`/api/users/${u.id}/reset-link`, "POST");
    if (!r.ok) return setMsg(errText(r.j));
    const j = r.j as unknown as Invite;
    setInvite({ name: u.name, link: j.link, emailed: j.emailed });
  }

  function openAssign(u: U) {
    setAssign(u);
    setPicked(u.supervisedSites.map((s) => s.id));
  }

  async function saveAssign() {
    if (!assign) return;
    const r = await api(`/api/users/${assign.id}/sites`, "POST", { siteIds: picked });
    setMsg(r.ok ? `Sites updated for ${assign.name}` : errText(r.j));
    if (r.ok) { setAssign(null); load(); }
  }

  return (
    <div className="space-y-6">
      <h1>Users &amp; Roles</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      {invite && (
        <section>
          <h2>Share this link with {invite.name}</h2>
          <p className="mt-2 text-sm break-all select-all">{invite.link}</p>
          <p className="mt-2 text-xs text-gray-500">
            {invite.emailed ? "Also sent by email. " : "Email was not sent (SMTP not configured). Send it yourself, for example on WhatsApp. "}
            The link is valid for 3 days and works once.
          </p>
          <div className="mt-3 space-x-2">
            <button className="bg-blue-600 text-white px-4 py-2 rounded"
              onClick={() => { navigator.clipboard.writeText(invite.link); setMsg("Link copied"); }}>Copy link</button>
            <button className="border px-4 py-2 rounded" onClick={() => setInvite(null)}>Hide</button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2>Add user</h2>
        <div className="grid grid-cols-5 gap-2">
          <input className={inp} placeholder="Full name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inp} placeholder="Email *" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className={inp} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <select className={inp} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">Link employee (optional)</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.empCode} - {e.name}</option>)}
          </select>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={create}>Create user</button>
        <p className="text-xs text-gray-500">No password is typed. The user gets a one-time link to set their own.</p>
      </section>

      <section>
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Sites (supervisors)</th><th>Last login</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td>{u.name}{u.employee ? <span className="block text-xs text-gray-500">{u.employee.empCode}</span> : null}</td>
                <td>{u.email}</td>
                <td>
                  <select className="border p-1 rounded" value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value }, "Role updated")}>
                    {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </td>
                <td>{u.isActive ? "ACTIVE" : "INACTIVE"}</td>
                <td>
                  {u.role === "SITE_SUPERVISOR" ? (
                    <>
                      {u.supervisedSites.length ? u.supervisedSites.map((s) => s.name).join(", ") : <span className="text-gray-400">none</span>}
                      {" "}<button className="text-blue-600 underline" onClick={() => openAssign(u)}>Assign</button>
                    </>
                  ) : "-"}
                </td>
                <td className="whitespace-nowrap">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "never"}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <button className="border px-2 py-1 rounded" onClick={() => resetLink(u)}>Reset link</button>
                  <button className="border px-2 py-1 rounded"
                    onClick={() => patch(u.id, { isActive: !u.isActive }, u.isActive ? "User deactivated" : "User activated")}>
                    {u.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {assign && (
        <section className="space-y-3">
          <h2>Sites supervised by {assign.name}</h2>
          <p className="text-xs text-gray-500">
            A supervisor can mark attendance, DPR, expenses and stock only for these sites, and only for today or yesterday.
            A site has one supervisor, so ticking a site that belongs to someone else moves it to {assign.name}.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {sites.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(s.id)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
                {s.name}
                {s.supervisor && s.supervisor.id !== assign.id && <span className="text-xs text-gray-500">(now {s.supervisor.name})</span>}
              </label>
            ))}
          </div>
          <div className="space-x-2">
            <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={saveAssign}>Save sites</button>
            <button className="border px-4 py-2 rounded" onClick={() => setAssign(null)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}
