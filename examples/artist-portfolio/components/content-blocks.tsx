import Link from "next/link";

import { CmsImage } from "@/components/cms-image";
import type { Artwork } from "@/data/cms0";
import type { RichText as CmsRichText } from "@cms0/cms0/custom-types";

export function Eyebrow({
  children,
  className = "",
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-[0.18em] ${
        tone === "dark" ? "text-white/60" : "text-[var(--clay)]"
      } ${className}`}
    >
      {children}
    </p>
  );
}

export function RichText({
  html,
  className = "",
}: {
  html?: string | CmsRichText;
  className?: string;
}) {
  const resolvedHtml = typeof html === "string" ? html : html?.html;

  if (!resolvedHtml) {
    return (
      <p className={className}>
        This section is ready for editor-written content.
      </p>
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: resolvedHtml }}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-neutral-950 sm:text-6xl">
          {title}
        </h1>
        {body ? (
          <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-700">
            {body}
          </p>
        ) : null}
      </div>
      {action ? (
        <Link
          className="w-fit rounded-full border border-neutral-950/15 bg-white/50 px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-white"
          href={action.href}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ArtworkCard({ artwork }: { artwork: Artwork }) {
  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-white/55 transition hover:-translate-y-1 hover:bg-white">
      <CmsImage
        image={artwork.image}
        alt={artwork.title}
        className="aspect-[4/5]"
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold leading-tight text-neutral-950">
              {artwork.title}
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              {artwork.year} / {artwork.medium}
            </p>
          </div>
          <p className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-neutral-600">
            {artwork.available ? "Available" : "Archive"}
          </p>
        </div>
        <p className="mt-4 text-sm leading-6 text-neutral-600">
          {artwork.summary}
        </p>
        <div className="mt-5 flex gap-2">
          {artwork.palette.slice(0, 4).map((color) => (
            <span
              aria-label={`Palette color ${color}`}
              className="h-5 w-5 rounded-full border border-neutral-950/10"
              key={color}
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
