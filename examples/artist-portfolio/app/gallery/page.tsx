import type { Metadata } from "next";

import { ArtworkCard, SectionHeading } from "@/components/content-blocks";
import { data, readCms } from "@/data/cms0";
import { artworksFallback, galleryPageFallback } from "@/data/fallbacks";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const page = await readCms(
    () => data.galleryPage({ includeId: false, graph: { pageSize: "full" } }),
    galleryPageFallback,
  );

  return pageMetadata(page.seo, {
    title: "Gallery",
    description: "A selected archive of paintings, studies, and works on paper.",
  });
}

export default async function GalleryPage() {
  const [page, artworks] = await Promise.all([
    readCms(
      () => data.galleryPage({ includeId: false, graph: { pageSize: "full" } }),
      galleryPageFallback,
    ),
    readCms(
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
    ),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <SectionHeading
        eyebrow={page.eyebrow}
        title={page.title}
        body={page.summary}
      />

      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {artworks.map((artwork) => (
          <ArtworkCard artwork={artwork} key={artwork.slug} />
        ))}
      </div>
    </div>
  );
}
