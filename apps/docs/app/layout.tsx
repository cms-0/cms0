import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Banner, Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Logo } from "../components/logo";
import {
  getDocsBasePath,
  getDocsPublicUrl,
  getDocsRepositoryBase,
  getProjectRepositoryLink,
  isProductionEnvironment,
} from "../lib/env";
import { createDocsMetadata, DOCS_DESCRIPTION } from "../lib/seo";
import "nextra-theme-docs/style.css";

const docsRepositoryBase = getDocsRepositoryBase();

const projectLink = getProjectRepositoryLink();
const docsBasePath = getDocsBasePath();

const logo = (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <Logo size={24} uniColor={false} />
    <strong>cms0</strong>
  </span>
);

const navbar = (
  <Navbar logo={logo} projectLink={projectLink || undefined} align="left">
    <a href={`${docsBasePath}/getting-started`}>Start here</a>
  </Navbar>
);

const footer = (
  <Footer>
    Apache-2.0 / AGPL-3.0-or-later {new Date().getFullYear()} (c) cms0
    contributors.
  </Footer>
);

const banner = (
  <Banner storageKey="cms0-docs-start-here">
    New to cms0? Start with the hosted, self-hosted, or app integration path.
  </Banner>
);

export const metadata: Metadata = {
  ...createDocsMetadata(undefined, {
    title: {
      default: "cms0 Documentation",
      template: "%s | cms0 Documentation",
    },
    description: DOCS_DESCRIPTION,
  }),
  metadataBase: new URL(getDocsPublicUrl()),
  title: {
    default: "cms0 Documentation",
    template: "%s | cms0 Documentation",
  },
  description: DOCS_DESCRIPTION,
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const pageMap = await getPageMap();
  const loadAnalytics = isProductionEnvironment();

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        {loadAnalytics && (
          <script
            defer
            src="https://umami.cms0.io/script.js"
            data-website-id="593f0885-ba39-4f65-a0b7-55fc2fa75569"
          ></script>
        )}
      </Head>
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={pageMap}
          docsRepositoryBase={docsRepositoryBase || undefined}
          editLink={docsRepositoryBase ? "Edit this page" : null}
          feedback={
            docsRepositoryBase
              ? { content: "Question? Give feedback", labels: "docs" }
              : { content: null }
          }
          footer={footer}
          sidebar={{
            autoCollapse: true,
            defaultMenuCollapseLevel: 2,
            toggleButton: true,
          }}
          toc={{
            backToTop: "Back to top",
            title: "On this page",
          }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
