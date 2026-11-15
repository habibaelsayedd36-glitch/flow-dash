"use client";

import { Check, Copy, ExternalLink, Link2, Loader2, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createShareLinkAction, portalDecisionAction, revokeShareLinkAction } from "@/app/actions-tools";

/** Approve / request changes — shown to the client on the public portal. */
export function PortalActions({ token, listingId, productName }: { token: string; listingId: number; productName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (decision: "approve" | "changes") => {
    setBusy(true);
    setError("");
    const res = await portalDecisionAction(token, listingId, decision, note);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError("That did not go through. Refresh the page and try again.");
  };

  return (
    <div className="mt-5 border-t border-line pt-4">
      {mode === "changes" ? (
        <div>
          <label className="label" htmlFor={`note-${listingId}`}>What should change?</label>
          <textarea id={`note-${listingId}`} className="field" rows={3} maxLength={140} value={note} dir="auto" onChange={(e) => setNote(e.target.value)} placeholder="e.g. the capacity is 500 ml, not 750" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || note.trim().length < 3} onClick={() => send("changes")}>
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              Send to FLOW
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => send("approve")} aria-label={`Approve the listing for ${productName}`}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            Approve
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode("changes")} aria-label={`Request changes to the listing for ${productName}`}>
            <MessageSquareText size={16} aria-hidden />
            Request changes
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Portal link controls on the internal Clients page. */
export function ShareLink({ clientId, token, name }: { clientId: number; token: string | null; name: string }) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const text = "rounded text-[13px] font-medium text-moss underline-offset-2 hover:text-forest hover:underline disabled:opacity-60";

  if (!token) {
    return (
      <button type="button" className={`inline-flex items-center gap-1.5 ${text}`} disabled={pending} onClick={() => start(() => createShareLinkAction(clientId))} aria-label={`Create a client portal link for ${name}`}>
        {pending ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Link2 size={13} aria-hidden />}
        Create portal link
      </button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", `${window.location.origin}/share/${token}`);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className={`inline-flex items-center gap-1.5 ${text}`} onClick={copy} aria-label={`Copy the portal link for ${name}`}>
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? "Copied" : "Copy portal link"}
      </button>
      <a href={`/share/${token}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 ${text}`} aria-label={`Open the portal for ${name}`}>
        <ExternalLink size={13} aria-hidden />
        Open
      </a>
      <button type="button" className="rounded text-[13px] text-mute underline-offset-2 hover:text-danger hover:underline disabled:opacity-60" disabled={pending}
        onClick={() => window.confirm(`Turn off the portal link for ${name}? The old link stops working.`) && start(() => revokeShareLinkAction(clientId))}>
        Turn off
      </button>
    </span>
  );
}
