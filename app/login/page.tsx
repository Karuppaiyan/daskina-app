"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setErr("Invalid email or password");
      setBusy(false);
    } else {
      window.location.href = "/dashboard";
    }
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in to your account</h1>
        <form
          className="space-y-6"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <div>
            <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">Your email</label>
            <input id="email" type="email" autoComplete="username" required placeholder="name@company.com" className={field}
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-900 dark:text-white">Your password</label>
              <Link href="/forgot-password" className="text-sm font-medium text-primary-700 hover:underline dark:text-primary-500">Forgot password?</Link>
            </div>
            <input id="password" type="password" autoComplete="current-password" required placeholder="••••••••" className={field}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && (
            <div className="p-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert">
              {err}
            </div>
          )}
          <button
            type="submit" disabled={busy}
            className="w-full px-5 py-3 text-base font-medium text-center text-white rounded-lg bg-primary-700 hover:bg-primary-800 focus:ring-4 focus:ring-primary-300 disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Signing in..." : "Login to your account"}
          </button>
        </form>
      </div>
    </div>
  );
}
