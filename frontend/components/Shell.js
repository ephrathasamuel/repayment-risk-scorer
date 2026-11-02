"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Portfolio" },
  { href: "/apply", label: "New application" },
  { href: "/batch", label: "Batch upload" },
  { href: "/models", label: "Models" },
];

// Reads the URL, so it renders inside <Suspense> (required with cacheComponents on dynamic routes).
function DesktopLinks() {
  const pathname = usePathname();
  const active = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return LINKS.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      className={`rounded-md px-3 py-1.5 text-sm ${active(l.href) ? "bg-white/15 font-semibold" : "text-teal-50 hover:bg-white/10"}`}
    >
      {l.label}
    </Link>
  ));
}

function PlainLinks() {
  return LINKS.map((l) => (
    <Link key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm text-teal-50 hover:bg-white/10">
      {l.label}
    </Link>
  ));
}

export default function Shell({ children }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api("/api/auth/me").then(setUser).catch(() => {});
  }, []);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-teal-900/20 bg-teal-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-teal-500 text-sm font-bold text-teal-950">R</span>
            <span>Repayment Risk Scorer</span>
          </Link>
          <button
            className="rounded-md px-2 py-1 text-sm ring-1 ring-white/30 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
          >
            Menu
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            <Suspense fallback={<PlainLinks />}>
              <DesktopLinks />
            </Suspense>
          </nav>
          <div className="hidden items-center gap-3 text-sm md:flex">
            {user && (
              <span className="text-teal-100">
                {user.email} · <span className="capitalize">{user.role}</span>
              </span>
            )}
            <button onClick={signOut} className="rounded-md px-2 py-1 ring-1 ring-white/30 hover:bg-white/10">
              Sign out
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-white/10 px-4 pb-3 md:hidden">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-sm">
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
              <span className="text-teal-100">{user?.email}</span>
              <button onClick={signOut}>Sign out</button>
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500">
        Portfolio prototype. Model trained on the public UCI &quot;Default of Credit Card Clients&quot; dataset (Taiwan, 2005);
        limits and prices are illustrative rules. Not for real lending decisions.
      </footer>
    </div>
  );
}
