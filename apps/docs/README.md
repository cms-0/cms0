# @cms0/docs

Nextra-based documentation site for cms0.

## Commands

- `pnpm --filter @cms0/docs dev` - local docs dev server on port `3008`
- `pnpm --filter @cms0/docs build` - production static export
- `pnpm --filter @cms0/docs preview` - serve the static export from `out/`
- `pnpm --filter @cms0/docs typecheck` - TypeScript check
- `pnpm generate:docs-env` - generate a docs env profile under `scripts/generated-env`

## Environment

The docs app fails early when required env values are missing.

- Copy `apps/docs/.env.example` to `apps/docs/.env.local` for local work.
- Set `ENVIRONMENT=production` in production to enable Umami analytics.
- Set `CMS0_DOCS_PUBLIC_URL` when the docs site is served from a stable public
  origin.
- Set `CMS0_DOCS_BASE_PATH=/docs` when the docs app is mounted under
  `https://cms0.io/docs`.
- For production SEO on cms0.io, use
  `CMS0_DOCS_PUBLIC_URL=https://cms0.io/docs` and
  `CMS0_DOCS_BASE_PATH=/docs` so canonical URLs, static links, sitemap entries,
  and Open Graph URLs all point at the same public location.
- Set `CMS0_PUBLIC_APP_URL`, `CMS0_BASE_DOMAIN`,
  `CMS0_PUBLIC_ENV_PATH_RUNTIME_ENABLED`, and
  `CMS0_PUBLIC_ENV_SUBDOMAIN_RUNTIME_ENABLED` so hosted endpoint examples match
  the deployed routing mode.

## Documentation standards

- Keep pages task-oriented and production-ready.
- Prefer copy/paste-safe command snippets.
- Update related pages whenever behavior changes.
