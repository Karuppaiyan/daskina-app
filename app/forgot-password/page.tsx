"use client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Forgot your password?</h1>
        <p className="text-sm font-normal text-gray-500 dark:text-gray-400">
          Enter the email you use to sign in. We will send you a link to choose a new password.
        </p>

        {done ? (
          <div className="p-4 text-sm text-green-800 border border-green-300 rounded-lg bg-green-50 dark:bg-gray-800 dark:text-green-400 dark:border-green-800" role="status">
            If this email is registered, a password reset link has been sent. The link is valid for 1 hour.
          </div>
        ) : (
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div>
              <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your email</label>
              <input id="email" type="email" required autoComplete="username" placeholder="name@company.com" className={field}
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {err && (
              <div className="p-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert">{err}</div>
            )}
            <button type="submit" disabled={busy}
              className="w-full px-5 py-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 disabled:opacity-60">
              {busy ? "Sending..." : "Reset password"}
            </button>
          </form>
        )}

        <p className="text-sm text-center">
          <Link href="/login" className="font-medium text-primary-700 hover:underline dark:text-primary-500">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
