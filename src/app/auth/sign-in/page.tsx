"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";

const authClient = createAuthClient();

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message || "Email or password is incorrect.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto bg-[#f5f6f2] px-5 py-10 text-[#183c2b]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe6dc] bg-white p-8 shadow-[0_24px_80px_rgba(20,60,40,.12)] sm:p-10">
        <div className="mb-8">
          <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-[#183c2b] text-xl font-semibold text-white">F</div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-[#718274]">FLOW WORKSPACE</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-[#68766b]">Sign in to continue to your dashboard.</p>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-medium">
            Email address
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce4dc] bg-white px-4 text-sm outline-none transition focus:border-[#315e42] focus:ring-4 focus:ring-[#315e42]/10" placeholder="name@company.com" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce4dc] bg-white px-4 text-sm outline-none transition focus:border-[#315e42] focus:ring-4 focus:ring-[#315e42]/10" placeholder="Enter your password" />
          </label>
          <div className="-mt-2 text-right">
            <Link href="/auth/forgot-password" className="text-sm font-medium text-[#315e42] hover:underline">Forgot password?</Link>
          </div>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-[#183c2b] px-4 text-sm font-semibold text-white transition hover:bg-[#24543b] disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="mt-7 text-center text-xs leading-5 text-[#849087]">Access is limited to invited FLOW team members.</p>
      </section>
    </main>
  );
}
