"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteClientAction } from "@/app/actions-tools";

export function DeleteClientButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        className="btn btn-ghost btn-icon text-red-600"
        title={`Delete ${clientName}`}
        aria-label={`Delete ${clientName}`}
        onClick={() => {
          if (!window.confirm(`Delete ${clientName} and all related products, listings, invoices and records? This cannot be undone.`)) return;
          setError("");
          startTransition(async () => {
            const result = await deleteClientAction(clientId);
            if (!result.ok) { setError("Could not delete this client."); return; }
            router.refresh();
          });
        }}
      >
        <Trash2 size={15} aria-hidden />
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
