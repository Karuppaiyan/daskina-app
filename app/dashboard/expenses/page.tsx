"use client";
import { useCallback, useEffect, useState } from "react";
import { istDate } from "@/lib/attendance";
import { CATEGORIES } from "@/lib/expense";

type Site = { id: string; name: string };
type Emp = { id: string; empCode: string; name: string };
type Exp = {
  id: string; date: string; category: string; description: string | null; amount: string;
  paymentMethod: string; receiptUrl: string | null; status: string;
  site: Site; spentBy: { empCode: string; name: string } | null; createdBy: { name: string };
};

const inp = "border p-2 rounded w-full";
const inr = (v: string | number) => "₹" + Number(v).toLocaleString("en-IN");
const today = istDate(new Date());
const blank = {
  siteId: "", date: today, category: "MATERIAL", amount: "", paymentMethod: "CASH",
  description: "", spentById: "", receiptUrl: "",
};

export default function ExpensesPage() {
  const [role, setRole] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [rows, setRows] = useState<Exp[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(blank);
  const [fileName, setFileName] = useState("");
  const [flt, setFlt] = useState({ siteId: "", status: "", from: today.slice(0, 8) + "01", to: today });

  useEffect(() => {
    fetch("/api/auth/session").then((r) => r.json()).then((s) => setRole(s?.user?.role ?? ""));
    fetch("/api/sites").then((r) => r.json()).then((s) => Array.isArray(s) && setSites(s));
    fetch("/api/employees").then((r) => r.json()).then((e) => Array.isArray(e) && setEmps(e));
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    Object.entries(flt).forEach(([k, v]) => v && qs.set(k, v));
    const r = await fetch("/api/expenses?" + qs);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Error");
    setRows(j.rows); setTotals(j.totals);
  }, [flt]);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Upload failed");
    setF((x) => ({ ...x, receiptUrl: j.url }));
    setFileName(file.name);
  }

  async function create(force = false) {
    const r = await fetch("/api/expenses", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, force }),
    });
    const j = await r.json();
    if (r.status === 409 && j.duplicate) {
      if (window.confirm(j.error + "\n\nSave anyway?")) return create(true);
      return;
    }
    if (!r.ok) return setMsg(typeof j.error === "string" ? j.error : "Validation error");
    setMsg(j.status === "APPROVED" ? "Saved (auto-approved)" : "Saved, pending approval");
    setF({ ...blank, siteId: f.siteId }); setFileName(""); load();
  }

  async function act(id: string, action: "approve" | "reject") {
    const r = await fetch(`/api/expenses/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await r.json();
    setMsg(r.ok ? `Expense ${action}d` : j.error ?? "Error");
    load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    const r = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    const j = await r.json();
    setMsg(r.ok ? "Deleted" : j.error ?? "Error");
    load();
  }

  const finance = role === "OWNER" || role === "ACCOUNTS";

  return (
    <div className="p-8 space-y-6 max-w-full">
      <h1 className="text-2xl font-semibold">Site Expenses</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Add expense</h2>
        <div className="grid grid-cols-4 gap-2">
          <select className={inp} value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
            <option value="">Site *</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" className={inp} value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={inp} placeholder="Amount (₹) *" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <select className={inp} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {["CASH", "BANK", "UPI", "CARD", "CHEQUE"].map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className={inp} value={f.spentById} onChange={(e) => setF({ ...f, spentById: e.target.value })}>
            <option value="">Spent by (optional)</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.empCode} - {e.name}</option>)}
          </select>
          <input className={inp + " col-span-2"} placeholder="Description" value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="flex items-center gap-3">
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {fileName && <span className="text-sm text-green-700">Receipt attached: {fileName}</span>}
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => create()}>Save expense</button>
      </section>

      <section className="space-y-2">
        <div className="flex gap-2 items-center flex-wrap">
          <select className="border p-2 rounded" value={flt.siteId} onChange={(e) => setFlt({ ...flt, siteId: e.target.value })}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="border p-2 rounded" value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}>
            <option value="">All status</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option>
          </select>
          <input type="date" className="border p-2 rounded" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} />
          <input type="date" className="border p-2 rounded" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} />
          <span className="text-sm ml-4">
            Approved <b>{inr(totals.APPROVED ?? 0)}</b> · Pending <b>{inr(totals.PENDING ?? 0)}</b>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-left">
              <tr><th className="p-2">Date</th><th>Site</th><th>Category</th><th>Description</th><th>Amount</th>
                <th>Method</th><th>Spent by</th><th>Receipt</th><th>Entered by</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-t">
                  <td className="p-2">{x.date.slice(0, 10)}</td><td>{x.site.name}</td><td>{x.category}</td>
                  <td>{x.description ?? "-"}</td><td>{inr(x.amount)}</td><td>{x.paymentMethod}</td>
                  <td>{x.spentBy ? `${x.spentBy.empCode} ${x.spentBy.name}` : "-"}</td>
                  <td>{x.receiptUrl ? <a className="text-blue-600 underline" href={x.receiptUrl} target="_blank">View</a> : "-"}</td>
                  <td>{x.createdBy.name}</td><td>{x.status}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    {x.status === "PENDING" && finance && (<>
                      <button className="bg-green-600 text-white px-2 py-1 rounded" onClick={() => act(x.id, "approve")}>Approve</button>
                      <button className="bg-red-600 text-white px-2 py-1 rounded" onClick={() => act(x.id, "reject")}>Reject</button>
                    </>)}
                    {role === "OWNER" && <button className="border px-2 py-1 rounded" onClick={() => remove(x.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
