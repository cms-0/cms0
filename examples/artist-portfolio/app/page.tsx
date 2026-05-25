import Link from "next/link";
import type { Metadata } from "next";

import {
  ArtworkCard,
  Eyebrow,
  RichText,
  SectionHeading,
} from "@/components/content-blocks";
import { CmsImage } from "@/components/cms-image";
import { data, readCms } from "@/data/cms0";
import { artworksFallback, homePageFallback } from "@/data/fallbacks";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

function readHomePage() {
  return readCms(
    () =>
      data.homePage({
        includeId: false,
        fields: [
          "hero",
          "highlights",
          "featuredWorkTitle",
          "featuredWorkSummary",
          "statement",
          "seo",
        ],
        graph: {
          pageSize: "full",
          paths: {
            "seo.openGraph.images": { pageSize: "full" },
          },
        },
      }),
    homePageFallback,
  );
}

function readArtworks() {
  return readCms(
    () =>
      data.models.Artwork({
        includeId: false,
        query: {
          pageSize: 100,
          orderBy: "year",
          orderDir: "desc",
        },
      }),
    artworksFallback,
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await readHomePage();
  return pageMetadata(page.seo, {
    title: "Mara Vale Studio",
    description: "Paintings, paper studies, and studio writing.",
  });
}

export default async function HomePage() {
  const [page, artworks] = await Promise.all([readHomePage(), readArtworks()]);
  const featured = artworks.filter((artwork) => artwork.featured).slice(0, 3);

  return (
    <div>
      <section className="mx-auto grid min-h-[78vh] max-w-7xl items-end gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <div className="pb-8">
          <Eyebrow>{page.hero.eyebrow}</Eyebrow>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-normal text-neutral-950 sm:text-7xl lg:text-8xl">
            {page.hero.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-700 sm:text-xl">
            {page.hero.summary}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              href="/gallery"
            >
              View gallery
            </Link>
            <Link
              className="rounded-full border border-neutral-950/15 bg-white/45 px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-white"
              href="/about"
            >
              About the studio
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-4 top-8 hidden h-28 w-28 rounded-full bg-(--gold)/30 blur-2xl sm:block" />
          <CmsImage
            image={page.hero.image}
            alt={page.hero.title}
            className="aspect-4/5 rounded-4xl"
            priority
          />
          <div className="absolute -bottom-6 left-6 right-6 rounded-2xl border border-white/50 bg-white/70 p-4 shadow-sm backdrop-blur">
            <p className="text-sm font-medium text-neutral-950">
              {page.hero.featuredNote}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-(--line) bg-(--paper)/70">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-10">
          {page.highlights.map((highlight) => (
            <article
              key={highlight.label}
              className="border-l border-(--line) pl-5"
            >
              <p className="text-3xl font-semibold text-neutral-950">
                {highlight.value}
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {highlight.label}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <SectionHeading
          eyebrow="Featured work"
          title={page.featuredWorkTitle}
          body={page.featuredWorkSummary}
          action={{ href: "/gallery", label: "All artworks" }}
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {featured.map((artwork) => (
            <ArtworkCard artwork={artwork} key={artwork.slug} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8 lg:px-10">
        <div className="grid gap-8 rounded-4xl border border-(--line) bg-neutral-950 p-6 text-white sm:p-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow tone="dark">{page.statement.eyebrow}</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">
              {page.statement.title}
            </h2>
          </div>
          <RichText
            className="max-w-3xl text-lg leading-8 text-white/78"
            html={page.statement.body}
          />
        </div>
      </section>
    </div>
  );
}
