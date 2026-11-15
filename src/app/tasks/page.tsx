import type { Metadata } from "next";
import { TaskBoard, type TaskView } from "@/components/TaskBoard";
import { PageHeader, SubNav, pname, taskTitle } from "@/components/ui";
import { waLink } from "@/lib/catalog";
import { getTasks } from "@/lib/data";
import { shortDate, tpl } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const [{ locale, t }, rows] = await Promise.all([getI18n(), getTasks()]);
  const now = new Date();
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
  const today = dayKey(now);

  // Dates are resolved on the server so the client never re-computes "now".
  const tasks: TaskView[] = rows.map((r) => {
    let due: TaskView["due"] = null;
    if (r.dueAt && !r.done) {
      const key = dayKey(r.dueAt);
      due = key < today ? { state: "overdue", text: t.tasks.overdue } : key === today ? { state: "today", text: t.tasks.today } : { state: "later", text: tpl(t.tasks.due, { d: shortDate(r.dueAt, locale) }) };
    }
    return {
      id: r.id,
      title: taskTitle(r, t),
      context: [pname(locale, r.productName, r.productNameAr), r.clientName].filter(Boolean).join(" · "),
      team: r.team,
      done: r.done,
      auto: r.automationId !== null,
      due,
      wa: r.waText && r.clientPhone ? waLink(r.clientPhone, r.waText) : null,
      listingId: r.listingId,
    };
  });

  return (
    <>
      <PageHeader title={t.tasks.title} sub={t.tasks.sub} />
      <SubNav current="/tasks" items={[{ href: "/automations", label: "Rules" }, { href: "/tasks", label: "Tasks" }]} />
      <TaskBoard locale={locale} tasks={tasks} />
    </>
  );
}
