import type { Metadata } from "next";

import { Eyebrow, RichText, SectionHeading } from "@/components/content-blocks";
import { CmsImage } from "@/components/cms-image";
import { data, readCms } from "@/data/cms0";
import { aboutPageFallback } from "@/data/fallbacks";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const page = await readCms(
    () => data.aboutPage({ includeId: false, graph: { pageSize: "full" } }),
    aboutPageFallback,
  );

  return pageMetadata(page.seo, {
    title: "About",
    description: "The artist, process, exhibitions, and studio practice.",
  });
}

export default async function AboutPage() {
  const page = await readCms(
    () => data.aboutPage({ includeId: false, graph: { pageSize: "full" } }),
    aboutPageFallback,
  );

  return (
    <div>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
        <CmsImage
          image={page.portrait}
          alt={page.title}
          className="aspect-[4/5] rounded-[2rem]"
          priority
        />
        <div className="self-end">
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-none text-neutral-950 sm:text-7xl">
            {page.title}
          </h1>
          <RichText
            className="mt-8 max-w-2xl text-lg leading-8 text-neutral-700"
            html={page.bio}
          />
        </div>
      </section>

      <section className="border-y border-[var(--line)] bg-[var(--paper)]/70">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
          <SectionHeading
            eyebrow="Timeline"
            title={page.timelineTitle}
            body={page.timelineSummary}
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {page.milestones.map((milestone) => (
              <article
                className="rounded-2xl border border-[var(--line)] bg-white/55 p-5"
                key={`${milestone.year}-${milestone.title}`}
              >
                <p className="text-sm font-medium text-[var(--clay)]">
                  {milestone.year}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-neutral-950">
                  {milestone.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  {milestone.summary}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
