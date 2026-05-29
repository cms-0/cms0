# @cms0/cms0

## 0.4.0

### Minor Changes

- 4715dfb: Add typed `.where()` and `.whereFirst()` query methods to the SDK client with full type inference. Supports structured filter operators (eq, ne, gt, gte, lt, lte, between, in, notIn, contains, startsWith, endsWith, isNull), dot-path nested field filtering, and AND/OR/NOT combinators. Works on both model accessors and root array accessors.

### Patch Changes

- Updated dependencies [4715dfb]
  - @cms0/shared@0.4.0

## 0.2.21

### Patch Changes

- 6fd3ac1: Resume core package publishing from the recovered self-hosted release train.
- Updated dependencies [6fd3ac1]
  - @cms0/shared@0.2.21

## Unreleased

### Patch Changes

- Move graph pagination, sorting, search, max-depth, and model-reference controls under the typed `graph` accessor option. Global graph controls now apply recursively to resolved graph arrays, and `graph.paths` provides typed dot-path overrides for nested arrays.
- Default resolved SDK graph reads to `pageSize: "full"` and allow the graph API to parse `pageSize=full` globally or per nested path.
- Keep `fields` and `exclude` as projection controls and document the matching runtime `/_graph` query parameters.

## 0.2.20

### Patch Changes

- f14df37: Refresh browser schema descriptors live in development via the cms0 sidecar SSE channel, and retry once after invalidation when a newly added schema key races ahead of the refreshed descriptor.
  - @cms0/shared@0.2.20

## 0.2.19

### Patch Changes

- 8a730f5: Make `.cms0` the only generated source of truth for schema descriptors, split browser resolution so `cms0 dev` reads from a local sidecar while `cms0 build` materializes a deterministic bundled browser projection, and remove bundled package fallbacks from normal runtime resolution.
  - @cms0/shared@0.2.19

## 0.2.18

### Patch Changes

- b9fe104: Avoid publish-time prepack races by using no-clean pack builds for shared runtime and canvas packages, and keep the admin npm tarball on a source-only prepack path instead of the deploy-time Bun compile.
- Updated dependencies [b9fe104]
  - @cms0/shared@0.2.18

## 0.2.17

### Patch Changes

- @cms0/shared@0.2.17

## 0.2.16

### Patch Changes

- @cms0/shared@0.2.16

## 0.2.15

### Patch Changes

- Updated dependencies [6043ee8]
  - @cms0/shared@0.2.15

## 0.2.14

### Patch Changes

- e76b090: Republish the public runtime stack with a single compatibility boundary so
  Canvas, shared helpers, admin, and SDK packages cannot drift into broken
  published combinations.
- Updated dependencies [e76b090]
  - @cms0/shared@0.2.14

## 0.2.13

### Patch Changes

- d131093: Harden npm package publication by rebuilding tarballs during `prepack` and verifying packed artifacts in the main-branch release workflow. This fixes missing build output in published Canvas packages and corrects the transactional package entrypoint paths used by consumers.

## 0.2.12

### Patch Changes

- 4a09f4e: Release the admin and sdk changes that shipped with the Canvas work, including:
  - manual trigger targeting and Canvas publish integration
  - trigger lookup and execution updates used by Canvas publish flows
  - cms0 runtime and provenance changes required for deployed-page overlay sync

## 0.2.11

### Patch Changes

- 45f143c: Normalize SEO robots to object-only shape, default metadata robots flags to `false`, and generate boolean DB columns with `default(false)`.

## 0.2.10

### Patch Changes

- 40e51bb: Fix SEO union normalization so `toNextMetadata` handles include-id wrappers and
  resolved union modelRef objects reliably (including asset URL extraction from
  image unions and alternate locale wrapper values).

## 0.2.9

### Patch Changes

- 46df18f: Ship recursive `fields`/`exclude` support across SDK and resolved API reads, including typed
  field selector paths and projection handling for nested objects/arrays.

  Also add manual external trigger support in admin settings (floating trigger actions,
  synchronous execution feedback, and trigger configuration/runtime plumbing), with matching
  permission updates.

## 0.2.8

### Patch Changes

