"use client";
import { useCallback, useEffect, useState } from "react";
import { istDate, istTime } from "@/lib/attendance";

type Site = { id: string; name: string };
type Emp = { id: string; empCode: string; name: string; trade: string | null };
type Rec = {
  id: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  workedHours: string;
  otHours: string;
  remarks: string | null;
  source: string;
};
type RowData = { employee: Emp; record: Rec | null };

const STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY"];
const inp = "border p-1 rounded";

function Row({
  row, date, siteId, onSaved, onMsg,
}: {
  row: RowData; date: string; siteId: string;
  onSaved: () => void; onMsg: (m: string) => void;
}) {
  const rec = row.record;
  const [status, setStatus] = useState(rec?.status ?? "PRESENT");
  const [inT, setInT] = useState(rec?.checkIn ? istTime(new Date(rec.checkIn)) : "");
  const [outT, setOutT] = useState(rec?.checkOut ? istTime(new Date(rec.checkOut)) : "");
  const [remarks, setRemarks] = useState(rec?.remarks ?? "");
  const noTime = ["ABSENT", "LEAVE", "WEEKLY_OFF", "HOLIDAY"].includes(status);

  async function save() {
    const body = { employeeId: row.employee.id, siteId, date, status, checkIn: inT, checkOut: outT, remarks };
    const r = await fetch(rec ? `/api/attendance/${rec.id}` : "/api/attendance", {
      method: rec ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    onMsg(r.ok ? `Saved ${row.employee.name}` : typeof j.error === "string" ? j.error : "Validation error");
    onSaved();
  }

  return (
    <tr className={"border-t " + (rec ? "" : "bg-red-50")}>
      <td className="p-2">{row.employee.empCode}</td>
      <td>{row.employee.name}</td>
      <td>
        <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </td>
      <td><input type="time" className={inp} disabled={noTime} value={noTime ? "" : inT} onChange={(e) => setInT(e.target.value)} /></td>
      <td><input type="time" className={inp} disabled={noTime} value={noTime ? "" : outT} onChange={(e) => setOutT(e.target.value)} /></td>
      <td>{rec ? `${rec.workedHours}h / OT ${rec.otHours}h` : "-"}</td>
      <td><input className={inp + " w-32"} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></td>
      <td className="text-xs">{rec?.source ?? "not marked"}</td>
      <td><button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={save}>Save</button></td>
    </tr>
  );
}

export default function AttendancePage() {
  const [date, setDate] = useState(istDate(new Date()));
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [rows, setRows] = useState<RowData[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((s) => Array.isArray(s) && setSites(s));
  }, []);

  const load = useCallback(async () => {
    if (!siteId) return setRows([]);
    const r = await fetch(`/api/attendance?date=${date}&siteId=${siteId}`);
    const j = await r.json();
    if (!r.ok) { setMsg(j.error ?? "Error"); setRows([]); return; }
    setRows(j.rows);
  }, [date, siteId]);
  useEffect(() => { load(); }, [load]);

  async function markAllPresent() {
    const todo = rows.filter((x) => !x.record);
    for (const x of todo)
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: x.employee.id, siteId, date, status: "PRESENT" }),
      });
    setMsg(`Marked ${todo.length} present`);
    load();
  }

  const unmarked = rows.filter((x) => !x.record).length;
  const present = rows.filter((x) => x.record?.status === "PRESENT" || x.record?.status === "HALF_DAY").length;

  return (
    <div className="p-8 space-y-4 max-w-6xl">
      <h1 className="text-2xl font-semibold">Attendance</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <div className="flex gap-2 items-center">
        <input type="date" className="border p-2 rounded" value={date} max={istDate(new Date())}
          onChange={(e) => setDate(e.target.value)} />
        <select className="border p-2 rounded" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Select site</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="bg-gray-700 text-white px-3 py-2 rounded" onClick={markAllPresent}
          disabled={!unmarked}>Mark all unmarked present ({unmarked})</button>
        {siteId && <span className="text-sm">Present: {present} / {rows.length}</span>}
      </div>

      {siteId && (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr><th className="p-2">Code</th><th>Name</th><th>Status</th><th>In</th><th>Out</th>
              <th>Hours</th><th>Remarks</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <Row key={x.employee.id + date + (x.record?.id ?? "n") + (x.record?.workedHours ?? "")}
                row={x} date={date} siteId={siteId} onSaved={load} onMsg={setMsg} />
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-gray-500">Red rows are not marked yet. Times are IST. OT = hours beyond the employee&apos;s regular hours.</p>
    </div>
  );
}
