import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CmsImage } from "@/components/cms-image";
import { Eyebrow, RichText } from "@/components/content-blocks";
import { data, readCms, type BlogPost } from "@/data/cms0";
import { blogPostsFallback } from "@/data/fallbacks";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;
export const dynamicParams = true;

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

function readAllBlogPosts() {
  return readCms(
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
  );
}

function readBlogPostBySlug(slug: string) {
  return readCms(
    async () => {
      const post = await data.models.BlogPost.whereFirst(
        { slug },
        {
          includeId: false,
          graph: {
            pageSize: "full",
            paths: {
              "seo.openGraph.images": { pageSize: "full" },
            },
          },
        },
      );
      if (!post) throw new Error("not found");
      return post;
    },
    null as BlogPost | null,
  );
}

export async function generateStaticParams() {
  const posts = await readAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await readBlogPostBySlug(slug);

  if (!post) {
    return pageMetadata(undefined, {
      title: "Essay not found",
      description: "This studio essay is not available.",
    });
  }

  return pageMetadata(post.seo, {
    title: post.title,
    description: post.excerpt,
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = await readBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <article className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
      <Link
        className="text-sm font-medium text-neutral-600 transition hover:text-neutral-950"
        href="/blogs"
      >
        Back to blogs
      </Link>
      <Eyebrow className="mt-10">{formatDate(post.publishedAt)}</Eyebrow>
      <h1 className="mt-4 text-5xl font-semibold leading-none text-neutral-950 sm:text-7xl">
        {post.title}
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-700">
        {post.excerpt}
      </p>
      <CmsImage
        image={post.coverImage}
        alt={post.title}
        className="mt-10 aspect-[16/10] rounded-[2rem]"
        priority
      />
      <RichText
        className="rich-text mt-10 text-lg leading-8 text-neutral-800"
        html={post.body}
      />
    </article>
  );
}