- 42f7a64: Add union and enum descriptor support end-to-end, introduce SEO custom type helpers,
  and align admin/schema-driven ordering behavior with explicit descriptor ordering hints.

  This release also includes related admin form/runtime fixes and expanded tests.

- Updated dependencies [42f7a64]
  - @cms0/shared@0.1.1

## 0.2.7

### Patch Changes

- f3117d6: Move SDK client metadata to `data.meta` and make proxy property resolution explicit.
  - expose metadata via `data.meta` (`locales`, `defaultLocale`, `includeIdDefault`)
  - reserve top-level keys for schema roots and API namespaces only

## 0.2.6

### Patch Changes

- 2a46e67: Improve data loading and editing consistency across admin and SDK:
  - add resolved read endpoints and SDK fallback for normalized root graph reads
  - fix primitive collection edit flows for localized/custom types to preserve correct object shapes

## 0.2.5

### Patch Changes

- 794e79c: Improve TypeScript inference for global `includeId`.

  When initializing the SDK with `cms0({ includeId: true })`, default accessor return types now include ids without needing to pass `includeId: true` on every call.

## 0.2.4

### Patch Changes

- 31bc48e: Align `includeId` behavior for localized custom fields.
  - keep map containers like `locales` id-free
  - flatten object-valued primitive collection items to `{ id, ...value }`
  - keep scalar primitive collection items as `{ id, value }`

## 0.2.3

### Patch Changes

- d89a0c7: Improve cms0 SDK reliability for large content payloads by adding request throttling, retry/backoff for rate-limited responses, shared inflight deduplication, and better inline modelRef reuse.

  Fix admin form visual/descriptor rendering consistency for localized content and schema-derived labels.

## 0.2.2

### Patch Changes

- 4493db7: Fix modelRef normalization when multiple fields reference the same model in one object.

  The SDK now prioritizes property-specific foreign keys (for example `logoId`) over model-wide defaults (for example `imageId`), so sibling refs no longer resolve to the same entity.

## 0.2.1

### Patch Changes

- 6a279a4: Fix generated content route `raw` query parsing consistency in admin APIs, including support for `raw=1` on singleton and collection handlers.

  Fix SDK modelRef normalization so optional modelRef fields are omitted when relation FKs are missing instead of being normalized to `null`.

## 0.2.0

### Minor Changes

- e0b53e3: Ship the new localized value map shape (`{ defaultLocale, locales }`) end-to-end and align admin rendering/editing behavior with schema-driven form handling.

  Includes admin data/form typing hardening, schema-driven e2e coverage improvements, and related runtime fixes required for stable localized/modelRef/object flows.

## 0.1.1

### Patch Changes

- 617f4e2: Fix CLI config loading in CommonJS builds when resolving `file://` specifiers.
  - keep runtime `import()` semantics for config URL loading in CJS output
  - fix ESM `cms0.config.js` and transpiled TS config resolution under Node CJS execution
  - ensure temporary `.cms0-config.*.mjs` files are cleaned up even when config execution throws

## 0.1.0

### Minor Changes

- 42ecc60: Add responsive break support for rich text across admin and runtime packages.
  - add a TipTap responsive break extension with toolbar insertion and inline editing/removal controls
  - export shared responsive break CSS and re-export it from `@cms0/cms0` for client apps
  - add focused tests for responsive break interactions and behavior

### Patch Changes

- Updated dependencies [42ecc60]
  - @cms0/shared@0.1.0

## 0.0.13

### Patch Changes

- 1ae7873: Infer asset `url` values for `File`, `Image`, and `Video` outputs in the SDK.
  - Adds configurable asset URL options via `cms0({ assets: { baseUrl, uploadsPath } })`
  - Defaults to `<api origin>/uploads/<encoded filename>` when no override is provided
  - Preserves explicit backend `url` values when present
  - Updates inferred model typings for asset-like models and adds coverage tests

## 0.0.12

### Patch Changes

- 2452df0: Fix modelRef normalization to avoid using container row ids when relation FK is missing, preventing false 404s on empty/partial data.

  Disable TanStack Router devtools UI outside development so production/admin runtime behavior stays clean.

