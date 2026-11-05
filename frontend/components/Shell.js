"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, who } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Portfolio", no: "01" },
  { href: "/apply", label: "New application", no: "02" },
  { href: "/batch", label: "Batch upload", no: "03" },
  { href: "/models", label: "Models", no: "04" },
];

function NavItem({ link, active, onClick }) {
  return (
    <Link
      href={link.href}
      onClick={onClick}
      className={`flex items-baseline gap-3 border-l-2 py-2.5 pl-4 pr-3 text-sm transition ${
        active ? "border-brass bg-white/[0.06] text-white" : "border-transparent text-wine-200 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      <span className={`font-mono text-[10px] ${active ? "text-brass" : "text-wine-400"}`}>{link.no}</span>
      {link.label}
    </Link>
  );
}

// Reads the URL, so it renders inside <Suspense> (required with cacheComponents on dynamic routes).
function ActiveLinks({ onNavigate }) {
  const pathname = usePathname();
  const active = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return LINKS.map((l) => <NavItem key={l.href} link={l} active={active(l.href)} onClick={onNavigate} />);
}

function PlainLinks() {
  return LINKS.map((l) => <NavItem key={l.href} link={l} active={false} />);
}

function Wordmark() {
  return (
    <Link href="/" className="block">
      <span className="display block text-2xl leading-none text-white">Repayment</span>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.25em] text-brass">Risk Scorer</span>
    </Link>
  );
}

export default function Shell({ children }) {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api("/api/auth/me").then(setUser).catch(() => {});
  }, []);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // A full page load on sign-out clears every bit of client state.
    window.location.href = new URL("/login", window.location.origin).href;
  }

  const account = (
    <div className="border-t border-white/10 px-4 py-4 text-sm">
      {user && (
        <>
          <div className="truncate text-white">{who(user.email)}</div>
          <div className="text-xs capitalize text-wine-300">{user.role}</div>
        </>
      )}
      <button onClick={signOut} className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-brass hover:text-white">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop: oxblood sidebar that stays in place while the page scrolls */}
      <aside className="hidden w-60 shrink-0 flex-col bg-wine-900 md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-5 pb-8 pt-7">
          <Wordmark />
        </div>
        <nav className="flex-1 space-y-0.5">
          <Suspense fallback={<PlainLinks />}>
            <ActiveLinks />
          </Suspense>
        </nav>
        {account}
      </aside>

      {/* Phone: slim top bar with a drop-down menu */}
      <header className="bg-wine-900 md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <button
            className="rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-brass ring-1 ring-white/20"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
          >
            Menu
          </button>
        </div>
        {open && (
          <nav className="border-t border-white/10 pb-1">
            <Suspense fallback={<PlainLinks />}>
              <ActiveLinks onNavigate={() => setOpen(false)} />
            </Suspense>
            {account}
          </nav>
        )}
      </header>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-stone-500 sm:px-8">
          Portfolio prototype. Model trained on the public UCI &quot;Default of Credit Card Clients&quot; dataset (Taiwan, 2005);
          limits and prices are illustrative rules. Not for real lending decisions.
        </footer>
      </div>
    </div>
  );
}
