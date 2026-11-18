"use client";

import {
  Boxes,
  BrainCircuit,
  Camera,
  Eraser,
  FileSpreadsheet,
  FileText,
  Inbox,
  Kanban,
  LayoutDashboard,
  Megaphone,
  Menu,
  Settings,
  ShoppingBag,
  Star,
  TrendingUp,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";
import { SignOutButton } from "./SignOutButton";

type Item = { href: string; label: string; icon: LucideIcon; also?: string[] };

const GROUPS: { label: string | null; items: Item[] }[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/listings", label: "Listings", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/intelligence", label: "AI Commerce Intelligence", icon: BrainCircuit },
    ],
  },
  {
    label: "Commerce Hub",
    items: [
      { href: "/orders", label: "Orders", icon: ShoppingBag },
      { href: "/pipeline", label: "Studio Pipeline", icon: Kanban },
      { href: "/clients", label: "Clients", icon: Users, also: ["/billing"] },
    ],
  },
  {
    label: "Automations",
    items: [
      { href: "/tools/cleanup", label: "Image Clean-up", icon: Eraser },
      { href: "/tools/shots", label: "Image Angles", icon: Camera },
      { href: "/tools/listing", label: "Listing Automation", icon: FileSpreadsheet, also: ["/tools/jobs"] },
      { href: "/automations", label: "Workflow Engine", icon: Workflow, also: ["/tasks"] },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/keywords", label: "Keywords & Ranks", icon: TrendingUp },
      { href: "/ads", label: "Advertising", icon: Megaphone },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/reviews", label: "Reviews & Health", icon: Star },
    ],
  },
  {
    label: "Intake & System",
    items: [
      { href: "/leads", label: "Leads Inbox", icon: Inbox },
      { href: "/settings", label: "Settings & AI Key", icon: Settings },
    ],
  },
];

export function AppNav({ userName, userEmail }: { userName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // The client portal (Flow Space) is a separate, public surface: no team navigation there.
  if (pathname.startsWith("/share")) return null;

  const isActive = (item: Item) => (item.href === "/" ? pathname === "/" : [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`)));

  const logo = (
    <Link href="/" className="inline-flex rounded-md" aria-label="Flow Dashboard home">
      <Brand />
    </Link>
  );

  const links = (
    <nav aria-label="Main navigation" className="flex flex-col gap-4">
      {GROUPS.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label && <p className="eyebrow mb-1.5 px-3">{group.label}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors lg:h-8 ${
                      active
                        ? "bg-secondary text-flow-green before:absolute before:-start-3 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-e-full before:bg-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = <div className="mt-auto border-t border-border px-2 pt-4"><div className="mb-3 min-w-0"><p className="truncate text-sm font-semibold text-foreground">{userName || "FLOW team"}</p>{userEmail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{userEmail}</p>}</div><SignOutButton /></div>;

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-e border-border bg-card px-3 pb-4 lg:flex">
        <div className="flex h-16 shrink-0 items-center px-2">{logo}</div>
        {links}
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
        {logo}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-me-2 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu size={22} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Main navigation">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-flow-green-deep/50" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="rise absolute inset-y-0 start-0 flex w-[84%] max-w-xs flex-col gap-4 overflow-y-auto bg-card px-3 pb-4 shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between ps-1">
              {logo}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={22} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            {links}
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
