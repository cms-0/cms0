# cms0 Artist Portfolio Example

A Next.js App Router example for a working artist portfolio powered by `@cms0/cms0`.

It includes:

- SSR pages for home, gallery, about, contact, blogs, and blog detail pages.
- A typed cms0 schema in `data/cms0.ts`.
- Optional SEO per page through the built-in `Seo` custom type.
- Header and footer content managed from cms0.
- Gallery and blog collections.
- A contact form server action that writes to a cms0 collection when an API key is configured.
- Polished placeholder content so the site still looks complete before editors fill the CMS.

## Run locally

```bash
pnpm install
cp examples/artist-portfolio/.env.example examples/artist-portfolio/.env.local
pnpm --filter @cms0/example-artist-portfolio dev
```

Open `http://localhost:3010`.

## Connect cms0

1. Start a self-hosted `@cms0/admin` instance or use a hosted runtime.
2. Create an API key with schema publish and content read/write access.
3. Fill `CMS0_API_BASE_URL` and `CMS0_API_KEY` in `.env.local`.
4. Run:

```bash
pnpm --filter @cms0/example-artist-portfolio cms0:build
```

Then open the admin UI and fill:

- `header`
- `footer`
- `homePage`
- `galleryPage`
- `aboutPage`
- `contactPage`
- `blogPage`
- `artworks`
- `blogPosts`

The site falls back to local placeholder content until those records are saved.
