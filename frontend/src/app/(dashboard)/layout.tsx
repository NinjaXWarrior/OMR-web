"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
  Building2,
  FileSearch,
  LayoutDashboard,
  Menu,
  ScanLine,
  UploadCloud,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useOmrJobStore } from "@/store/useOmrJobStore";
import type { Role } from "@/types/auth";

function useNavItems() {
  const { user } = useUser();
  const role = user?.publicMetadata?.role as Role | undefined;
  const activeJobId = useOmrJobStore((s) => s.activeJobId);

  if (role === "STUDENT") {
    return [{ href: "/student", icon: User, label: "My Results" }];
  }
  return [
    { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/admin/upload", icon: UploadCloud, label: "Upload Hub" },
    ...(activeJobId
      ? [
          {
            href: `/admin/checked-sheets/${activeJobId}`,
            icon: FileSearch,
            label: "Checked Sheets",
          },
        ]
      : []),
    ...(role === "SUPER_ADMIN"
      ? [{ href: "/super-admin", icon: Building2, label: "Organizations" }]
      : []),
  ];
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = useNavItems();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#1c5cab] text-primary-foreground shadow-sm">
          <ScanLine className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">OMR Platform</p>
          <p className="text-xs text-muted-foreground">Grading & analytics</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const role = user?.publicMetadata?.role as Role | undefined;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card lg:block">
        <Sidebar />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="bg-foreground/30 absolute inset-0 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl duration-200 animate-in slide-in-from-left">
            <button
              className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card/80 sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <p className="text-sm font-semibold">
              {role === "STUDENT" ? "Student Dashboard" : "Institute Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.primaryEmailAddress?.emailAddress}
            </span>
            <UserButton />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
