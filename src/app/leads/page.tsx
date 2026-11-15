import { Inbox, Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLeadAction, deleteLeadAction, setLeadStatusAction } from "@/app/actions-growth";
import { DeleteButton, StatusSelect, Toolbar } from "@/components/Crud";
import { LeadConvert } from "@/components/GrowthClient";
import { Empty, FilterTabs, PageHeader, StatCard } from "@/components/ui";
import { LEAD_PLATFORMS, LEAD_SERVICES, LEAD_SOURCES, LEAD_STATUSES, PLAN_IDS, waLink, waNumber } from "@/lib/catalog";
import { getLeads } from "@/lib/data-growth";
import { dictFor, num, timeAgo } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leads Inbox" };

const STATUS: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };
const SOURCE: Record<string, string> = { website: "Website", manual: "Added by hand", whatsapp: "WhatsApp", referral: "Referral", facebook: "Facebook", instagram: "Instagram" };
const FUNNEL = ["new", "contacted", "qualified", "proposal", "won"] as const;

/** The plan that matches what the lead asked for on the website form. */
function planFor(service: string): string {
  const s = service.toLowerCase();
  if (s.includes("growth")) return "growth";
  if (s.includes("starter")) return "starter";
  if (s.includes("scale")) return "scale";
  if (s.includes("basic")) return "am_basic";
  if (s.includes("premium")) return "am_premium";
  return "per_item";
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = (LEAD_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const all = await getLeads();
  const rows = status ? all.filter((l) => l.status === status) : all;
  const t = dictFor("en");
  const countOf = (s: string) => all.filter((l) => l.status === s).length;
  const won = countOf("won");
  const closed = won + countOf("lost");
  const peak = Math.max(1, ...FUNNEL.map(countOf));
  const statusOpts = LEAD_STATUSES.map((s) => ({ value: s, label: STATUS[s] }));
  const planOpts = PLAN_IDS.map((p) => ({ value: p, label: t.plan[p] }));

  return (
    <>
      <PageHeader title="Leads Inbox" sub="Enquiries from the website form and the ones you add yourself, from first contact to signed client." />

      <section className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Lead summary">
        <StatCard label="New" value={num(countOf("new"))} hint="Not contacted yet" />
        <StatCard label="Open leads" value={num(all.length - closed)} hint="Everything not won or lost" />
        <StatCard label="Won" value={num(won)} hint={`Lost: ${countOf("lost")}`} />
        <StatCard label="Win rate" value={closed ? `${Math.round((won / closed) * 100)}%` : "—"} hint="Won out of won and lost" />
      </section>

      <section className="card mb-6 p-5 sm:p-6" aria-labelledby="funnel-title">
        <h2 id="funnel-title" className="h-section">Funnel</h2>
        <ol className="mt-4 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-5">
          {FUNNEL.map((s) => (
            <li key={s}>
              <span className="num block font-display text-2xl font-bold leading-none text-flow-green">{countOf(s)}</span>
              <span className="mt-1.5 block text-sm text-muted-foreground">{STATUS[s]}</span>
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span className="block h-full rounded-full bg-flow-green-light" style={{ width: `${(countOf(s) / peak) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Toolbar
        add={{
          button: "Add lead",
          title: "Add a lead",
          submit: "Add lead",
          action: createLeadAction,
          fields: [
            { name: "name", label: "Full name", required: true },
            { name: "phone", label: "Phone / WhatsApp", type: "tel", dir: "ltr", placeholder: "01xxxxxxxxx" },
            { name: "email", label: "Email address", type: "email", dir: "ltr" },
            { name: "source", label: "Where it came from", type: "select", defaultValue: "manual", options: LEAD_SOURCES.map((s) => ({ value: s, label: SOURCE[s] })) },
            { name: "platform", label: "Platform", type: "select", options: LEAD_PLATFORMS.map((p) => ({ value: p, label: p })) },
            { name: "productsCount", label: "Number of products" },
            { name: "service", label: "Service interested in", type: "select", wide: true, defaultValue: "Not Sure Yet", options: LEAD_SERVICES.map((s) => ({ value: s, label: s })) },
            { name: "message", label: "Message", type: "textarea" },
          ],
        }}
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Website enquiries arrive here on their own once the contact form posts to this dashboard.{" "}
          <Link href="/settings#lead-intake" className="font-medium text-flow-green hover:underline">See how to connect it</Link>
        </p>
      </Toolbar>

      <FilterTabs
        label="Lead status"
        tabs={[{ href: "/leads", label: `All (${all.length})`, active: !status }, ...LEAD_STATUSES.map((s) => ({ href: `/leads?status=${s}`, label: `${STATUS[s]} (${countOf(s)})`, active: status === s }))]}
      />

      {rows.length === 0 ? (
        <Empty icon={<Inbox size={18} aria-hidden />}>No leads here. New enquiries from the website form show up at the top of this list.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((l) => {
            const first = l.name.split(" ")[0];
            const greeting = `أهلاً ${first}، معاك فريق FLOW Agency. وصلنا طلبك${l.service && l.service !== "Not Sure Yet" ? ` بخصوص «${l.service}»` : ""}. إمتى يناسبك نتكلم 10 دقايق علشان نعرف تفاصيل منتجاتك؟`;
            const facts = [l.service, l.platform, l.productsCount && `Products: ${l.productsCount}`].filter(Boolean);
            return (
              <li key={l.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h3 className="text-base text-flow-green" dir="auto">{l.name}</h3>
                    {facts.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{facts.join(" · ")}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {l.status === "new" && <span className="pill pill-lime">New</span>}
                    <span className="pill pill-mute">{SOURCE[l.source] ?? l.source}</span>
                    <span className="whitespace-nowrap text-[13px] text-muted-foreground">{timeAgo(l.createdAt, "en")}</span>
                  </div>
                </div>

                {l.message && <p className="mt-3 text-sm leading-relaxed text-foreground" dir="auto">{l.message}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {l.phone && (
                    <>
                      <a href={waLink(l.phone, greeting)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                        <MessageCircle size={14} aria-hidden />
                        WhatsApp
                      </a>
                      <a href={`tel:+${waNumber(l.phone)}`} className="btn btn-ghost btn-sm">
                        <Phone size={14} aria-hidden />
                        <span dir="ltr">{l.phone}</span>
                      </a>
                    </>
                  )}
                  {l.email && (
                    <a href={`mailto:${l.email}`} className="btn btn-ghost btn-sm">
                      <Mail size={14} aria-hidden />
                      <span dir="ltr">{l.email}</span>
                    </a>
                  )}
                  <span className="ms-auto flex flex-wrap items-center gap-2">
                    {l.clientId ? (
                      <Link href="/clients" className="pill pill-ok">Now a client</Link>
                    ) : (
                      l.status === "won" && <LeadConvert id={l.id} suggested={planFor(l.service)} plans={planOpts} />
                    )}
                    <StatusSelect value={l.status} options={statusOpts} label={`Status of ${l.name}`} action={setLeadStatusAction.bind(null, l.id)} />
                    <DeleteButton label={`Delete the lead ${l.name}`} confirm="Delete this lead?" action={deleteLeadAction.bind(null, l.id)} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
