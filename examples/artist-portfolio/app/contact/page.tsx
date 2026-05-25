import type { Metadata } from "next";

import { Eyebrow, RichText } from "@/components/content-blocks";
import { submitContactForm } from "@/app/contact/actions";
import { data, readCms } from "@/data/cms0";
import { contactPageFallback } from "@/data/fallbacks";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 60;

type ContactPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await readCms(
    () => data.contactPage({ includeId: false, graph: { pageSize: "full" } }),
    contactPageFallback,
  );

  return pageMetadata(page.seo, {
    title: "Contact",
    description: "Commission inquiries, press requests, and studio visits.",
  });
}

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const [page, params] = await Promise.all([
    readCms(
      () => data.contactPage({ includeId: false, graph: { pageSize: "full" } }),
      contactPageFallback,
    ),
    searchParams,
  ]);
  const sent = typeof params.sent === "string" ? params.sent : undefined;

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
      <section>
        <Eyebrow>{page.eyebrow}</Eyebrow>
        <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-none text-neutral-950 sm:text-7xl">
          {page.title}
        </h1>
        <RichText
          className="mt-8 max-w-xl text-lg leading-8 text-neutral-700"
          html={page.body}
        />
        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white/55 p-5 text-sm leading-6 text-neutral-700">
          <p className="font-medium text-neutral-950">{page.studioLabel}</p>
          <p>{page.studioAddress}</p>
          <p className="mt-4">{page.email}</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--paper)] p-5 shadow-sm sm:p-8">
        {sent === "1" ? (
          <Status title="Message saved" body={page.successMessage} />
        ) : sent === "demo" ? (
          <Status
            title="Demo mode"
            body="The form is wired to create a cms0 collection item. Add API credentials to save submissions."
          />
        ) : sent === "missing" ? (
          <Status
            title="A few details are missing"
            body="Please add your name, email, and message before sending."
          />
        ) : null}

        <form action={submitContactForm} className="mt-2 grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-neutral-700">
            Name
            <input
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950"
              name="name"
              placeholder="Your name"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-neutral-700">
            Email
            <input
              className="rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-neutral-700">
            Message
            <textarea
              className="min-h-40 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950"
              name="message"
              placeholder="Tell the studio what you are looking for."
              required
            />
          </label>
          <button
            className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            type="submit"
          >
            Send inquiry
          </button>
        </form>
      </section>
    </div>
  );
}

function Status({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-5 rounded-2xl border border-[var(--line)] bg-white/70 p-4">
      <p className="font-medium text-neutral-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-neutral-600">{body}</p>
    </div>
  );
}
