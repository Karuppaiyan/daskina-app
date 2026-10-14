"use client";
import { useEffect, useState } from "react";
import { api, errText } from "@/lib/client";

export default function ProfilePage() {
  const [me, setMe] = useState<{ name?: string; email?: string; role?: string } | null>(null);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/me").then((r) => setMe((r.j as { user?: { name?: string; email?: string; role?: string } }).user ?? null));
  }, []);

  async function save() {
    if (pw !== pw2) return setMsg("New passwords do not match");
    const r = await api("/api/me/password", "POST", { currentPassword: cur, newPassword: pw });
    setMsg(r.ok ? "Password changed" : errText(r.j));
    if (r.ok) { setCur(""); setPw(""); setPw2(""); }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1>My account</h1>
      {msg && <p className="text-sm bg-yellow-100 p-2 rounded">{msg}</p>}

      <section className="space-y-1 text-sm">
        <h2 className="mb-2">Profile</h2>
        <p><b>Name:</b> {me?.name ?? "-"}</p>
        <p><b>Email:</b> {me?.email ?? "-"}</p>
        <p><b>Role:</b> {me?.role?.replace(/_/g, " ") ?? "-"}</p>
      </section>

      <section className="space-y-3">
        <h2>Change password</h2>
        <input type="password" className="border p-2 rounded w-full" placeholder="Current password" autoComplete="current-password"
          value={cur} onChange={(e) => setCur(e.target.value)} />
        <input type="password" className="border p-2 rounded w-full" placeholder="New password" autoComplete="new-password"
          value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className="border p-2 rounded w-full" placeholder="Confirm new password" autoComplete="new-password"
          value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <p className="text-xs text-gray-500">At least 8 characters, with a letter and a number.</p>
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={save}>Change password</button>
      </section>
    </div>
  );
}
