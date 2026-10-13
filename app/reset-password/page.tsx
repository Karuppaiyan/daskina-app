"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (pw !== pw2) return setErr("Passwords do not match");
    setBusy(true);
    const r = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr(typeof j.error === "string" ? j.error : "Something went wrong. Try again.");
  }

  const field =
    "bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-8 mx-auto bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        <span className="flex items-center justify-center w-10 h-10 mr-3 text-xl font-bold text-white rounded-lg bg-primary-700">D</span>
        Daksina ERP
      </div>
      <div className="w-full max-w-md p-6 space-y-6 bg-white rounded-lg shadow sm:p-8 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose a new password</h1>

        {!token ? (
          <div className="p-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50" role="alert">
            This link is incomplete. Request a new one from the{" "}
            <Link href="/forgot-password" className="font-medium underline">forgot password</Link> page.
          </div>
        ) : done ? (
          <>
            <div className="p-4 text-sm text-green-800 border border-green-300 rounded-lg bg-green-50 dark:bg-gray-800 dark:text-green-400 dark:border-green-800" role="status">
              Your password has been updated.
            </div>
            <Link href="/login"
              className="block w-full px-5 py-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300">
              Go to sign in
            </Link>
          </>
        ) : (
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div>
              <label htmlFor="pw" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">New password</label>
              <input id="pw" type="password" required autoComplete="new-password" placeholder="••••••••" className={field}
                value={pw} onChange={(e) => setPw(e.target.value)} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">At least 8 characters, with a letter and a number.</p>
            </div>
            <div>
              <label htmlFor="pw2" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Confirm password</label>
              <input id="pw2" type="password" required autoComplete="new-password" placeholder="••••••••" className={field}
                value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            {err && (
              <div className="p-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert">
                {err}{" "}
                {err.includes("expired") && (
                  <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>
                )}
              </div>
            )}
            <button type="submit" disabled={busy}
              className="w-full px-5 py-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 disabled:opacity-60">
              {busy ? "Saving..." : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
