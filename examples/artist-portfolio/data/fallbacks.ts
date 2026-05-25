import type {
  AboutPageContent,
  Artwork,
  BlogPageContent,
  BlogPost,
  ContactPageContent,
  FooterContent,
  GalleryPageContent,
  HeaderContent,
  HomePageContent,
} from "@/data/cms0";

function rich(html: string) {
  return {
    html,
    value: {},
  };
}

export const headerFallback: HeaderContent = {
  studioName: "Mara Vale Studio",
  tagline: "Paintings and works on paper",
  ctaLabel: "Inquire",
  navItems: [
    { label: "Gallery", href: "/gallery" },
    { label: "About", href: "/about" },
    { label: "Blogs", href: "/blogs" },
    { label: "Contact", href: "/contact" },
  ],
};

export const footerFallback: FooterContent = {
  heading: "Quiet color, weathered surfaces, and work made slowly.",
  summary:
    "This example is ready for cms0 content. Until you publish data, these placeholders keep the portfolio composed for demos and development.",
  copyright: "2026 Mara Vale Studio. Built with cms0.",
  links: headerFallback.navItems,
  socialLinks: [
    { label: "Instagram", href: "https://example.com" },
    { label: "Newsletter", href: "https://example.com" },
  ],
};

export const artworksFallback: Artwork[] = [
  {
    title: "Low Sun Over Linen",
    slug: "low-sun-over-linen",
    year: "2026",
    medium: "Oil, pigment, and graphite on linen",
    dimensions: "48 x 60 in",
    summary:
      "A warm field painting with loose horizon marks and rubbed graphite edges.",
    palette: ["#c65f3c", "#d9b15d", "#2f5b72", "#f6f1e8"],
    featured: true,
    available: true,
  },
  {
    title: "Harbor Study No. 12",
    slug: "harbor-study-12",
    year: "2025",
    medium: "Acrylic and wax on panel",
    dimensions: "30 x 40 in",
    summary:
      "Layered blues and green-gray washes from a week of waterfront sketches.",
    palette: ["#2f5b72", "#4f6f52", "#aab7a5", "#211d1a"],
    featured: true,
    available: false,
  },
  {
    title: "Three Rooms for Rain",
    slug: "three-rooms-for-rain",
    year: "2025",
    medium: "Mixed media on cotton paper",
    dimensions: "22 x 30 in",
    summary:
      "A paper work built from repeated window shapes, stains, and stitched lines.",
    palette: ["#6f5d52", "#c9973d", "#f2dfc5", "#4f6f52"],
    featured: true,
    available: true,
  },
  {
    title: "Night Garden Index",
    slug: "night-garden-index",
    year: "2024",
    medium: "Gouache and ink on paper",
    dimensions: "18 x 24 in",
    summary:
      "A compact study of dark botanical forms and bright registration marks.",
    palette: ["#211d1a", "#2f5b72", "#c65f3c", "#f6f1e8"],
    featured: false,
    available: false,
  },
  {
    title: "Salt Line",
    slug: "salt-line",
    year: "2024",
    medium: "Oil and marble dust on panel",
    dimensions: "36 x 48 in",
    summary:
      "A restrained coastal abstraction with chalky texture and a single red seam.",
    palette: ["#f6f1e8", "#9c9f94", "#c65f3c", "#2f5b72"],
    featured: false,
    available: true,
  },
  {
    title: "Archive of Small Fires",
    slug: "archive-of-small-fires",
    year: "2023",
    medium: "Pastel and acrylic on paper",
    dimensions: "16 x 20 in",
    summary:
      "A grid of small studies exploring heat, ash, and repaired color.",
    palette: ["#c65f3c", "#211d1a", "#c9973d", "#f2dfc5"],
    featured: false,
    available: false,
  },
];

export const homePageFallback: HomePageContent = {
  hero: {
    eyebrow: "Artist portfolio example",
    title: "Paintings that hold weather, memory, and surface.",
    summary:
      "Mara Vale is a fictional artist profile built to show cms0 roots, collections, SEO, images, SSR reads, and a write-enabled contact form.",
    featuredNote: "Replace this hero with an uploaded cms0 image in minutes.",
  },
  highlights: [
    { value: "42", label: "Works cataloged across canvas, panel, and paper." },
    { value: "8", label: "Solo and group exhibitions represented in the timeline." },
    { value: "100%", label: "Content modeled with TypeScript and edited in cms0." },
  ],
  featuredWorkTitle: "Recent surfaces",
  featuredWorkSummary:
    "Featured pieces are read from the `artworks` collection and filtered in the Next.js server component.",
  statement: {
    eyebrow: "Studio statement",
    title: "A content model can still feel handmade.",
    body: rich(
      "<p>The portfolio is designed to stay beautiful before content exists. Once editors save real content in cms0, every section swaps from placeholder copy to live CMS data.</p><p>Use the schema as a starting point for real artists, galleries, illustrators, photographers, or studios.</p>",
    ),
  },
  seo: {
    title: "Mara Vale Studio",
    description: "A cms0 powered artist portfolio example.",
  },
};

