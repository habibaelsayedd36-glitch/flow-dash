"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createAuthClient } from "@neon/auth/next";

const authClient = createAuthClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: "/auth/reset-password",
      });
      if (result.error) {
        setError(result.error.message || "Could not send the reset email. Please try again.");
      } else {
        setMessage("If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.");
      }
    } catch {
      setError("Could not send the reset email. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto bg-[#f5f6f2] px-5 py-10 text-[#183c2b]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe6dc] bg-white p-8 shadow-[0_24px_80px_rgba(20,60,40,.12)] sm:p-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-[#718274]">FLOW WORKSPACE</p>
        <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-[#68766b]">Enter your team email and we’ll send you a secure reset link.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">Email address
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce4dc] bg-white px-4 text-sm outline-none focus:border-[#315e42] focus:ring-4 focus:ring-[#315e42]/10" placeholder="name@company.com" />
          </label>
          {message && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-[#183c2b] px-4 text-sm font-semibold text-white hover:bg-[#24543b] disabled:opacity-60">{busy ? "Sending…" : "Send reset link"}</button>
        </form>
        <Link href="/auth/sign-in" className="mt-6 block text-center text-sm font-medium text-[#315e42] hover:underline">Back to sign in</Link>
      </section>
    </main>
  );
}
