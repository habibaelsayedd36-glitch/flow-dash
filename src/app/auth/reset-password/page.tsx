"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";

const authClient = createAuthClient();

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing or invalid. Request a new one.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message || "This reset link is invalid or has expired. Request a new one.");
      } else {
        setMessage("Your password has been updated. You can now sign in.");
        window.setTimeout(() => router.replace("/auth/sign-in"), 1400);
      }
    } catch {
      setError("Could not reset your password. Request a new link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-[100] grid min-h-dvh place-items-center overflow-y-auto bg-[#f5f6f2] px-5 py-10 text-[#183c2b]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe6dc] bg-white p-8 shadow-[0_24px_80px_rgba(20,60,40,.12)] sm:p-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-[#718274]">FLOW WORKSPACE</p>
        <h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-[#68766b]">Create a new password for your FLOW account.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">New password
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce4dc] bg-white px-4 text-sm outline-none focus:border-[#315e42] focus:ring-4 focus:ring-[#315e42]/10" placeholder="At least 8 characters" />
          </label>
          <label className="block text-sm font-medium">Confirm new password
            <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#dce4dc] bg-white px-4 text-sm outline-none focus:border-[#315e42] focus:ring-4 focus:ring-[#315e42]/10" placeholder="Repeat your new password" />
          </label>
          {message && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !token} className="h-12 w-full rounded-xl bg-[#183c2b] px-4 text-sm font-semibold text-white hover:bg-[#24543b] disabled:opacity-60">{busy ? "Updating…" : "Update password"}</button>
        </form>
        <Link href="/auth/forgot-password" className="mt-6 block text-center text-sm font-medium text-[#315e42] hover:underline">Request another reset link</Link>
      </section>
    </main>
  );
}
