"use client";
import { useCallback, useEffect, useState } from "react";
import { istDate } from "@/lib/attendance";

type Row = {
  id: string; status: string; presentDays: string; absentDays: string; leaveDays: string;
  otHours: string; basicPay: string; otPay: string; otherEarnings: string; grossPay: string;
  advanceDeduction: string; otherDeductions: string; netPay: string;
  employee: { empCode: string; name: string; wageType: string };
};
type SiteCost = { siteId: string; site: string; project: string | null; amount: string | null; days: string | null; hours: string | null };

const inr = (v: string | number | null) => "₹" + Number(v ?? 0).toLocaleString("en-IN");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function Line({ row, onDone, onMsg }: { row: Row; onDone: () => void; onMsg: (m: string) => void }) {
  const [oe, setOe] = useState(row.otherEarnings);
  const [od, setOd] = useState(row.otherDeductions);
  const [ad, setAd] = useState(row.advanceDeduction);
  const draft = row.status === "DRAFT";
  const small = "border p-1 rounded w-20";

  async function save() {
    const r = await fetch(`/api/payroll/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherEarnings: oe, otherDeductions: od, advanceDeduction: ad }),
    });
    const j = await r.json();
    onMsg(r.ok ? `Saved ${row.employee.name}` : typeof j.error === "string" ? j.error : "Error");
    onDone();
  }

  return (
    <tr className="border-t">
      <td className="p-2">{row.employee.empCode}</td><td>{row.employee.name}</td>
      <td>{row.presentDays}/{row.absentDays}/{row.leaveDays}</td><td>{row.otHours}</td>
      <td>{inr(row.basicPay)}</td><td>{inr(row.otPay)}</td>
      <td>{draft ? <input className={small} value={oe} onChange={(e) => setOe(e.target.value)} /> : inr(row.otherEarnings)}</td>
      <td>{inr(row.grossPay)}</td>
      <td>{draft ? <input className={small} value={ad} onChange={(e) => setAd(e.target.value)} /> : inr(row.advanceDeduction)}</td>
      <td>{draft ? <input className={small} value={od} onChange={(e) => setOd(e.target.value)} /> : inr(row.otherDeductions)}</td>
      <td className="font-semibold">{inr(row.netPay)}</td>
      <td className="text-xs">{row.status}</td>
      <td>{draft && <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={save}>Save</button>}</td>
    </tr>
  );
}

export default function PayrollPage() {
  const now = istDate(new Date());
  const [month, setMonth] = useState(Number(now.slice(5, 7)));
  const [year, setYear] = useState(Number(now.slice(0, 4)));
  const [rows, setRows] = useState<Row[]>([]);
  const [siteCost, setSiteCost] = useState<SiteCost[]>([]);
  const [method, setMethod] = useState("BANK");
  const [msg, setMsg] = useState("");
  const [noRec, setNoRec] = useState<{ empCode: string; name: string; days: number }[]>([]);

  const load = useCallback(async () => {
    const r = await fetch(`/api/payroll?month=${month}&year=${year}`);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Error");
    setRows(j.rows); setSiteCost(j.siteCost);
  }, [month, year]);
  useEffect(() => { load(); }, [load]);

  async function run(action: "generate" | "approve" | "pay") {
    if (action !== "generate" && !window.confirm(`${action === "approve" ? "Approve (locks rows, recovers advances)" : "Mark all approved rows as PAID"} for ${MONTHS[month - 1]} ${year}?`)) return;
    const r = await fetch("/api/payroll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year, action, paymentMethod: method }),
    });
    const j = await r.json();
    if (!r.ok) setMsg(typeof j.error === "string" ? j.error : "Error");
    else {
      setMsg(JSON.stringify({ ...j, noRecords: undefined }));
      setNoRec(j.noRecords ?? []);
    }
    load();
  }

  const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number(r[k]), 0);

  return (
    <div className="p-8 space-y-4 max-w-full">
      <h1 className="text-2xl font-semibold">Payroll</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded break-all">{msg}</p>}

      <div className="flex gap-2 items-center flex-wrap">
        <select className="border p-2 rounded" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input className="border p-2 rounded w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        <button className="bg-gray-700 text-white px-3 py-2 rounded" onClick={() => run("generate")}>Generate / refresh drafts</button>
        <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={() => run("approve")}>Approve all drafts</button>
        <select className="border p-2 rounded" value={method} onChange={(e) => setMethod(e.target.value)}>
          {["BANK", "CASH", "UPI", "CHEQUE", "CARD"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <button className="bg-purple-600 text-white px-3 py-2 rounded" onClick={() => run("pay")}>Mark approved as paid</button>
      </div>

      {noRec.length > 0 && (
        <details className="text-sm bg-orange-50 p-2 rounded">
          <summary>{noRec.length} employees have days with no attendance record (counted unpaid for daily wage)</summary>
          <ul className="list-disc ml-6">{noRec.map((n) => <li key={n.empCode}>{n.empCode} {n.name}: {n.days} days</li>)}</ul>
        </details>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Code</th><th>Name</th><th>P/A/L days</th><th>OT h</th><th>Basic</th><th>OT pay</th>
              <th>Other +</th><th>Gross</th><th>Advance −</th><th>Other −</th><th>Net</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <Line key={r.id + r.netPay + r.status} row={r} onDone={load} onMsg={setMsg} />)}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr><td className="p-2" colSpan={7}>Total ({rows.length})</td><td>{inr(sum("grossPay"))}</td>
              <td>{inr(sum("advanceDeduction"))}</td><td>{inr(sum("otherDeductions"))}</td><td>{inr(sum("netPay"))}</td><td colSpan={2}></td></tr>
          </tfoot>
        </table>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Site / project-wise labour cost (gross)</h2>
        <table className="text-sm border">
          <thead className="bg-gray-100 text-left"><tr><th className="p-2">Site</th><th>Project</th><th>Paid days</th><th>Hours</th><th>Labour cost</th></tr></thead>
          <tbody>
            {siteCost.map((s) => (
              <tr key={s.siteId} className="border-t">
                <td className="p-2">{s.site}</td><td>{s.project ?? "-"}</td>
                <td>{Number(s.days ?? 0)}</td><td>{Number(s.hours ?? 0)}</td><td>{inr(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
