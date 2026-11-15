"use client";

import { Check, Copy, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { convertLeadAction, draftReviewReplyAction, saveReviewReplyAction, setReviewStatusAction } from "@/app/actions-growth";

/** Reply editor for one review. Nothing is posted to a marketplace: the text is prepared here and posted by a person. */
export function ReviewReply({ id, status, reply, aiReady }: { id: number; status: string; reply: string; aiReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reply);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "save" | "resolve">("");
  const [copied, setCopied] = useState(false);

  const draft = async () => {
    setBusy("draft");
    setNote(null);
    const res = await draftReviewReplyAction(id);
    setBusy("");
    if (res.ok && res.text) {
      setText(res.text);
      setNote({ ok: true, text: "Draft ready. Read it and edit it before you save." });
    } else setNote({ ok: false, text: res.error ?? "The draft could not be written." });
  };
  const save = async () => {
    setBusy("save");
    const res = await saveReviewReplyAction(id, text);
    setBusy("");
    setNote({ ok: res.ok, text: res.message ?? "" });
  };
  const resolve = async () => {
    setBusy("resolve");
    await setReviewStatusAction(id, "resolved");
    setBusy("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNote({ ok: false, text: "Copying is blocked in this browser. Select the text and copy it by hand." });
    }
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <MessageSquareText size={14} aria-hidden />
          {reply ? "Edit reply" : "Write reply"}
        </button>
        {status !== "resolved" && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={resolve} disabled={busy !== ""}>
            {busy === "resolve" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
            Mark resolved
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl border border-border bg-flow-bg-soft p-4">
          <label className="label" htmlFor={`reply-${id}`}>Reply</label>
          <textarea id={`reply-${id}`} className="field" rows={4} dir="auto" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy !== "" || text.trim().length === 0}>
              {busy === "save" && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Save reply
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={draft} disabled={busy !== "" || !aiReady}>
              {busy === "draft" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              {busy === "draft" ? "Drafting…" : "Draft with AI"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy} disabled={text.trim().length === 0}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Replies are not posted for you. Copy the text and post it in the seller portal.
            {!aiReady && " Drafting with AI needs a key in Settings & AI Key."}
          </p>
          <div role="status" aria-live="polite">
            {note?.text && <p className={`mt-2 text-[13px] ${note.ok ? "text-flow-green" : "text-destructive"}`}>{note.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Turns a won lead into a client on the chosen plan. */
export function LeadConvert({ id, suggested, plans }: { id: number; suggested: string; plans: { value: string; label: string }[] }) {
  const [plan, setPlan] = useState(suggested);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`plan-${id}`}>Plan for the new client</label>
      <select id={`plan-${id}`} className="field !min-h-8 w-auto !py-1 text-[13px]" value={plan} onChange={(e) => setPlan(e.target.value)}>
        {plans.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await convertLeadAction(id, plan);
            setNote(res.message ?? "");
          })
        }
      >
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        Convert to client
      </button>
      {note && <span role="status" className="text-[13px] text-muted-foreground">{note}</span>}
    </span>
  );
}