## 0.0.11

### Patch Changes

- 8cf0d0c: Fix locale filtering behavior for localized fields returned by the CMS SDK.
  - Apply locale filtering consistently to `LocalizedString` and `LocalizedRichText` values.
  - Respect `defaultLocale` fallback when no explicit locale is passed.
  - Preserve all locale entries when `locale=all` is requested.
  - Ensure locale propagation is applied through recursive normalization paths.

## 0.0.10

### Patch Changes

- 7c419cf: Improve CMS client model/root access behavior and default collection id handling.
  - Restrict model access to `data.models.*` (remove `data.Model` access).
  - Include `id` by default for object collection items in normalized responses.
  - Add typed accessor overloads for `includeId` modes (`default`, `false`, `true`).
  - Add/expand SDK tests for model namespace-only access and id behavior.

  Improve admin runtime/dev ergonomics.
  - Render `TanStackRouterDevtools` only in development mode.
  - Ensure fallback generated schema files exist before admin dev/build/start.

## 0.0.9

### Patch Changes

- c84ec99: Fix module-format compatibility for package consumers.
  - `@cms0/shared` now ships dual ESM/CJS outputs with explicit `import`/`require` exports and type paths.
  - `@cms0/cms0` now imports shared utilities in a bundler-safe way to avoid ESM named-export runtime issues.
  - Resolves browser/Vite/Next runtime errors like `exports is not defined` and missing named export resolution from `@cms0/shared`.

- Updated dependencies [c84ec99]
  - @cms0/shared@0.0.5

## 0.0.8

### Patch Changes

- 8917915: Fix CLI descriptor output paths so `cms0 build/dev` updates runtime descriptor files used by published SDK builds.

  This resolves `Unknown schema key ...` errors in consumer apps where generated descriptors were being written to the wrong location.

## 0.0.7

### Patch Changes

- e8c299f: Fix `@cms0/shared` publishing so compiled `dist` artifacts are always included.

  This prevents downstream runtime/module-resolution failures when consuming `@cms0/cms0` in frameworks like Next.js/Turbopack.

- Updated dependencies [e8c299f]
  - @cms0/shared@0.0.4

## 0.0.6

### Patch Changes

- 1df16d5: Ensure `@cms0/cms0` prepublish build always compiles `@cms0/shared` first so `changeset publish` does not fail when `@cms0/shared/dist` is missing in CI.

## 0.0.5

### Patch Changes

- 0f52b27: Fix `@cms0/cms0` publish/build and TypeScript consumption issues:
  - Generate a fallback schema descriptor file before TypeScript compilation when `src/generated/schema-descriptor.ts` is missing in clean CI.
  - Correct package `exports` type/import paths to point to `dist/types` and `dist/esm` so consumers can resolve `@cms0/cms0` and `@cms0/cms0/config` declarations properly.
  - Fix `@cms0/shared` package exports to resolve from `dist` instead of `src`, so SSR bundlers (including Next.js Turbopack) don’t try to compile source TypeScript from `node_modules`.

- Updated dependencies [0f52b27]
  - @cms0/shared@0.0.3

## 0.0.4

### Patch Changes

- 0f52b27: Fix `@cms0/cms0` publish/build and TypeScript consumption issues:
  - Generate a fallback schema descriptor file before TypeScript compilation when `src/generated/schema-descriptor.ts` is missing in clean CI.
  - Correct package `exports` type/import paths to point to `dist/types` and `dist/esm` so consumers can resolve `@cms0/cms0` and `@cms0/cms0/config` declarations properly.

## 0.0.3

### Patch Changes

- 0f52b27: Fix package publish/build in clean CI environments by generating a fallback schema descriptor file before TypeScript compilation when `src/generated/schema-descriptor.ts` is missing.

## 0.0.2

### Patch Changes

- bef5ec7: Ensure the admin server binary is executable in Docker images.
- 2ee81b6: Fix rich text editor transaction sync issues and stabilize localized field test behavior.
- Updated dependencies [bef5ec7]
- Updated dependencies [2ee81b6]
  - @cms0/shared@0.0.2
