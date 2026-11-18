"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAllOperationalDataAction } from "@/app/actions-tools";

export function DeleteAllDataButton() {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={busy}
        className="btn border border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => {
          const confirmation = window.prompt('This permanently deletes all clients, products, listings, invoices, leads and operational records. Login accounts and settings stay. Type DELETE ALL to continue.');
          if (confirmation !== "DELETE ALL") return;
          setMessage("");
          startTransition(async () => {
            const result = await deleteAllOperationalDataAction();
            setMessage(result.ok ? "All operational data was deleted." : "Deletion failed.");
            router.refresh();
          });
        }}
      >
        {busy ? "Deleting…" : "Delete All Operational Data"}
      </button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
