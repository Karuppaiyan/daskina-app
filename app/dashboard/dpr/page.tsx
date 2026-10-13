"use client";
import { useCallback, useEffect, useState } from "react";
import { istDate } from "@/lib/attendance";
import { uploadOne } from "@/lib/image";

type Site = { id: string; name: string };
type Media = { id: string; url: string; stage: string; type: string };
type WorkItem = { item: string; qty?: number; unit?: string };
type Dpr = {
  id: string; date: string; manpowerCount: number; site: Site; submittedBy: { name: string };
  workItems: WorkItem[]; equipmentUsed: { name: string; hours?: number }[] | null;
  materialsUsed: { name: string; qty?: number; unit?: string }[] | null;
  delays: string | null; delayReason: string | null; safetyIssues: string | null; tomorrowPlan: string | null;
  media: Media[];
};
type ListRow = {
  id: string; date: string; manpowerCount: number; site: Site;
  submittedBy: { name: string }; _count: { media: number };
};
type Item = { item: string; qty: string; unit: string };

const inp = "border p-2 rounded w-full";
const STAGES = ["BEFORE", "DURING", "COMPLETED"];
const today = istDate(new Date());
const blankItem: Item = { item: "", qty: "", unit: "" };

export default function DprPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [list, setList] = useState<ListRow[]>([]);
  const [msg, setMsg] = useState("");
  const [flt, setFlt] = useState({ siteId: "", from: today.slice(0, 8) + "01", to: today });

  // new DPR form
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<Item[]>([{ ...blankItem }]);
  const [manpower, setManpower] = useState("");
  const [equip, setEquip] = useState("");
  const [mats, setMats] = useState("");
  const [delays, setDelays] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [safety, setSafety] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [stage, setStage] = useState("DURING");
  const [staged, setStaged] = useState<{ url: string; stage: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // detail
  const [detail, setDetail] = useState<Dpr | null>(null);
  const [ed, setEd] = useState({ manpowerCount: "", delays: "", delayReason: "", safetyIssues: "", tomorrowPlan: "" });

  useEffect(() => {
    fetch("/api/sites").then((r) => r.json()).then((s) => Array.isArray(s) && setSites(s));
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    Object.entries(flt).forEach(([k, v]) => v && qs.set(k, v));
    const r = await fetch("/api/dpr?" + qs);
    const j = await r.json();
    if (r.ok) setList(j); else setMsg(j.error ?? "Error");
  }, [flt]);
  useEffect(() => { load(); }, [load]);

  async function uploadFiles(files: FileList | null, st: string): Promise<{ url: string; stage: string }[]> {
    if (!files) return [];
    const out: { url: string; stage: string }[] = [];
    setBusy(true);
    try {
      for (const f of Array.from(files)) out.push({ url: await uploadOne(f), stage: st });
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
    return out;
  }

  function lines(t: string) { return t.split("\n").map((l) => l.trim()).filter(Boolean); }

  async function create() {
    const body = {
      siteId, date,
      workItems: items.filter((i) => i.item.trim()).map((i) => ({
        item: i.item.trim(),
        ...(i.qty && !isNaN(+i.qty) ? { qty: +i.qty } : {}),
        ...(i.unit ? { unit: i.unit } : {}),
      })),
      manpowerCount: manpower || undefined,
      equipmentUsed: lines(equip).map((l) => {
        const [name, h] = l.split(",").map((s) => s.trim());
        return { name, ...(h && !isNaN(+h) ? { hours: +h } : {}) };
      }),
      materialsUsed: lines(mats).map((l) => {
        const [name, q, u] = l.split(",").map((s) => s.trim());
        return { name, ...(q && !isNaN(+q) ? { qty: +q } : {}), ...(u ? { unit: u } : {}) };
      }),
      delays, delayReason, safetyIssues: safety, tomorrowPlan: tomorrow,
      media: staged,
    };
    const r = await fetch("/api/dpr", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) return setMsg(typeof j.error === "string" ? j.error : "Check required fields (site, date, at least one work item)");
    setMsg("DPR saved");
    setItems([{ ...blankItem }]); setManpower(""); setEquip(""); setMats(""); setDelays("");
    setDelayReason(""); setSafety(""); setTomorrow(""); setStaged([]); setOpen(false);
    load();
    openDetail(j.id);
  }

  async function openDetail(id: string) {
    const r = await fetch(`/api/dpr/${id}`);
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Error");
    setDetail(j);
    setEd({
      manpowerCount: String(j.manpowerCount ?? ""), delays: j.delays ?? "", delayReason: j.delayReason ?? "",
      safetyIssues: j.safetyIssues ?? "", tomorrowPlan: j.tomorrowPlan ?? "",
    });
  }

  async function saveDetail() {
    if (!detail) return;
    const r = await fetch(`/api/dpr/${detail.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manpowerCount: ed.manpowerCount, delays: ed.delays, delayReason: ed.delayReason,
        safetyIssues: ed.safetyIssues, tomorrowPlan: ed.tomorrowPlan,
      }),
    });
    const j = await r.json();
    setMsg(r.ok ? "Updated" : typeof j.error === "string" ? j.error : "Error");
    if (r.ok) openDetail(detail.id);
  }

  async function addPhotos(files: FileList | null) {
    if (!detail) return;
    const ups = await uploadFiles(files, stage);
    for (const u of ups) {
      const r = await fetch(`/api/dpr/${detail.id}/media`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u),
      });
      if (!r.ok) setMsg((await r.json()).error ?? "Error");
    }
    openDetail(detail.id); load();
  }

  async function removePhoto(mediaId: string) {
    if (!detail || !window.confirm("Remove this photo from the report?")) return;
    const r = await fetch(`/api/dpr/${detail.id}/media?mediaId=${mediaId}`, { method: "DELETE" });
    if (!r.ok) setMsg((await r.json()).error ?? "Error");
    openDetail(detail.id); load();
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold">Daily Progress Reports</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={() => setOpen(!open)}>
        {open ? "Close form" : "+ New DPR"}
      </button>

      {open && (
        <section className="border rounded p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <select className={inp} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Site *</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" className={inp} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            <input className={inp} placeholder="Manpower (blank = from attendance)" value={manpower}
              onChange={(e) => setManpower(e.target.value)} />
          </div>

          <div className="space-y-1">
            <h3 className="font-semibold text-sm">Work done today *</h3>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <input className={inp + " col-span-3"} placeholder="Work item (e.g. Column erection grid A-C)" value={it.item}
                  onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} />
                <input className={inp} placeholder="Qty" value={it.qty}
                  onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                <input className={inp} placeholder="Unit (MT, m²)" value={it.unit}
                  onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
                <button className="border rounded" onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : items)}>Remove</button>
              </div>
            ))}
            <button className="text-blue-600 text-sm underline" onClick={() => setItems([...items, { ...blankItem }])}>+ Add work item</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <textarea className={inp} rows={3} placeholder={"Equipment used, one per line:\nCrane, 6\nWelding machine, 8"} value={equip} onChange={(e) => setEquip(e.target.value)} />
            <textarea className={inp} rows={3} placeholder={"Materials used, one per line:\nSteel plate, 2.5, MT\nBolts, 400, nos"} value={mats} onChange={(e) => setMats(e.target.value)} />
            <input className={inp} placeholder="Delays (if any)" value={delays} onChange={(e) => setDelays(e.target.value)} />
            <input className={inp} placeholder="Reason for delay" value={delayReason} onChange={(e) => setDelayReason(e.target.value)} />
            <input className={inp} placeholder="Safety issues / incidents" value={safety} onChange={(e) => setSafety(e.target.value)} />
            <input className={inp} placeholder="Plan for tomorrow" value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select className="border p-2 rounded" value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="file" multiple accept="image/*,application/pdf"
              onChange={async (e) => { const u = await uploadFiles(e.target.files, stage); setStaged((p) => [...p, ...u]); e.target.value = ""; }} />
            {busy && <span className="text-sm">Uploading...</span>}
            <span className="text-sm text-green-700">{staged.length} photo(s) attached</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {staged.map((s, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt="" className="h-20 w-20 object-cover rounded border" />
                <span className="absolute bottom-0 left-0 bg-black/60 text-white text-[10px] px-1">{s.stage}</span>
                <button className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs"
                  onClick={() => setStaged(staged.filter((_, j) => j !== i))}>x</button>
              </div>
            ))}
          </div>

          <button className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={busy} onClick={create}>Save DPR</button>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <select className="border p-2 rounded" value={flt.siteId} onChange={(e) => setFlt({ ...flt, siteId: e.target.value })}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" className="border p-2 rounded" value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} />
          <input type="date" className="border p-2 rounded" value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} />
        </div>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left"><tr><th className="p-2">Date</th><th>Site</th><th>Manpower</th><th>Photos</th><th>By</th><th></th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-2">{x.date.slice(0, 10)}</td><td>{x.site.name}</td><td>{x.manpowerCount}</td>
                <td>{x._count.media}</td><td>{x.submittedBy.name}</td>
                <td><button className="text-blue-600 underline" onClick={() => openDetail(x.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && (
        <section className="border rounded p-4 space-y-3">
          <div className="flex justify-between">
            <h2 className="font-semibold">{detail.site.name} - {detail.date.slice(0, 10)} (by {detail.submittedBy.name})</h2>
            <button className="border px-2 rounded" onClick={() => setDetail(null)}>Close</button>
          </div>

          <div>
            <h3 className="font-semibold text-sm">Work done</h3>
            <ul className="list-disc ml-6 text-sm">
              {detail.workItems.map((w, i) => <li key={i}>{w.item}{w.qty !== undefined ? ` - ${w.qty} ${w.unit ?? ""}` : ""}</li>)}
            </ul>
          </div>
          {detail.equipmentUsed && detail.equipmentUsed.length > 0 && (
            <p className="text-sm"><b>Equipment:</b> {detail.equipmentUsed.map((e) => `${e.name}${e.hours !== undefined ? ` (${e.hours}h)` : ""}`).join(", ")}</p>
          )}
          {detail.materialsUsed && detail.materialsUsed.length > 0 && (
            <p className="text-sm"><b>Materials:</b> {detail.materialsUsed.map((m) => `${m.name}${m.qty !== undefined ? ` ${m.qty} ${m.unit ?? ""}` : ""}`).join(", ")}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Manpower<input className={inp} value={ed.manpowerCount} onChange={(e) => setEd({ ...ed, manpowerCount: e.target.value })} /></label>
            <label className="text-sm">Delays<input className={inp} value={ed.delays} onChange={(e) => setEd({ ...ed, delays: e.target.value })} /></label>
            <label className="text-sm">Delay reason<input className={inp} value={ed.delayReason} onChange={(e) => setEd({ ...ed, delayReason: e.target.value })} /></label>
            <label className="text-sm">Safety issues<input className={inp} value={ed.safetyIssues} onChange={(e) => setEd({ ...ed, safetyIssues: e.target.value })} /></label>
            <label className="text-sm col-span-2">Plan for tomorrow<input className={inp} value={ed.tomorrowPlan} onChange={(e) => setEd({ ...ed, tomorrowPlan: e.target.value })} /></label>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={saveDetail}>Save changes</button>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Photos</h3>
              <select className="border p-1 rounded" value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              {busy && <span className="text-sm">Uploading...</span>}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {STAGES.map((st) => (
                <div key={st}>
                  <h4 className="text-xs font-semibold mb-1">{st}</h4>
                  <div className="flex gap-2 flex-wrap">
                    {detail.media.filter((m) => m.stage === st).map((m) => (
                      <div key={m.id} className="relative">
                        {m.type === "DOCUMENT"
                          ? <a className="block h-24 w-24 border rounded text-xs p-1 text-blue-600 underline" href={m.url} target="_blank">PDF</a>
                          : <a href={m.url} target="_blank">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={m.url} alt="" loading="lazy" className="h-24 w-24 object-cover rounded border" /></a>}
                        <button className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs" onClick={() => removePhoto(m.id)}>x</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
