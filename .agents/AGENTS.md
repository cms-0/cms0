# Agent Rules For cms0

Read `../AGENTS.md` first when available, then this file, then `AI_CONTRIBUTING.md` and `../ai_policy.md`.

Assistant-only contribution rules belong in `.agents/AI_CONTRIBUTING.md`. Do not put agent workflow rules in the public README or CONTRIBUTING docs.

## UI Components

- Treat shadcn as the default component system for `apps/admin`, `apps/docs`, and `packages/ui`.
- Before creating custom controls, check `packages/ui` first and reuse the shared primitives.
- Keep app-specific composed components in the owning app's `components` directory.

## Better Auth

- Use Better Auth APIs as the source of truth for auth, session, and API key behavior.
- Prefer shared helpers in `packages/auth`, but keep final `betterAuth(...)` composition in the owning app.
- When changing Better Auth behavior, keep server/client responsibilities explicit and align with the repo-local auth skills in `.agents/skills/*auth*`.

## Runtime Boundaries

- `apps/admin` owns the self-host admin app composition and runtime host.
- `apps/docs` owns the public documentation app.
- `packages/admin-server`, `packages/admin-client`, `packages/auth`, `packages/shared`, and `packages/ui` own reusable core behavior.
- Keep deployment-specific product behavior out of publishable core packages.
- Package exports should stay generic, explicit, and backed by built artifacts that pass `pnpm verify:publish`.

## Shared Package Sync

Core is the source of generic package roots. When core changes shared packages, the source files must be copied manually to `cms0-saas` to keep them aligned.

- Shared packages: `packages/shared`, `packages/admin-server`, `packages/admin-client`, `packages/admin-contract`, `packages/auth`, `packages/api-docs`, `packages/db-schema-ops`, `packages/transactional`, `packages/typescript-config`, `packages/ui`
- SaaS has hosted-only files that must NOT be copied back to core: `packages/admin-client/src/hosted.ts`, `packages/admin-server/src/hosted/**`, `packages/auth/src/hosted.ts`, `packages/auth/src/hosted-permissions.ts`
- After making changes in core, copy the modified shared package source files to SaaS, preserving SaaS-only files.
- Test both repos after sync: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Implementation Style

- Keep changes minimal and focused.
- Reuse existing code only when it still fits the current core architecture.
- Improve reused code during migration instead of carrying stale constraints forward.
- Prefer SSR, Server Components, and small client islands.

## Contribution Workflow

- Refer to `CONTRIBUTING.md` for the complete contribution guidelines.
- **Never initiate the development workflow** (creating branches, making changes, staging, committing, pushing, or opening PRs) unless the user **explicitly** asks you to.
- Do not auto-stage, auto-commit, or auto-push any changes. Always wait for explicit user confirmation.
- When the user requests changes, apply them directly without creating branches or PRs unless specifically instructed otherwise.
