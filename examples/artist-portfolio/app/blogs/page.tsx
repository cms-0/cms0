import Link from "next/link";
import type { Metadata } from "next";

import { Eyebrow, SectionHeading } from "@/components/content-blocks";
import { data, readCms } from "@/data/cms0";
import { blogPageFallback, blogPostsFallback } from "@/data/fallbacks";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const page = await readCms(
    () => data.blogPage({ includeId: false, graph: { pageSize: "full" } }),
    blogPageFallback,
  );

  return pageMetadata(page.seo, {
    title: "Blogs",
    description: "Studio notes, exhibition essays, and process writing.",
  });
}

export default async function BlogsPage() {
  const [page, posts] = await Promise.all([
    readCms(
      () => data.blogPage({ includeId: false, graph: { pageSize: "full" } }),
      blogPageFallback,
    ),
    readCms(
      () =>
        data.models.BlogPost({
          includeId: false,
          query: {
            pageSize: 100,
            orderBy: "publishedAt",
            orderDir: "desc",
          },
          graph: {
            pageSize: "full",
            paths: {
              "seo.openGraph.images": { pageSize: "full" },
            },
          },
        }),
      blogPostsFallback,
    ),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <SectionHeading
        eyebrow={page.eyebrow}
        title={page.title}
        body={page.summary}
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            className="group rounded-[1.5rem] border border-[var(--line)] bg-white/55 p-5 transition hover:-translate-y-1 hover:bg-white"
            href={`/blog/${post.slug}`}
            key={post.slug}
          >
            <Eyebrow>{formatDate(post.publishedAt)}</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold leading-tight text-neutral-950 group-hover:text-[var(--clay)]">
              {post.title}
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              {post.excerpt}
            </p>
            <p className="mt-6 text-sm font-medium text-neutral-950">
              Read essay
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
