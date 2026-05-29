# AI Contribution Notes

These notes are for AI coding assistants and agentic tooling. Human-facing contribution guidance lives in `README.md` and `CONTRIBUTING.md`.

## Operating Rules

- Do not create branches, stage files, commit, push, publish, or open pull requests unless the user explicitly asks.
- Do not run `pnpm release`, `changeset publish`, `npm publish`, or any manual publish command without explicit approval.
- Check `git status -sb` before editing.
- Preserve unrelated local changes. If the worktree is dirty, assume those edits belong to the user unless proven otherwise.
- Never revert user changes to get a cleaner diff.
- Do not edit `.env.local` files unless the user explicitly asks.
- Do not expose secrets from local env files in responses or docs.
- Prefer focused validation for focused changes. Use broader validation when shared runtime, release, package, or build behavior changes.

## Core Product Boundaries

Use this repository for generic cms0 core work:

- self-hosted admin behavior
- SDK and CLI behavior
- shared admin server/runtime behavior
- shared package contracts
- schema, descriptor, graph, backup, data-transfer, storage, and trigger behavior
- reusable UI and developer tooling
- docs for the core/self-host product

Keep app-specific composition in the owning app and reusable behavior in packages.

## Package Boundaries

- `apps/admin` owns self-host app composition, route handlers, auth assembly, and runtime wiring.
- `apps/docs` owns public core documentation.
- `packages/cms0` owns the SDK and CLI package surface.
- `packages/admin-server` owns reusable request dispatch, runtime behavior, adapters, graph reads, backups, data transfer, and manual triggers.
- `packages/admin-client` owns typed client helpers and React Query hooks.
- `packages/admin-contract` owns request and response contracts.
- `packages/shared` owns descriptor, graph query, storage, email, and common utility contracts.
- `packages/auth` owns reusable auth helpers, permissions, session defaults, and auth factory building blocks.
- `packages/ui` owns shared primitives and reusable admin UI components.
- `packages/transactional` owns transactional email helpers.

## Documentation Placement

- Keep `README.md` project-oriented and friendly to new human readers.
- Keep `CONTRIBUTING.md` focused on normal open source contribution flow.
- Put assistant-only instructions in `.agents`.
- Put user-facing product docs in `apps/docs/content`.
- When runtime behavior changes, update docs in the same turn when feasible.

## Validation

For docs-only changes, run the docs typecheck/build when MDX or docs app code changed.

For package changes, prefer focused package checks first:

```bash
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> test
pnpm --filter <package-name> build
```

For release or package manifest changes, also run:

```bash
pnpm changeset status
pnpm typecheck:packages
pnpm test:packages
pnpm build:packages
pnpm verify:publish
```

If validation is blocked by the local machine, dependency state, or environment, report the exact command and failure.

## Changesets

Add a changeset for user-visible changes to publishable packages.

Do not add changesets for README-only, CONTRIBUTING-only, `.agents`-only, or private docs app changes unless a publishable package is also affected.

## Communication

- Be direct about what changed and what was verified.
- Mention known residual risk.
- Keep final answers concise.
