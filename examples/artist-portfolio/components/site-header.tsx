import Link from "next/link";

import type { HeaderContent } from "@/data/cms0";

export function SiteHeader({ header }: { header: HeaderContent }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8 lg:px-10">
        <Link className="flex items-center gap-3" href="/">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-neutral-950 text-sm font-semibold text-white">
            MV
          </span>
          <span>
            <span className="block text-sm font-semibold text-neutral-950">
              {header.studioName}
            </span>
            <span className="block text-xs text-neutral-500">
              {header.tagline}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {header.navItems.map((item) => (
            <Link
              className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-white/55 hover:text-neutral-950"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          className="rounded-full bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          href="/contact"
        >
          {header.ctaLabel}
        </Link>
      </div>
    </header>
  );
}
