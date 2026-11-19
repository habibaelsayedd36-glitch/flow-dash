import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AiKeyForm } from "@/components/AiKeyForm";
import { DeleteAllDataButton } from "@/components/DeleteAllDataButton";
import { PageHeader } from "@/components/ui";
import { PROVIDERS, getAiProvider, maskKey, type ProviderId } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings & AI Key" };

const SAMPLE = `{
  "name": "Full name",
  "phone": "01xxxxxxxxx",
  "email": "name@example.com",
  "platform": "Amazon",
  "products": "150",
  "service": "Growth plan — 150 products / month",
  "message": "What they wrote"
}`;

export default async function SettingsPage() {
  const [provider, h] = await Promise.all([getAiProvider(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-dashboard-address";
  const endpoint = `${h.get("x-forwarded-proto") ?? "https"}://${host}/api/leads`;
  const code = "mt-1.5 overflow-x-auto rounded-xl bg-flow-bg-soft px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground";

  return (
    <>
      <PageHeader title="Settings & AI Key" sub="Connect the AI model that writes for you, and the website form that feeds the Leads Inbox." />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AiKeyForm
            providers={(Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ id, label: PROVIDERS[id].label, defaultModel: PROVIDERS[id].defaultModel }))}
            current={provider ? { id: provider.id, label: provider.label, model: provider.model, masked: maskKey(provider.key), source: provider.source } : null}
          />

          <section className="card border border-red-200 p-5 sm:p-6" aria-labelledby="data-delete-title">
            <h2 id="data-delete-title" className="h-section text-red-700">Danger zone · Delete data</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Permanently clear all clients, products, listings, invoices, leads and operational records. Login accounts and system settings are preserved. This cannot be undone.
            </p>
            <div className="mt-4"><DeleteAllDataButton /></div>
          </section>

          <section id="lead-intake" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="intake-title">
            <h2 id="intake-title" className="h-section">Website lead form</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Point the contact form on your website at this address. Every enquiry then lands in the Leads Inbox, and the workflow engine opens a task for Sales.
            </p>
            <p className="eyebrow mt-5">Send to</p>
            <pre className={code} dir="ltr">
              <code>POST {endpoint}</code>
            </pre>
            <p className="eyebrow mt-5">Fields, as JSON or form data</p>
            <pre className={code} dir="ltr">
              <code>{SAMPLE}</code>
            </pre>
            <ul className="mt-4 flex list-disc flex-col gap-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
              <li>A name is required, and either a phone number or an email address.</li>
              <li>Only pages on flow-agency-eg.com may post from a browser. Set LEADS_ALLOWED_ORIGINS to allow another site.</li>
              <li>Add a hidden field named “website” to the form. Bots fill it in and are dropped; people never see it.</li>
              <li>Each IP address can send 5 enquiries a minute.</li>
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card p-5 sm:p-6" aria-labelledby="where">
            <h2 id="where" className="h-section">Where the key is used</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted-foreground">
              <li>AI Listing Studio: titles, bullets and descriptions in English and Arabic.</li>
              <li>Listing Automation: copy for every row, plus spec estimates that are always flagged.</li>
              <li>Workflow Engine: the rule that drafts a listing when a product reaches Listing optimization.</li>
              <li>Reviews & Health: reply drafts, which a person edits and posts.</li>
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Image Clean-up runs locally in your browser and does not use an AI key. OpenRouter works for text and listing generation; Image Angles currently requires a Google Gemini or OpenAI image model.</p>
          </section>

          <aside className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-soft p-4 sm:p-5">
            <ShieldAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-ink" />
            <div className="text-sm leading-relaxed text-amber-900">
              <h2 className="text-sm text-amber-ink">This dashboard has no login yet</h2>
              <p className="mt-1">
                The key is stored on the server and never sent back to the browser, but anyone who has the dashboard link can spend its quota or replace it. Keep the link private and set
                a spending limit with your provider.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
