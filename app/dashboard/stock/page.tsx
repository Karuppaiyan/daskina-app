"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errText } from "@/lib/client";

type Opt = { id: string; name: string };
type Mat = { id: string; name: string; spec: string; unit: string };
type Row = { siteId: string; site: string; materialId: string; material: string; spec: string; unit: string; balance: number; minStock: number; low: boolean };
type Led = {
  id: string; date: string; type: string; qty: string; rate: string | null; remarks: string | null;
  site: { name: string }; material: { name: string; spec: string; unit: string };
  createdByName: string | null; authorizedByName: string | null;
};

const inp = "border p-2 rounded w-full";
const blank = { type: "ISSUE", siteId: "", materialId: "", qty: "", toSiteId: "", remarks: "" };

export default function StockPage() {
  const [sites, setSites] = useState<Opt[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [led, setLed] = useState<Led[]>([]);
  const [fSite, setFSite] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState(blank);
  const [needOverride, setNeedOverride] = useState(false);
  const [override, setOverride] = useState(false);
  const [picked, setPicked] = useState<{ siteId: string; materialId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api("/api/stock" + (fSite ? `?siteId=${fSite}` : ""));
    if (r.ok) setRows((r.j as { rows: Row[] }).rows);
  }, [fSite]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api("/api/sites").then((r) => r.ok && setSites(r.j as unknown as Opt[]));
    api("/api/materials").then((r) => r.ok && setMats(r.j as unknown as Mat[]));
  }, []);

  async function loadLedger(siteId: string, materialId: string) {
    setPicked({ siteId, materialId });
    const r = await api(`/api/stock/ledger?siteId=${siteId}&materialId=${materialId}`);
    if (r.ok) setLed(r.j as unknown as Led[]);
  }

  async function submit(force = false) {
    const r = await api("/api/stock/move", "POST", { ...f, override, force });
    if (r.status === 409 && r.j.duplicate) {
      if (window.confirm(String(r.j.error) + "\n\nPost anyway?")) return submit(true);
      return;
    }
    if (r.status === 409 && r.j.insufficient) {
      setNeedOverride(true);
      return setMsg(errText(r.j) + ". OWNER / Project Manager can tick 'Authorize anyway' and give a reason in remarks.");
    }
    if (!r.ok) return setMsg(errText(r.j));
    setMsg("Posted");
    setNeedOverride(false); setOverride(false);
    setF({ ...blank, type: f.type, siteId: f.siteId });
    load();
    if (picked) loadLedger(picked.siteId, picked.materialId);
  }

  const shown = rows.filter((r) => !lowOnly || r.low);
  const lowCount = rows.filter((r) => r.low).length;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Stock</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Post a movement</h2>
        <div className="grid grid-cols-6 gap-2">
          <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="ISSUE">Issue to work</option><option value="RETURN">Return to store</option>
            <option value="TRANSFER">Transfer to site</option><option value="ADJUSTMENT">Adjustment (owner)</option>
          </select>
          <select className={inp} value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
            <option value="">{f.type === "TRANSFER" ? "From site *" : "Site *"}</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select className={inp + " col-span-2"} value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
            <option value="">Material *</option>{mats.map((x) => <option key={x.id} value={x.id}>{x.name} {x.spec} ({x.unit})</option>)}
          </select>
          <input className={inp} placeholder={f.type === "ADJUSTMENT" ? "Qty (+ / −)" : "Qty *"} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          {f.type === "TRANSFER"
            ? <select className={inp} value={f.toSiteId} onChange={(e) => setF({ ...f, toSiteId: e.target.value })}><option value="">To site *</option>{sites.filter((x) => x.id !== f.siteId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            : <div />}
          <input className={inp + " col-span-4"} placeholder="Remarks / reason (required for adjustment or override)" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
          {needOverride && (
            <label className="col-span-2 text-sm flex items-center gap-2">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Authorize anyway (beyond stock)
            </label>
          )}
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => submit()}>Post</button>
      </section>

      <section className="space-y-2">
        <div className="flex gap-3 items-center">
          <select className="border p-2 rounded" value={fSite} onChange={(e) => setFSite(e.target.value)}>
            <option value="">All sites</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>
          {lowCount > 0 && <span className="text-sm text-red-600 font-semibold">{lowCount} low-stock item(s)</span>}
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left"><tr><th className="p-2">Site</th><th>Material</th><th>Balance</th><th>Low-stock level</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.siteId + r.materialId} className={"border-t " + (r.low ? "bg-red-50" : "")}>
                <td className="p-2">{r.site}</td><td>{r.material} {r.spec}</td>
                <td className="font-semibold">{r.balance} {r.unit}</td><td>{r.minStock || "-"}</td>
                <td><button className="text-blue-600 underline" onClick={() => loadLedger(r.siteId, r.materialId)}>Ledger</button>{r.low && <span className="ml-2 text-red-600 text-xs">LOW</span>}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={5}>No stock yet. Receive goods against a PO first.</td></tr>}
          </tbody>
        </table>
      </section>

      {picked && (
        <section className="space-y-2">
          <h2 className="font-semibold">Ledger</h2>
          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-left"><tr><th className="p-2">Date</th><th>Type</th><th>Qty</th><th>Rate</th><th>By</th><th>Authorized by</th><th>Remarks</th></tr></thead>
            <tbody>
              {led.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.date.slice(0, 10)}</td><td>{l.type}</td>
                  <td className={Number(l.qty) < 0 ? "text-red-600" : "text-green-700"}>{Number(l.qty) > 0 ? "+" : ""}{Number(l.qty)} {l.material.unit}</td>
                  <td>{l.rate ? "₹" + Number(l.rate) : "-"}</td><td>{l.createdByName ?? "-"}</td><td>{l.authorizedByName ?? "-"}</td><td>{l.remarks ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
