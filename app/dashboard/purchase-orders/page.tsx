"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errText, inr } from "@/lib/client";
import { istDate } from "@/lib/attendance";

type Opt = { id: string; name: string };
type Mat = { id: string; name: string; spec: string; unit: string };
type PO = {
  id: string; poNumber: string; date: string; status: string; total: number; itemCount: number; receivedPct: number;
  supplier: Opt; site: Opt;
};
type PoItem = { id: string; qty: string; rate: string; gstPct: string; receivedQty: string; material: Mat };
type Detail = PO & {
  items: PoItem[]; notes: string | null; createdByName: string | null; approvedByName: string | null;
  receipts: { id: string; grnNumber: string; date: string; invoiceNo: string | null; vehicleNo: string | null;
    items: { id: string; receivedQty: string; rejectedQty: string; material: Mat }[] }[];
};

const inp = "border p-2 rounded w-full";
const today = istDate(new Date());
type Line = { materialId: string; qty: string; rate: string; gstPct: string };
const blankLine: Line = { materialId: "", qty: "", rate: "", gstPct: "18" };

export default function PurchaseOrdersPage() {
  const [sups, setSups] = useState<Opt[]>([]);
  const [sites, setSites] = useState<Opt[]>([]);
  const [mats, setMats] = useState<Mat[]>([]);
  const [rows, setRows] = useState<PO[]>([]);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("");

  const [open, setOpen] = useState(false);
  const [h, setH] = useState({ supplierId: "", siteId: "", date: today, expectedDate: "", transport: "", otherCharges: "", notes: "" });
  const [lines, setLines] = useState<Line[]>([{ ...blankLine }]);

  const [d, setD] = useState<Detail | null>(null);
  const [rc, setRc] = useState<Record<string, { rec: string; rej: string }>>({});
  const [inv, setInv] = useState({ invoiceNo: "", vehicleNo: "", date: today });

  const load = useCallback(async () => {
    const r = await api("/api/purchase-orders" + (status ? `?status=${status}` : ""));
    if (r.ok) setRows(r.j as unknown as PO[]);
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api("/api/suppliers").then((r) => r.ok && setSups(r.j as unknown as Opt[]));
    api("/api/sites").then((r) => r.ok && setSites(r.j as unknown as Opt[]));
    api("/api/materials").then((r) => r.ok && setMats(r.j as unknown as Mat[]));
  }, []);

  async function create(force = false) {
    const body = {
      ...h, force,
      items: lines.filter((l) => l.materialId).map((l) => ({ ...l })),
    };
    const r = await api("/api/purchase-orders", "POST", body);
    if (r.status === 409 && r.j.duplicate) {
      if (window.confirm(String(r.j.error) + "\n\nCreate anyway?")) return create(true);
      return;
    }
    if (!r.ok) return setMsg(errText(r.j));
    setMsg(`Created ${String(r.j.poNumber)}`);
    setLines([{ ...blankLine }]); setOpen(false); load();
  }

  async function openDetail(id: string) {
    const r = await api(`/api/purchase-orders/${id}`);
    if (!r.ok) return setMsg(errText(r.j));
    const det = r.j as unknown as Detail;
    setD(det);
    setRc({});
    setInv({ invoiceNo: "", vehicleNo: "", date: today });
  }

  async function act(id: string, action: "issue" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this PO?")) return;
    const r = await api(`/api/purchase-orders/${id}`, "PATCH", { action });
    setMsg(r.ok ? `PO ${action === "issue" ? "issued" : "cancelled"}` : errText(r.j));
    load();
    if (d?.id === id) openDetail(id);
  }

  async function receive(force = false) {
    if (!d) return;
    const items = Object.entries(rc)
      .filter(([, v]) => v.rec && Number(v.rec) > 0)
      .map(([poItemId, v]) => ({ poItemId, receivedQty: v.rec, rejectedQty: v.rej || "0" }));
    if (!items.length) return setMsg("Enter a received quantity for at least one item");
    const r = await api(`/api/purchase-orders/${d.id}/receive`, "POST", { ...inv, items, force });
    if (r.status === 409 && r.j.exceeds) {
      if (window.confirm(String(r.j.error) + "\n\nAccept over-delivery? (OWNER / Purchase Manager only)")) return receive(true);
      return;
    }
    setMsg(r.ok ? `Goods received: ${String((r.j as { grnNumber?: string }).grnNumber)} (stock updated)` : errText(r.j));
    if (r.ok) { load(); openDetail(d.id); }
  }

  const canReceive = d && (d.status === "ISSUED" || d.status === "PARTIAL");

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Purchase Orders</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <div className="flex gap-2 items-center">
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => setOpen(!open)}>{open ? "Close form" : "+ New PO"}</button>
        <select className="border p-2 rounded" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          {["DRAFT", "ISSUED", "PARTIAL", "RECEIVED", "CANCELLED"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>

      {open && (
        <section className="border rounded p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <select className={inp} value={h.supplierId} onChange={(e) => setH({ ...h, supplierId: e.target.value })}>
              <option value="">Supplier *</option>{sups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select className={inp} value={h.siteId} onChange={(e) => setH({ ...h, siteId: e.target.value })}>
              <option value="">Deliver to site *</option>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input type="date" className={inp} value={h.date} max={today} onChange={(e) => setH({ ...h, date: e.target.value })} />
            <input type="date" className={inp} title="Expected delivery" value={h.expectedDate} onChange={(e) => setH({ ...h, expectedDate: e.target.value })} />
            <input className={inp} placeholder="Transport (₹)" value={h.transport} onChange={(e) => setH({ ...h, transport: e.target.value })} />
            <input className={inp} placeholder="Other charges (₹)" value={h.otherCharges} onChange={(e) => setH({ ...h, otherCharges: e.target.value })} />
            <input className={inp + " col-span-2"} placeholder="Notes" value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-6 gap-2">
              <select className={inp + " col-span-2"} value={l.materialId} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, materialId: e.target.value } : x))}>
                <option value="">Material *</option>{mats.map((x) => <option key={x.id} value={x.id}>{x.name} {x.spec} ({x.unit})</option>)}
              </select>
              <input className={inp} placeholder="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
              <input className={inp} placeholder="Rate" value={l.rate} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, rate: e.target.value } : x))} />
              <input className={inp} placeholder="GST %" value={l.gstPct} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, gstPct: e.target.value } : x))} />
              <button className="border rounded" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}>Remove</button>
            </div>
          ))}
          <button className="text-blue-600 text-sm underline" onClick={() => setLines([...lines, { ...blankLine }])}>+ Add line</button>
          <div><button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => create()}>Save PO (draft)</button></div>
        </section>
      )}

      <table className="w-full text-sm border">
        <thead className="bg-gray-100 text-left"><tr><th className="p-2">PO</th><th>Date</th><th>Supplier</th><th>Site</th><th>Items</th><th>Total</th><th>Received</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className="border-t">
              <td className="p-2">{x.poNumber}</td><td>{x.date.slice(0, 10)}</td><td>{x.supplier.name}</td><td>{x.site.name}</td>
              <td>{x.itemCount}</td><td>{inr(x.total)}</td><td>{x.receivedPct}%</td><td>{x.status}</td>
              <td className="space-x-1 whitespace-nowrap">
                <button className="text-blue-600 underline" onClick={() => openDetail(x.id)}>Open</button>
                {x.status === "DRAFT" && <button className="bg-green-600 text-white px-2 py-1 rounded" onClick={() => act(x.id, "issue")}>Issue</button>}
                {(x.status === "DRAFT" || x.status === "ISSUED") && <button className="border px-2 py-1 rounded" onClick={() => act(x.id, "cancel")}>Cancel</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {d && (
        <section className="border rounded p-4 space-y-3">
          <div className="flex justify-between">
            <h2 className="font-semibold">{d.poNumber} · {d.supplier.name} → {d.site.name} · {d.status}</h2>
            <button className="border px-2 rounded" onClick={() => setD(null)}>Close</button>
          </div>
          <p className="text-sm text-gray-600">Created by {d.createdByName ?? "?"}{d.approvedByName ? ` · issued by ${d.approvedByName}` : ""} · Total {inr(d.total)}{d.notes ? ` · ${d.notes}` : ""}</p>

          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-left"><tr><th className="p-2">Material</th><th>Ordered</th><th>Rate</th><th>GST</th><th>Received (accepted)</th><th>Pending</th>{canReceive && <th>Receive now</th>}{canReceive && <th>Of which rejected</th>}</tr></thead>
            <tbody>
              {d.items.map((i) => {
                const pending = Math.max(0, Number(i.qty) - Number(i.receivedQty));
                return (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">{i.material.name} {i.material.spec}</td>
                    <td>{Number(i.qty)} {i.material.unit}</td><td>{inr(i.rate)}</td><td>{Number(i.gstPct)}%</td>
                    <td>{Number(i.receivedQty)}</td><td>{pending}</td>
                    {canReceive && <td><input className="border p-1 rounded w-24" placeholder={String(pending)} value={rc[i.id]?.rec ?? ""} onChange={(e) => setRc({ ...rc, [i.id]: { rec: e.target.value, rej: rc[i.id]?.rej ?? "" } })} /></td>}
                    {canReceive && <td><input className="border p-1 rounded w-24" value={rc[i.id]?.rej ?? ""} onChange={(e) => setRc({ ...rc, [i.id]: { rec: rc[i.id]?.rec ?? "", rej: e.target.value } })} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {canReceive && (
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" className="border p-2 rounded" value={inv.date} max={today} onChange={(e) => setInv({ ...inv, date: e.target.value })} />
              <input className="border p-2 rounded" placeholder="Supplier invoice no." value={inv.invoiceNo} onChange={(e) => setInv({ ...inv, invoiceNo: e.target.value })} />
              <input className="border p-2 rounded" placeholder="Vehicle no." value={inv.vehicleNo} onChange={(e) => setInv({ ...inv, vehicleNo: e.target.value })} />
              <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => receive()}>Receive goods</button>
            </div>
          )}

          {d.receipts.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-1">Goods receipts</h3>
              <ul className="text-sm list-disc ml-6">
                {d.receipts.map((g) => (
                  <li key={g.id}>
                    {g.grnNumber} · {g.date.slice(0, 10)}{g.invoiceNo ? ` · inv ${g.invoiceNo}` : ""}{g.vehicleNo ? ` · ${g.vehicleNo}` : ""}:{" "}
                    {g.items.map((i) => `${i.material.name} ${Number(i.receivedQty)}${Number(i.rejectedQty) > 0 ? ` (rejected ${Number(i.rejectedQty)})` : ""}`).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
