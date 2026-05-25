import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateStaticParamsFor, importPage } from "nextra/pages";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

type PageProps = {
  params: Promise<{ mdxPath?: string[] }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const page = await importPage(params.mdxPath ?? []);
  return page?.metadata ?? {};
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

  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
