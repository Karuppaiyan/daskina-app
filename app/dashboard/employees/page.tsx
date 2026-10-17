"use client";
import { useEffect, useState } from "react";

type Site = { id: string; name: string };
type Emp = {
  id: string;
  empCode: string;
  name: string;
  phone: string | null;
  designation: string | null;
  trade: string | null;
  type: string;
  status: string;
  wageType?: string;
  wageRate?: string;
  currentSite: Site | null;
};

const inp = "border p-2 rounded w-full";
const blank = {
  name: "", phone: "", designation: "", trade: "", type: "PERMANENT",
  wageType: "DAILY", wageRate: "", otRate: "", currentSiteId: "",
};

export default function EmployeesPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [fSite, setFSite] = useState("");
  const [f, setF] = useState(blank);

  async function load() {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (fSite) qs.set("siteId", fSite);
    const [e, s] = await Promise.all([
      fetch("/api/employees?" + qs).then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
    ]);
    if (Array.isArray(e)) setEmps(e);
    if (Array.isArray(s)) setSites(s);
  }
  useEffect(() => { load(); }, [fSite]);
   
  async function create(force = false) {
    const r = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, force }),
    });
    const j = await r.json();
    if (r.status === 409 && j.duplicate) {
      if (window.confirm(j.error + "\n\nSave anyway?")) return create(true);
      return;
    }
    if (!r.ok) {
      setMsg(typeof j.error === "string" ? j.error : "Validation error");
      return;
    }
    setMsg(`Saved ${j.empCode}`);
    setF(blank);
    load();
  }

  async function transfer(id: string, siteId: string) {
    if (!siteId) return;
    const r = await fetch(`/api/employees/${id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    const j = await r.json();
    setMsg(r.ok ? "Transferred" : typeof j.error === "string" ? j.error : "Error");
    load();
  }

  const showPay = emps.some((e) => e.wageRate !== undefined);

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <h1 className="text-2xl font-semibold">Employees</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Add employee</h2>
        <div className="grid grid-cols-4 gap-2">
          <input className={inp} placeholder="Name *" value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inp} placeholder="Phone" value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={inp} placeholder="Designation" value={f.designation}
            onChange={(e) => setF({ ...f, designation: e.target.value })} />
          <input className={inp} placeholder="Trade (welder, fitter...)" value={f.trade}
            onChange={(e) => setF({ ...f, trade: e.target.value })} />
          <select className={inp} value={f.type}
            onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option>PERMANENT</option><option>CONTRACT</option><option>SUBCONTRACT</option>
          </select>
          <select className={inp} value={f.wageType}
            onChange={(e) => setF({ ...f, wageType: e.target.value })}>
            <option value="DAILY">Daily wage</option><option value="MONTHLY">Monthly salary</option>
          </select>
          <input className={inp} placeholder="Wage rate (₹)" value={f.wageRate}
            onChange={(e) => setF({ ...f, wageRate: e.target.value })} />
          <input className={inp} placeholder="OT rate / hour (₹)" value={f.otRate}
            onChange={(e) => setF({ ...f, otRate: e.target.value })} />
          <select className={inp} value={f.currentSiteId}
            onChange={(e) => setF({ ...f, currentSiteId: e.target.value })}>
            <option value="">Current site</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => create()}>
          Create employee
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex gap-2">
          <input className={inp} placeholder="Search name / code / phone" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()} />
          <select className={inp} value={fSite} onChange={(e) => setFSite(e.target.value)}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="bg-gray-700 text-white px-4 rounded" onClick={load}>Search</button>
        </div>

        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Code</th><th>Name</th><th>Phone</th><th>Trade</th>
              <th>Type</th>{showPay && <th>Wage</th>}<th>Site</th><th>Transfer to</th>
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{e.empCode}</td><td>{e.name}</td>
                <td>{e.phone ?? "-"}</td><td>{e.trade ?? "-"}</td><td>{e.type}</td>
                {showPay && (
                  <td>₹{Number(e.wageRate ?? 0).toLocaleString("en-IN")} / {e.wageType === "DAILY" ? "day" : "mo"}</td>
                )}
                <td>{e.currentSite?.name ?? "-"}</td>
                <td>
                  <select className="border p-1 rounded" defaultValue=""
                    onChange={(ev) => { transfer(e.id, ev.target.value); ev.target.value = ""; }}>
                    <option value="">Move...</option>
                    {sites.filter((s) => s.id !== e.currentSite?.id).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
