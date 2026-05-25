# Contributing To cms0

Thanks for taking the time to improve cms0.

This repository is the self-hostable core product: the `@cms0/cms0` SDK and CLI, the `@cms0/admin` app, the docs app, shared runtime packages, and release tooling.

## Before You Start

- Check existing issues and pull requests before starting a larger change.
- Open an issue first for behavior changes, public API changes, data model changes, or release tooling changes.
- Keep pull requests focused. A small PR that fully solves one problem is easier to review than a broad cleanup.
- Do not commit secrets, `.env.local` files, generated local storage, or one-off debug artifacts.

## Branches

- `main` is the production and release branch.
- `staging` is the integration branch and the default target for contribution pull requests.
- Contributors should create their own feature or fix branches from the latest `staging`.

Do not work directly on `main` or `staging` unless you are a maintainer doing repository coordination. A typical contribution flow is:

```bash
git checkout staging
git pull origin staging
git checkout -b fix/short-description
```

Open the pull request from your branch into `staging` unless a maintainer asks for a different target branch.

## Local Setup

Requirements:

- Node.js 22 or newer.
- pnpm 10.
- PostgreSQL.

Install dependencies:

```bash
pnpm install
```

Create local environment files:

```bash
cp apps/admin/.env.example apps/admin/.env.local
pnpm generate:docs-env
```

Update `apps/admin/.env.local` with a local database URL, auth secret, storage settings, and optional email settings.

Run the apps:

```bash
pnpm dev:admin
pnpm dev:docs
```

## Project Layout

- `apps/admin`: self-hosted admin app, auth assembly, runtime API host, and app-specific routes.
- `apps/docs`: documentation site.
- `packages/cms0`: SDK and CLI.
- `packages/admin-server`: reusable admin runtime behavior.
- `packages/admin-client`: typed client helpers and React Query hooks.
- `packages/admin-contract`: shared API contracts.
- `packages/shared`: common descriptor, graph query, storage, email, and utility contracts.
- `packages/auth`: reusable auth helpers and permissions.
- `packages/ui`: shared UI primitives and admin components.
- `packages/transactional`: transactional email helpers.
- `packages/api-docs`: OpenAPI generation.
- `packages/db-schema-ops`: schema push and database helpers.

## Coding Guidelines

- Prefer TypeScript types and shared contracts over ad hoc runtime shapes.
- Keep reusable behavior in packages and app-specific composition in the app that owns it.
- Keep `@cms0/cms0` developer experience stable: typed accessors, generated descriptors, and CLI commands are public surfaces.
- Use existing shadcn-based primitives in `packages/ui` before creating new controls.
- Keep docs and examples copy/paste safe.
- Add or update tests when a change affects runtime behavior, public APIs, CLI behavior, auth, schema generation, or editor workflows.

## Documentation Guidelines

Update docs when behavior changes.

- Use `apps/docs/content/getting-started` for first-run learning paths.
- Use `apps/docs/content/self-hosting` for admin runtime setup and operations.
- Use `apps/docs/content/app-integration` for app-side SDK usage.
- Use `apps/docs/content/reference` for API and conceptual reference.
- Keep the root README concise and project-oriented.

## Validation

For focused changes, run the narrowest command set that proves the change.

Common checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Package-only checks:

```bash
pnpm typecheck:packages
pnpm test:packages
pnpm build:packages
pnpm verify:publish
```

App checks:

```bash
pnpm --filter @cms0/admin typecheck
pnpm --filter @cms0/admin build
pnpm --filter @cms0/docs typecheck
pnpm --filter @cms0/docs build
```

End-to-end checks:

```bash
pnpm test:e2e
```

Mention exactly what you ran in your pull request.

## Changesets

Add a changeset when a pull request changes a publishable package in a way users should receive through npm.

```bash
pnpm changeset
```

The publishable package set currently includes:

- `@cms0/cms0`
- `@cms0/shared`
- `@cms0/auth`
- `@cms0/transactional`
- `@cms0/admin-client`
- `@cms0/admin-contract`
- `@cms0/admin-server`
- `@cms0/api-docs`
- `@cms0/db-schema-ops`
- `@cms0/ui`

Apps under `apps/*` are private deployables for now and do not need npm changesets unless a package change is also involved.

## Licensing

Package license metadata should follow [LICENSE](./LICENSE).

- SDK, client, shared contract, UI, email, docs, and API helper packages default to the Apache License 2.0.
- `apps/admin`, `@cms0/admin-server`, and `@cms0/db-schema-ops` use the GNU Affero General Public License v3.0 or later.
- New packages should state their intended license explicitly before they become public release surfaces.

## Pull Request Checklist

Before asking for review:

- The PR has one clear purpose.
- Tests or checks for the affected surface pass.
- Docs are updated when behavior changed.
- No secrets or local env files are included.
- No unrelated generated files are included.
- Package changes have a changeset when needed.

## Security

Do not open a public issue for a vulnerability. Use the repository security contact or maintainer-approved private channel.

## AI-Assisted Contributions

AI-assisted changes are welcome, but they should meet the same standard as human-written changes: clear intent, small scope, tests when needed, and no unreviewed generated churn.

If you use an AI coding assistant, read [ai_policy.md](./ai_policy.md) and [.agents/AI_CONTRIBUTING.md](./.agents/AI_CONTRIBUTING.md). The policy explains what the project accepts from human-led AI-assisted contributions; the `.agents` guide contains assistant-specific workflow rules that do not belong in the public human contribution guide.
