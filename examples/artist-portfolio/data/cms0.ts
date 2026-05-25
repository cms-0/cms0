import { cms0 } from "@cms0/cms0";
import type { Image, RichText, Seo } from "@cms0/cms0/custom-types";

export type NavItem = {
  label: string;
  href: string;
};

export type Artwork = {
  title: string;
  slug: string;
  year: string;
  medium: string;
  dimensions: string;
  summary: string;
  image?: Image;
  palette: string[];
  featured: boolean;
  available: boolean;
  seo?: Seo;
};

export type BlogPost = {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  coverImage?: Image;
  body: RichText;
  seo?: Seo;
};

export type ContactSubmission = {
  name: string;
  email: string;
  message: string;
  submittedAt: string;
  status: "new" | "read" | "archived";
};

type RootSchema = {
  header: {
    studioName: string;
    tagline: string;
    ctaLabel: string;
    navItems: NavItem[];
  };
  footer: {
    heading: string;
    summary: string;
    copyright: string;
    links: NavItem[];
    socialLinks: NavItem[];
  };
  homePage: {
    hero: {
      eyebrow: string;
      title: string;
      summary: string;
      featuredNote: string;
      image?: Image;
    };
    highlights: {
      value: string;
      label: string;
    }[];
    featuredWorkTitle: string;
    featuredWorkSummary: string;
    statement: {
      eyebrow: string;
      title: string;
      body: RichText;
    };
    seo?: Seo;
  };
  galleryPage: {
    eyebrow: string;
    title: string;
    summary: string;
    seo?: Seo;
  };
  aboutPage: {
    eyebrow: string;
    title: string;
    bio: RichText;
    portrait?: Image;
    timelineTitle: string;
    timelineSummary: string;
    milestones: {
      year: string;
      title: string;
      summary: string;
    }[];
    seo?: Seo;
  };
  contactPage: {
    eyebrow: string;
    title: string;
    body: RichText;
    studioLabel: string;
    studioAddress: string;
    email: string;
    successMessage: string;
    seo?: Seo;
  };
  blogPage: {
    eyebrow: string;
    title: string;
    summary: string;
    seo?: Seo;
  };
  artworks: Artwork[];
  blogPosts: BlogPost[];
  contactSubmissions: ContactSubmission[];
};

const apiBaseUrl =
  process.env.CMS0_API_BASE_URL ?? "http://localhost:3000/api/content";

const assetBaseUrl =
  process.env.CMS0_ASSET_BASE_URL ?? process.env.CMS0_ENV_ASSET_BASE_URL;

export const data = cms0<RootSchema>({
  apiConfig: {
    baseUrl: apiBaseUrl,
    key: process.env.CMS0_API_KEY,
  },
  assets: assetBaseUrl ? { baseUrl: assetBaseUrl } : undefined,
  defaultLocale: "en",
  locales: ["en"],
});

export type HeaderContent = RootSchema["header"];
export type FooterContent = RootSchema["footer"];
export type HomePageContent = RootSchema["homePage"];
export type GalleryPageContent = RootSchema["galleryPage"];
export type AboutPageContent = RootSchema["aboutPage"];
export type ContactPageContent = RootSchema["contactPage"];
export type BlogPageContent = RootSchema["blogPage"];

export const isCmsConfigured = Boolean(
  process.env.CMS0_API_BASE_URL && process.env.CMS0_API_KEY,
);

export async function readCms<T, TRead extends T>(
  reader: () => Promise<TRead>,
  fallback: T,
): Promise<T> {
  if (!isCmsConfigured) return fallback;

  try {
    return await reader();
  } catch {
    return fallback;
  }
}
