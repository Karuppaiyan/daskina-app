"use client";
import { useEffect, useState } from "react";

type Emp = { id: string; empCode: string; name: string };
type Adv = {
  id: string; date: string; amount: string; balance: string; deductionMode: string;
  installmentAmount: string | null; approvalStatus: string; status: string; reason: string | null;
  employee: { empCode: string; name: string };
};
const inp = "border p-2 rounded w-full";
const blank = { employeeId: "", amount: "", deductionMode: "FULL", installmentAmount: "", reason: "" };
const inr = (v: string | number) => "₹" + Number(v).toLocaleString("en-IN");

export default function AdvancesPage() {
  const [emps, setEmps] = useState<Emp[]>([]);
  const [rows, setRows] = useState<Adv[]>([]);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState("");

  async function load() {
    const [e, a] = await Promise.all([
      fetch("/api/employees").then((r) => r.json()),
      fetch("/api/advances").then((r) => r.json()),
    ]);
    if (Array.isArray(e)) setEmps(e);
    if (Array.isArray(a)) setRows(a);
  }
  useEffect(() => { load(); }, []);

  async function create(force = false) {
    const r = await fetch("/api/advances", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, force }),
    });
    const j = await r.json();
    if (r.status === 409 && j.duplicate) {
      if (window.confirm(j.error + "\n\nSave anyway?")) return create(true);
      return;
    }
    if (!r.ok) return setMsg(typeof j.error === "string" ? j.error : "Validation error");
    setMsg("Advance requested (pending owner approval)");
    setF(blank); load();
  }

  async function act(id: string, action: "approve" | "reject") {
    const r = await fetch(`/api/advances/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await r.json();
    setMsg(r.ok ? `Advance ${action}d` : j.error ?? "Error");
    load();
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Advances</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">New advance</h2>
        <div className="grid grid-cols-5 gap-2">
          <select className={inp} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">Employee</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.empCode} - {e.name}</option>)}
          </select>
          <input className={inp} placeholder="Amount (₹)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <select className={inp} value={f.deductionMode} onChange={(e) => setF({ ...f, deductionMode: e.target.value })}>
            <option value="FULL">Deduct full next payroll</option>
            <option value="INSTALLMENT">Instalments</option>
            <option value="PARTIAL">Manual (set in payroll)</option>
          </select>
          <input className={inp} placeholder="Instalment (₹)" disabled={f.deductionMode !== "INSTALLMENT"}
            value={f.installmentAmount} onChange={(e) => setF({ ...f, installmentAmount: e.target.value })} />
          <input className={inp} placeholder="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => create()}>Request advance</button>
      </section>

      <table className="w-full text-sm border">
        <thead className="bg-gray-100 text-left">
          <tr><th className="p-2">Employee</th><th>Date</th><th>Amount</th><th>Balance</th><th>Mode</th><th>Approval</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="p-2">{a.employee.empCode} {a.employee.name}</td>
              <td>{a.date.slice(0, 10)}</td><td>{inr(a.amount)}</td><td>{inr(a.balance)}</td>
              <td>{a.deductionMode}{a.installmentAmount ? ` (${inr(a.installmentAmount)})` : ""}</td>
              <td>{a.approvalStatus}</td><td>{a.status}</td>
              <td className="space-x-1">
                {a.approvalStatus === "PENDING" && (<>
                  <button className="bg-green-600 text-white px-2 py-1 rounded" onClick={() => act(a.id, "approve")}>Approve</button>
                  <button className="bg-red-600 text-white px-2 py-1 rounded" onClick={() => act(a.id, "reject")}>Reject</button>
                </>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">Only the OWNER can approve. Recovery starts at the next payroll approval after the advance is approved.</p>
    </div>
  );
}
