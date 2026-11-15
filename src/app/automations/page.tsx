import { History } from "lucide-react";
import type { Metadata } from "next";
import { RulesManager, ScheduledChecks } from "@/components/AutomationsClient";
import { Empty, PageHeader, RunItem, SubNav } from "@/components/ui";
import { getAutomations, getRuns, getSetting } from "@/lib/data";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workflow Engine" };

export default async function AutomationsPage() {
  const [{ locale, t }, rules, runs, lastTick] = await Promise.all([getI18n(), getAutomations(), getRuns(40), getSetting("last_tick")]);

  return (
    <>
      <PageHeader title={t.automations.title} sub={t.automations.sub} />
      <SubNav current="/automations" items={[{ href: "/automations", label: "Rules" }, { href: "/tasks", label: "Tasks" }]} />

      <RulesManager
        locale={locale}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          nameAr: r.nameAr,
          trigger: r.trigger,
          condition: r.condition,
          action: r.action,
          config: r.config,
          enabled: r.enabled,
          runCount: r.runCount,
          lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
        }))}
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-5 sm:p-6" aria-labelledby="history">
          <h2 id="history" className="h-section">{t.automations.history}</h2>
          {runs.length === 0 ? (
            <div className="mt-4">
              <Empty icon={<History size={18} aria-hidden />}>{t.automations.noHistory}</Empty>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {runs.map((run) => (
                <RunItem key={run.id} run={run} t={t} locale={locale} />
              ))}
            </ul>
          )}
        </section>
        <ScheduledChecks locale={locale} lastTick={lastTick} />
      </div>
    </>
  );
}
