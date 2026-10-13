"use client";
import { useEffect, useState } from "react";

type Customer = { id: string; name: string };
type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  contractValue: string;
  poNumber: string | null;
  customer: Customer;
  _count: { sites: number };
};
type Site = { id: string; name: string; location: string | null; project: { name: string } | null };

const inp = "border p-2 rounded w-full";

export default function ProjectsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [msg, setMsg] = useState("");

  const [newCustomer, setNewCustomer] = useState("");
  const [p, setP] = useState({
    code: "", name: "", customerId: "", poNumber: "", contractValue: "",
  });
  const [s, setS] = useState({ name: "", projectId: "", location: "" });

  async function load() {
    const [c, pr, si] = await Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
    ]);
    if (Array.isArray(c)) setCustomers(c);
    if (Array.isArray(pr)) setProjects(pr);
    if (Array.isArray(si)) setSites(si);
  }
  useEffect(() => { load(); }, []);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) setMsg(typeof j.error === "string" ? j.error : "Validation error");
    else setMsg("Saved");
    await load();
    return r.ok;
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <h1 className="text-2xl font-semibold">Projects &amp; Sites</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Add customer</h2>
        <div className="flex gap-2">
          <input className={inp} placeholder="Customer name" value={newCustomer}
            onChange={(e) => setNewCustomer(e.target.value)} />
          <button className="bg-blue-600 text-white px-4 rounded"
            onClick={async () => {
              if (await post("/api/customers", { name: newCustomer })) setNewCustomer("");
            }}>Add</button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Add project</h2>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Code (SG-002)" value={p.code}
            onChange={(e) => setP({ ...p, code: e.target.value })} />
          <input className={inp} placeholder="Project name" value={p.name}
            onChange={(e) => setP({ ...p, name: e.target.value })} />
          <select className={inp} value={p.customerId}
            onChange={(e) => setP({ ...p, customerId: e.target.value })}>
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className={inp} placeholder="PO / WO number" value={p.poNumber}
            onChange={(e) => setP({ ...p, poNumber: e.target.value })} />
          <input className={inp} placeholder="Contract value (₹)" value={p.contractValue}
            onChange={(e) => setP({ ...p, contractValue: e.target.value })} />
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={async () => {
            if (await post("/api/projects", p))
              setP({ code: "", name: "", customerId: "", poNumber: "", contractValue: "" });
          }}>Create project</button>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Add site</h2>
        <div className="grid grid-cols-3 gap-2">
          <input className={inp} placeholder="Site name" value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })} />
          <select className={inp} value={s.projectId}
            onChange={(e) => setS({ ...s, projectId: e.target.value })}>
            <option value="">No project (workshop/other)</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.code} - {x.name}</option>)}
          </select>
          <input className={inp} placeholder="Location" value={s.location}
            onChange={(e) => setS({ ...s, location: e.target.value })} />
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded"
          onClick={async () => {
            if (await post("/api/sites", s)) setS({ name: "", projectId: "", location: "" });
          }}>Create site</button>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Projects ({projects.length})</h2>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr><th className="p-2">Code</th><th>Name</th><th>Customer</th><th>PO</th><th>Value</th><th>Status</th><th>Sites</th></tr>
          </thead>
          <tbody>
            {projects.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-2">{x.code}</td><td>{x.name}</td><td>{x.customer.name}</td>
                <td>{x.poNumber ?? "-"}</td>
                <td>₹{Number(x.contractValue).toLocaleString("en-IN")}</td>
                <td>{x.status}</td><td>{x._count.sites}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Sites ({sites.length})</h2>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100 text-left">
            <tr><th className="p-2">Site</th><th>Project</th><th>Location</th></tr>
          </thead>
          <tbody>
            {sites.map((x) => (
              <tr key={x.id} className="border-t">
                <td className="p-2">{x.name}</td>
                <td>{x.project?.name ?? "-"}</td><td>{x.location ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
