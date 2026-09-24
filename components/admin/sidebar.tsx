"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users2,
  Database,
  UserRound,
  RadioTower,
  BarChart3,
  PieChart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/admin/roles", label: "Roles", icon: Users2 },
  { href: "/admin/question-bank", label: "Question Bank", icon: Database },
  { href: "/admin/candidates", label: "Candidates", icon: UserRound },
  { href: "/admin/live-monitoring", label: "Live Monitoring", icon: RadioTower },
  { href: "/admin/results", label: "Results", icon: BarChart3 },
  { href: "/admin/reports", label: "Reports", icon: PieChart },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
          A
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-sidebar-foreground">Assistlana</p>
          <p className="text-xs text-muted-foreground leading-tight">Assessment Platform</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
