"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Bell, CalendarDays, ChevronDown, CircleHelp, Factory, Menu, UserRound, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEMO_LABEL } from "@/lib/demo";
import { navigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace-store";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <div className="flex h-full flex-col bg-white">
    <div className="flex h-[78px] items-center gap-3 border-b border-[#e7ece9] px-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#27664d] text-white"><Factory size={21} strokeWidth={1.8} /></div>
      <div className="min-w-0"><div className="text-[16px] font-bold tracking-[-0.035em] text-[#1f3027]">FactoryPulse<span className="text-[#27664d]">.</span></div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a9990]">Decision intelligence</div></div>
    </div>
    <div className="px-4 pt-6 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#97a29b]">Workspace</div>
    <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-5">
      {navigation.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors", active ? "bg-[#e8f1ec] text-[#27664d]" : "text-[#58675f] hover:bg-[#f3f6f4] hover:text-[#273b2f]")}>
          <Icon size={18} strokeWidth={active ? 2 : 1.8} /><span className="flex-1">{item.label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[#27664d]" />}
        </Link>;
      })}
    </nav>
    <div className="border-t border-[#e7ece9] p-4">
      <div className="rounded-lg border border-[#e4eae6] bg-[#f9fbfa] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#35453b]"><CircleHelp size={15} /> Demo workspace</div>
        <p className="mt-1.5 text-[11px] leading-4 text-[#738078]">Fictional factory profile for product demonstration.</p>
        <p className="mt-2 text-[10px] font-semibold text-[#27664d]">{DEMO_LABEL}</p>
      </div>
    </div>
  </div>;
}

function TopBar() {
  const { selectedDate, shift, factoryName, factoryLocation, setSelectedDate, setShift, setMobileNavOpen } = useWorkspaceStore();
  return <header className="sticky top-0 z-20 border-b border-[#e3e9e5] bg-white">
    <div className="flex min-h-[78px] items-center gap-3 px-4 sm:px-6 lg:px-8">
      <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></Button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#26362d] sm:text-[15px]">{factoryName}</div>
        <div className="mt-0.5 truncate text-xs text-[#819087]">{factoryLocation}</div>
      </div>
      <div className="hidden items-center gap-2 xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#9aa8a0]" /><span className="text-xs font-semibold tracking-[0.08em] text-[#a1aba5]">LIVE</span><span className="text-[#cbd4ce]">/</span><Badge variant="green"><span className="h-1.5 w-1.5 rounded-full bg-[#3c9461]" /> SIMULATION</Badge></div>
      <div className="hidden h-7 w-px bg-[#e5eae7] xl:block" />
      <label className="hidden items-center gap-2 rounded-lg border border-[#e2e8e4] bg-white px-3 py-2 text-xs font-medium text-[#58685f] md:flex">
        <CalendarDays size={15} /><span className="sr-only">Selected date</span><input aria-label="Selected date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="max-w-[118px] border-0 bg-transparent text-xs text-[#46584c] outline-none" />
      </label>
      <label className="hidden items-center gap-1 rounded-lg border border-[#e2e8e4] bg-white px-3 py-2 text-xs font-medium text-[#58685f] sm:flex">
        <span className="sr-only">Current shift</span><select value={shift} onChange={(event) => setShift(event.target.value)} className="appearance-none bg-transparent pr-1 text-xs text-[#46584c] outline-none"><option>Shift 1</option><option>Shift 2</option></select><ChevronDown size={13} />
      </label>
      <Button variant="ghost" size="icon" aria-label="Notifications" title="Notifications: no new items"><Bell size={18} strokeWidth={1.8} /></Button>
      <div className="hidden h-7 w-px bg-[#e5eae7] sm:block" />
      <Button variant="ghost" size="icon" aria-label="Demo user profile" title="Demo user profile"><UserRound size={19} strokeWidth={1.8} /></Button>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-[#edf1ee] px-4 py-2 text-[11px] text-[#748178] sm:px-6 lg:hidden"><Badge variant="green">SIMULATION</Badge><span>{DEMO_LABEL}</span><span className="sm:hidden">· {shift}</span><span className="sm:hidden">· {format(parseISO(selectedDate), "dd MMM yyyy")}</span></div>
  </header>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mobileNavOpen, setMobileNavOpen } = useWorkspaceStore();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/factory-setup" || pathname === "/") return;
    let active = true;
    fetch("/api/factory-model", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active && body?.factory) useWorkspaceStore.getState().setFactoryProfile(body.factory); })
      .catch(() => {});
    return () => { active = false; };
  }, [pathname]);
  return <div className="min-h-screen bg-[#f6f8f7]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-[#e1e7e4] lg:block"><Sidebar /></aside>
    {mobileNavOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-[#18251e]/35" onClick={() => setMobileNavOpen(false)} /><aside className="relative h-full w-[min(280px,85vw)] border-r border-[#e1e7e4] shadow-xl"><Sidebar onNavigate={() => setMobileNavOpen(false)} /><Button className="absolute right-3 top-5" variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></Button></aside></div>}
    <div className="lg:pl-[260px]"><TopBar /><main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">{children}</main></div>
  </div>;
}