export const galleryPageFallback: GalleryPageContent = {
  eyebrow: "Gallery",
  title: "Selected works",
  summary:
    "The gallery reads from a cms0 collection with page size and ordering options.",
  seo: {
    title: "Gallery",
    description: "Selected works from a cms0 powered artist portfolio.",
  },
};

export const aboutPageFallback: AboutPageContent = {
  eyebrow: "About the artist",
  title: "Mara Vale builds paintings like weather records.",
  bio: rich(
    "<p>Mara Vale is a fictional painter created for the cms0 public demo. Her studio practice blends slow observation, layered color, and textured surfaces.</p><p>The page demonstrates rich text, image fields, repeatable milestones, and SEO fields controlled from cms0.</p>",
  ),
  timelineTitle: "Selected timeline",
  timelineSummary:
    "Milestones are a repeatable object array on the about page root.",
  milestones: [
    {
      year: "2026",
      title: "Residency at North Coast Works",
      summary: "Developed the first group of salt and weather paintings.",
    },
    {
      year: "2025",
      title: "Harbor Index",
      summary: "Presented paper studies and panel paintings in a small solo show.",
    },
    {
      year: "2024",
      title: "Studio archive opened",
      summary: "Started cataloging available and archived pieces with cms0.",
    },
  ],
  seo: {
    title: "About Mara Vale",
    description: "Artist bio and studio timeline.",
  },
};

export const contactPageFallback: ContactPageContent = {
  eyebrow: "Contact",
  title: "Commissions, studio visits, and press requests.",
  body: rich(
    "<p>This form uses a Next.js server action. With cms0 credentials configured, it creates a `contactSubmissions` collection item.</p>",
  ),
  studioLabel: "Mara Vale Studio",
  studioAddress: "12 Paper Mill Lane, Halifax, NS",
  email: "studio@example.com",
  successMessage: "Thank you. The inquiry was saved in cms0.",
  seo: {
    title: "Contact",
    description: "Contact the studio for commissions and press requests.",
  },
};

export const blogPageFallback: BlogPageContent = {
  eyebrow: "Blogs",
  title: "Studio notes and field essays",
  summary:
    "Blog entries are read from the `blogPosts` collection and rendered through `/blog/[slug]`.",
  seo: {
    title: "Blogs",
    description: "Studio notes from the cms0 artist portfolio example.",
  },
};

export const blogPostsFallback: BlogPost[] = [
  {
    title: "How a painting starts before the first mark",
    slug: "how-a-painting-starts",
    excerpt:
      "A short note on gathering references, choosing scale, and waiting for the surface to say enough.",
    publishedAt: "2026-05-01",
    body: rich(
      "<p>Most paintings in the studio begin as a pile of fragments: a torn color chip, a shoreline sketch, a sentence from a notebook, a residue of weather.</p><p>The first useful mark is usually not the first visible mark. It is the decision to leave something unresolved long enough for the painting to answer back.</p>",
    ),
    seo: {
      title: "How a painting starts",
      description: "A cms0 demo essay about process and surface.",
    },
  },
  {
    title: "Cataloging the archive with a typed CMS",
    slug: "cataloging-the-archive",
    excerpt:
      "Why typed content models are useful when a studio needs titles, images, availability, and writing in one place.",
    publishedAt: "2026-04-18",
    body: rich(
      "<p>A studio archive is both practical and emotional. It needs accurate dimensions, images, availability, and notes, but it also carries the record of decisions that made the work possible.</p><p>cms0 keeps that content model in TypeScript, then turns it into an editor UI.</p>",
    ),
    seo: {
      title: "Cataloging the archive with cms0",
      description: "A cms0 demo essay about typed content models.",
    },
  },
  {
    title: "Notes from a quiet installation week",
    slug: "quiet-installation-week",
    excerpt:
      "A practical essay about wall color, spacing, captions, and the slower parts of exhibition prep.",
    publishedAt: "2026-03-30",
    body: rich(
      "<p>Installation weeks look precise from the outside, but they are full of small negotiations. A painting that felt loud in the studio can become quiet on a white wall.</p><p>The best arrangement usually arrives after one unnecessary piece is removed.</p>",
    ),
    seo: {
      title: "Notes from a quiet installation week",
      description: "A cms0 demo essay about exhibition prep.",
    },
  },
];
