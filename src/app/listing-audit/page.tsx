import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { clients, listings, products } from "@/db/schema";
import { isMarketplace } from "@/lib/catalog";
import { checkListing, scoreOf, type ListingContent } from "@/lib/rules";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listing Audit" };

const ISSUE_LABELS: Record<string, string> = {
  title_len: "Title missing or outside marketplace limits",
  title_soft: "Title is longer than the recommended length",
  title_chars: "Title contains restricted characters",
  title_repeat: "Repeated words in title",
  title_caps: "Excessive capital letters in title",
  title_promo: "Promotional or unsupported wording in title",
  title_brand_start: "Brand should appear at the beginning of the title",
  title_brand_forbidden: "Brand should not appear in this marketplace title",
  title_ar: "Arabic title is missing or incomplete",
  bullets_count: "Bullet points are missing",
  bullets_len: "One or more bullet points have an invalid length",
  bullets_ar: "Arabic bullet points are missing or incomplete",
  desc_len: "Description is missing or outside marketplace limits",
  desc_ar: "Arabic description is missing",
  terms_bytes: "Amazon search terms are missing or exceed the byte limit",
  terms_clean: "Search terms may contain formatting or brand-name issues",
  keywords_cov: "Target keywords have weak coverage",
  keyword_front: "Primary keyword is not near the start of the title",
  search_terms_empty: "Search terms are missing",
};

export default async function ListingAuditPage() {
  await ensureDb();
  const rows = await db.select({
    listing: listings,
    product: products,
    clientName: clients.name,
  }).from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .innerJoin(clients, eq(products.clientId, clients.id))
    .orderBy(desc(listings.updatedAt))
    .limit(250);

  const audited = rows.map(({ listing, product, clientName }) => {
    const marketplace = isMarketplace(listing.marketplace) ? listing.marketplace : "amazon";
    const content: ListingContent = {
      titleEn: listing.titleEn,
      titleAr: listing.titleAr,
      bulletsEn: listing.bulletsEn,
      bulletsAr: listing.bulletsAr,
      descriptionEn: listing.descriptionEn,
      descriptionAr: listing.descriptionAr,
      searchTerms: listing.searchTerms,
    };
    const checks = checkListing(content, marketplace, { brand: product.brand, keywords: product.keywords });
    const issues = checks.filter((check) => !check.pass).map((check) => ({
      id: check.id,
      label: ISSUE_LABELS[check.id] ?? check.id,
      severity: check.severity,
      detail: check.detail,
    }));
    if (marketplace === "amazon" && !listing.searchTerms.trim()) {
      issues.push({ id: "search_terms_empty", label: ISSUE_LABELS.search_terms_empty, severity: "error", detail: "0 keywords" });
    }
    const errors = issues.filter((issue) => issue.severity === "error").length;
    const warnings = issues.length - errors;
    const score = Math.max(0, scoreOf(checks) - (marketplace === "amazon" && !listing.searchTerms.trim() ? 8 : 0));
    return { listing, product, clientName, marketplace, issues, errors, warnings, score };
  });

  const totalIssues = audited.reduce((n, row) => n + row.issues.length, 0);
  const errorCount = audited.reduce((n, row) => n + row.errors, 0);
  const clean = audited.filter((row) => row.issues.length === 0).length;

  return (
    <>
      <PageHeader title="Listing Audit" sub="Review every saved listing for missing content, keyword gaps, marketplace rule violations and weak copy before export or publishing." />
      <section className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Audit summary">
        {[
          { label: "Listings audited", value: audited.length, hint: "Latest 250 listings" },
          { label: "Needs attention", value: audited.filter((row) => row.issues.length > 0).length, hint: "At least one issue" },
          { label: "Errors", value: errorCount, hint: "Higher-priority checks" },
          { label: "Passed", value: clean, hint: "No issues detected" },
        ].map((stat) => (
          <div key={stat.label} className="card flex flex-col p-5">
            <span className="text-[13px] text-mute">{stat.label}</span>
            <span className="num mt-3 font-display text-3xl font-bold leading-none text-flow-green">{stat.value}</span>
            <span className="mt-auto pt-3 text-[13px] text-mute">{stat.hint}</span>
          </div>
        ))}
      </section>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-mute">
        <ShieldCheck size={16} aria-hidden />
        {totalIssues} findings across {audited.length} listings. Checks use FLOW's marketplace rule set; always confirm final requirements in Seller Central or the marketplace portal.
      </div>
      {audited.length === 0 ? (
        <div className="card p-8 text-center">
          <ShieldCheck size={28} className="mx-auto text-mute" aria-hidden />
          <p className="mt-3 font-medium text-ink">No listings to audit yet</p>
          <p className="mt-1 text-sm text-mute">Generate your first listing to see its audit results here.</p>
          <Link href="/tools/listing" className="btn btn-primary mt-4">Open Listing Automation</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {audited.map(({ listing, product, clientName, marketplace, issues, errors, warnings, score }) => (
            <article key={listing.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/listings/${listing.id}`} className="font-semibold text-flow-green hover:underline">{product.name}</Link>
                  <p className="mt-1 text-xs text-mute">{clientName} · {marketplace.toUpperCase()} · Listing #{listing.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`pill ${score >= 85 ? "pill-ok" : score >= 65 ? "pill-warn" : "pill-danger"}`}>{score}/100</span>
                  {issues.length === 0 ? <span className="pill pill-ok"><CheckCircle2 size={12} /> Passed</span> : <span className="pill pill-warn"><AlertTriangle size={12} /> {issues.length} findings</span>}
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-ink">{listing.titleEn || "Missing English title"}</p>
              {issues.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {issues.map((issue) => (
                    <li key={issue.id} className="flex items-start gap-2 rounded-xl bg-sage-soft px-3 py-2.5 text-sm">
                      <AlertTriangle size={15} className={issue.severity === "error" ? "mt-0.5 shrink-0 text-danger" : "mt-0.5 shrink-0 text-amber-ink"} aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-ink">{issue.label}</span>
                        {issue.detail && <span className="mt-0.5 block text-xs text-mute">{issue.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 flex items-center gap-2 text-sm text-moss"><CheckCircle2 size={15} aria-hidden /> No issues found by the current checks.</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-mute">
                <span>{errors} errors</span><span>·</span><span>{warnings} warnings</span>
                <Link href={`/listings/${listing.id}`} className="ms-auto font-medium text-flow-green hover:underline">Review and edit listing</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
