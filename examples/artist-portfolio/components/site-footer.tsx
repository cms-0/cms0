import Link from "next/link";

import type { FooterContent } from "@/data/cms0";

export function SiteFooter({ footer }: { footer: FooterContent }) {
  return (
    <footer className="border-t border-[var(--line)] bg-neutral-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div>
          <p className="text-3xl font-semibold">{footer.heading}</p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">
            {footer.summary}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-white/50">Navigate</p>
            <div className="mt-3 grid gap-2">
              {footer.links.map((link) => (
                <Link
                  className="text-sm text-white/78 transition hover:text-white"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-white/50">Social</p>
            <div className="mt-3 grid gap-2">
              {footer.socialLinks.map((link) => (
                <a
                  className="text-sm text-white/78 transition hover:text-white"
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl border-t border-white/10 px-5 py-5 text-xs text-white/45 sm:px-8 lg:px-10">
        {footer.copyright}
      </div>
    </footer>
  );
}
