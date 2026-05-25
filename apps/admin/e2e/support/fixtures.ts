import type { SchemaDescriptor } from "@cms0/admin-contract";

const exampleSiteDescriptor = {
  models: {
    article: {
      kind: "model",
      properties: {
        excerpt: { type: "string" },
        featured: { type: "boolean" },
        publishedAt: { type: "string" },
        slug: { type: "string" },
        tag: { type: "string" },
        title: { type: "string" },
      },
    },
  },
  roots: {
    site: {
      type: "object",
      properties: {
        announcement: {
          type: "object",
          properties: {
            label: { type: "string" },
            message: { type: "string" },
          },
        },
        hero: {
          type: "object",
          properties: {
            eyebrow: { type: "string" },
            primaryCtaHref: { type: "string" },
            primaryCtaLabel: { type: "string" },
            secondaryCtaHref: { type: "string" },
            secondaryCtaLabel: { type: "string" },
            subtitle: { type: "string" },
            title: { type: "string" },
          },
        },
        stats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
          },
        },
      },
    },
  },
} satisfies SchemaDescriptor;

export type CoreE2EUser = {
  email: string;
  name: string;
  password: string;
};

export type ExampleArticleFixture = {
  excerpt: string;
  featured: boolean;
  publishedAt: string;
  slug: string;
  tag: string;
  title: string;
};

export type ExampleSiteFixture = {
  announcementLabel: string;
  announcementMessage: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaHref: string;
  primaryCtaLabel: string;
  secondaryCtaHref: string;
  secondaryCtaLabel: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
};

export const coreE2EConfig = {
  baseUrl: process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:4102",
  runtimeBasePath: "/api/content",
} as const;

export const exampleDescriptor = exampleSiteDescriptor;

export const coreUsers = {
  invitee: {
    email: "operator-invitee@cms0.test",
    name: "Invited Operator",
    password: "Password123!",
  },
  owner: {
    email: "owner@cms0.test",
    name: "Owner Operator",
    password: "Password123!",
  },
  wrongAccount: {
    email: "wrong-account@cms0.test",
    name: "Wrong Account",
    password: "Password123!",
  },
} satisfies Record<string, CoreE2EUser>;

export const articleFixtures = {
  created: {
    excerpt: "Initial article content created through the collection form.",
    featured: true,
    publishedAt: "2026-04-23",
    slug: "core-regression-created",
    tag: "Testing",
    title: "Core regression created article",
  },
  mutated: {
    excerpt: "Backup mutation that should disappear after restore.",
    featured: false,
    publishedAt: "2026-04-25",
    slug: "core-regression-mutated",
    tag: "Rollback",
    title: "Core regression mutated article",
  },
  descriptorCreated: {
    excerpt:
      "Descriptor-path article created directly from the dashboard route.",
    featured: true,
    publishedAt: "2026-04-23",
    slug: "core-descriptor-created",
    tag: "Dashboard",
    title: "Core descriptor created article",
  },
  descriptorUpdated: {
    excerpt:
      "Descriptor-path article updated directly from the dashboard route.",
    featured: false,
    publishedAt: "2026-04-24",
    slug: "core-descriptor-updated",
    tag: "Dashboard",
    title: "Core descriptor updated article",
  },
  updated: {
    excerpt:
      "Updated article content that should survive the dedicated backup.",
    featured: false,
    publishedAt: "2026-04-24",
    slug: "core-regression-updated",
    tag: "Operations",
    title: "Core regression updated article",
  },
} satisfies Record<string, ExampleArticleFixture>;

export const siteFixtures = {
  updated: {
    announcementLabel: "Now live",
    announcementMessage:
      "The self-hosted runtime descriptor path editor is working.",
    heroEyebrow: "Self-host",
    heroTitle: "Descriptor path coverage restored",
    heroSubtitle: "Singleton roots now have real browser mutation coverage.",
    primaryCtaHref: "https://docs.cms0.test/getting-started/",
    primaryCtaLabel: "Read the guide",
    secondaryCtaHref: "/documentation/api",
    secondaryCtaLabel: "Open the API",
    stats: [
      {
        label: "Routes covered",
        value: "2",
      },
      {
        label: "Mutations verified",
        value: "singleton + collection",
      },
    ],
  },
} satisfies Record<string, ExampleSiteFixture>;

export const coreDescriptorVersion = "core-regression-e2e";
