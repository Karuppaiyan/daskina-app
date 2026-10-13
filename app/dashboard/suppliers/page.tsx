"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errText, inr } from "@/lib/client";

type Supplier = {
  id: string; name: string; contactPerson: string | null; phone: string | null; gstin: string | null;
  creditDays: number; products: string | null; _count: { purchaseOrders: number };
};
type Material = { id: string; name: string; spec: string; unit: string; minStock: string };
type Quote = {
  id: string; supplier: { id: string; name: string }; date: string; qty: number; basicRate: number;
  gstPct: number; transport: number; otherCharges: number; validUntil: string | null;
  landedRate: number; expired: boolean; lowestLanded: boolean; lowestBasic: boolean;
};

const inp = "border p-2 rounded w-full";
const blankS = { name: "", contactPerson: "", phone: "", gstin: "", creditDays: "", products: "" };
const blankM = { name: "", spec: "", unit: "", minStock: "" };
const blankQ = { supplierId: "", qty: "1", basicRate: "", transport: "", gstPct: "18", otherCharges: "", validUntil: "" };

export default function SuppliersPage() {
  const [sups, setSups] = useState<Supplier[]>([]);
  const [mats, setMats] = useState<Material[]>([]);
  const [msg, setMsg] = useState("");
  const [s, setS] = useState(blankS);
  const [m, setM] = useState(blankM);
  const [sel, setSel] = useState<Material | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [q, setQ] = useState(blankQ);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api("/api/suppliers"), api("/api/materials")]);
    if (a.ok) setSups(a.j as unknown as Supplier[]);
    if (b.ok) setMats(b.j as unknown as Material[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadQuotes(mat: Material) {
    setSel(mat);
    const r = await api(`/api/quotations?materialId=${mat.id}`);
    setQuotes(r.ok ? ((r.j as { quotes: Quote[] }).quotes) : []);
  }

  async function addSupplier(force = false) {
    const r = await api("/api/suppliers", "POST", { ...s, force });
    if (r.status === 409 && r.j.duplicate) {
      if (window.confirm(String(r.j.error) + "\n\nSave anyway?")) return addSupplier(true);
      return;
    }
    setMsg(r.ok ? "Supplier saved" : errText(r.j));
    if (r.ok) { setS(blankS); load(); }
  }

  async function addMaterial() {
    const r = await api("/api/materials", "POST", m);
    setMsg(r.ok ? "Material saved" : errText(r.j));
    if (r.ok) { setM(blankM); load(); }
  }

  async function addQuote() {
    if (!sel) return;
    const r = await api("/api/quotations", "POST", { ...q, materialId: sel.id });
    setMsg(r.ok ? "Quotation saved" : errText(r.j));
    if (r.ok) { setQ(blankQ); loadQuotes(sel); }
  }

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <h1 className="text-2xl font-semibold">Suppliers, Materials &amp; Quotations</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Suppliers</h2>
        <div className="grid grid-cols-6 gap-2">
          <input className={inp} placeholder="Name *" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          <input className={inp} placeholder="Contact person" value={s.contactPerson} onChange={(e) => setS({ ...s, contactPerson: e.target.value })} />
          <input className={inp} placeholder="Phone" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
          <input className={inp} placeholder="GSTIN" value={s.gstin} onChange={(e) => setS({ ...s, gstin: e.target.value })} />
          <input className={inp} placeholder="Credit days" value={s.creditDays} onChange={(e) => setS({ ...s, creditDays: e.target.value })} />
          <input className={inp} placeholder="Products" value={s.products} onChange={(e) => setS({ ...s, products: e.target.value })} />
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => addSupplier()}>Add supplier</button>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left"><tr><th className="p-2">Name</th><th>Contact</th><th>Phone</th><th>GSTIN</th><th>Credit</th><th>Products</th><th>POs</th></tr></thead>
          <tbody>
            {sups.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-2">{x.name}</td><td>{x.contactPerson ?? "-"}</td><td>{x.phone ?? "-"}</td>
                <td>{x.gstin ?? "-"}</td><td>{x.creditDays}d</td><td>{x.products ?? "-"}</td><td>{x._count.purchaseOrders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Materials</h2>
        <div className="grid grid-cols-5 gap-2">
          <input className={inp} placeholder="Name * (e.g. MS Plate)" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
          <input className={inp} placeholder="Specification (10mm IS2062)" value={m.spec} onChange={(e) => setM({ ...m, spec: e.target.value })} />
          <input className={inp} placeholder="Unit * (kg, nos, MT)" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })} />
          <input className={inp} placeholder="Low-stock level" value={m.minStock} onChange={(e) => setM({ ...m, minStock: e.target.value })} />
          <button className="bg-blue-600 text-white rounded" onClick={addMaterial}>Add material</button>
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left"><tr><th className="p-2">Material</th><th>Spec</th><th>Unit</th><th>Low-stock level</th><th></th></tr></thead>
          <tbody>
            {mats.map((x) => (
              <tr key={x.id} className={"border-t " + (sel?.id === x.id ? "bg-blue-50" : "")}>
                <td className="p-2">{x.name}</td><td>{x.spec || "-"}</td><td>{x.unit}</td><td>{Number(x.minStock)}</td>
                <td><button className="text-blue-600 underline" onClick={() => loadQuotes(x)}>Quotes / compare</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sel && (
        <section className="space-y-2 border rounded p-4">
          <h2 className="font-semibold">Quotations: {sel.name} {sel.spec} ({sel.unit})</h2>
          <div className="grid grid-cols-7 gap-2">
            <select className={inp} value={q.supplierId} onChange={(e) => setQ({ ...q, supplierId: e.target.value })}>
              <option value="">Supplier *</option>
              {sups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input className={inp} placeholder="Qty quoted" value={q.qty} onChange={(e) => setQ({ ...q, qty: e.target.value })} />
            <input className={inp} placeholder="Basic rate *" value={q.basicRate} onChange={(e) => setQ({ ...q, basicRate: e.target.value })} />
            <input className={inp} placeholder="GST %" value={q.gstPct} onChange={(e) => setQ({ ...q, gstPct: e.target.value })} />
            <input className={inp} placeholder="Transport (total)" value={q.transport} onChange={(e) => setQ({ ...q, transport: e.target.value })} />
            <input className={inp} placeholder="Other charges" value={q.otherCharges} onChange={(e) => setQ({ ...q, otherCharges: e.target.value })} />
            <input type="date" className={inp} title="Valid until" value={q.validUntil} onChange={(e) => setQ({ ...q, validUntil: e.target.value })} />
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={addQuote}>Add quotation</button>

          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-left">
              <tr><th className="p-2">Supplier</th><th>Date</th><th>Qty</th><th>Basic</th><th>GST</th><th>Transport</th><th>Other</th><th>Landed / unit</th><th>Valid until</th><th></th></tr>
            </thead>
            <tbody>
              {quotes.map((x) => (
                <tr key={x.id} className={"border-t " + (x.lowestLanded ? "bg-green-50" : x.expired ? "text-gray-400" : "")}>
                  <td className="p-2">{x.supplier.name}</td><td>{x.date.slice(0, 10)}</td><td>{x.qty}</td>
                  <td>{inr(x.basicRate)}</td><td>{x.gstPct}%</td><td>{inr(x.transport)}</td><td>{inr(x.otherCharges)}</td>
                  <td className="font-semibold">{inr(x.landedRate)}</td>
                  <td>{x.validUntil ? x.validUntil.slice(0, 10) : "-"}{x.expired ? " (expired)" : ""}</td>
                  <td className="text-xs">
                    {x.lowestLanded && <span className="text-green-700 font-semibold">Lowest real cost</span>}
                    {x.lowestBasic && !x.lowestLanded && <span className="text-orange-600">Lowest basic price, but not lowest landed</span>}
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && <tr><td className="p-2 text-gray-500" colSpan={10}>No quotations yet.</td></tr>}
            </tbody>
          </table>
          <p className="text-xs text-gray-500">Landed cost per unit = basic rate + GST + (transport + other charges) ÷ quoted qty. Latest quote per supplier only; expired quotes are ignored for ranking.</p>
        </section>
      )}
    </div>
  );
}
