"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthClient } from "@neon/auth/next";

const authClient = createAuthClient();

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      router.replace("/auth/sign-in");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={signOut} disabled={busy} className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-start text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
