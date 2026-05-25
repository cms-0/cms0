import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import {
  createDocsMetadata,
  docsBreadcrumbJsonLd,
  docsBreadcrumbs,
  docsPathFromMdxPath,
  docsWebPageJsonLd,
  JsonLd,
  metadataTitleToString,
} from "../../lib/seo";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

type PageProps = {
  params: Promise<{ mdxPath?: string[] }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = await importPage(params.mdxPath ?? []);
  return createDocsMetadata(params.mdxPath, page?.metadata ?? {});
}

const Wrapper = (await import("../../mdx-components")).useMDXComponents()
  .wrapper;

export default async function Page(props: PageProps) {
  const params = await props.params;
  const result = await importPage(params.mdxPath ?? []);

  if (!result) {
    notFound();
  }

  const { default: MDXContent, toc, metadata, sourceCode } = result;
  const path = docsPathFromMdxPath(params.mdxPath);
  const title = metadataTitleToString(metadata.title);
  const description =
    metadata.description ?? "Official cms0 documentation for TypeScript teams.";

  return (
    <>
      <JsonLd data={docsWebPageJsonLd({ title, description, path })} />
      <JsonLd data={docsBreadcrumbJsonLd(docsBreadcrumbs(path, title))} />
      <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
        <MDXContent {...props} params={params} />
      </Wrapper>
    </>
  );
}
