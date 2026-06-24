# Deep dive: deterministic schema migrations for RootSchema shape changes

Status: analysis only, no implementation yet. Branch: `fix/sdk-graph-api-runtime`.

## Recap of the root cause

Hosted schema publishing always regenerates Drizzle table definitions fresh
from the *current* descriptor (`generateContentTables`,
`packages/admin-server/src/schema-generator/generator.ts:19-36` — there is no
"previous descriptor" parameter anywhere in this file) and applies them with
`drizzle-kit push --force`, auto-answering its interactive prompts blindly:

- rename-table / rename-column prompts → always `"\r"` (accept whatever
  drizzle-kit highlighted as default), never an explicit choice
  (`packages/db-schema-ops/src/push-output.ts:47-73`).
- truncate-table prompts → always `"n\r"` (refuse).

`runDbPushSafe` (`packages/db-schema-ops/src/migration.ts:156`, attempts
default 3 via `CMS0_DB_PUSH_ATTEMPTS`) retries the whole push on failure with
**no transaction wrapping and no rollback**. A retry runs against whatever
state the previous, possibly half-applied, attempt left in Postgres. This is
exactly the `42P07 relation already exists` → `42704 constraint does not
exist` → missing-table sequence seen in the logs.

Underlying that: `FullDescriptor` (`packages/shared/src/validation.ts:14-95`)
has **no stable identity** anywhere — `models` and `roots` are plain
`Record<string, ...>` keyed by name, and `modelRef.model` is literally the
TS export name string (`descriptor-builder-alt.ts:357-368`). A rename and a
drop+create are structurally identical inputs to everything downstream.

## Finding to flag explicitly: name generation is *not* stable under incremental edits

You asked me to double check this — it is **not** as solid as assumed.

`toPgIdentifier` / `toHashedPgTableName`
(`packages/admin-server/src/schema-generator/utils.ts:14,45-56`) correctly
enforce the 63-byte Postgres limit and hash overflow with a SHA1-derived
8-char suffix. That part is deterministic. But the hash is only *invoked* on
a naming **collision**, and collision resolution
(`resolveUniquePgTableName`/`resolveUniquePgColumnName`,
`utils.ts:58-128`) seeds the hash with `${exportName}:${attempt}`, where
`attempt` is an incrementing counter driven by `nameCounts` — state that
accumulates in path/insertion order across the *entire* descriptor
(`table-builder.ts:20-41`).

Practical consequence: adding, removing, or reordering an unrelated sibling
field elsewhere in `RootSchema` can shift which entity is the "second" one to
claim a given truncated name, which changes who gets the hash suffix —
**even though that entity's own shape and path never changed.** Combined
with `drizzle-kit push`'s blind prompt-acceptance, this is a second,
independent source of spurious renames beyond the one in the original
report. Today's naming is reproducible only for a byte-identical full
descriptor processed in the same order — not stable incrementally. Solution
B below fixes this as a side effect, because physical names would stop being
derived from path + attempt-counter at all.

## Solution A: deterministic migration planner (diff, don't infer)

Replace "regenerate everything, let drizzle-kit guess" with "diff previous
vs. next descriptor, emit an explicit plan, execute the plan in one
transaction."

**The previous side already exists, it's just unused for this purpose.**
`SchemaDescriptorSnapshot` (`packages/admin-contract/src/index.ts:31-36`:
`{version, checksum, descriptor, publishedAt}`) is persisted and loaded via
`schemaStore.saveSnapshot` / `loadLatestSnapshot`
(`packages/admin-server/src/binding-factory/factory.ts:175,179,272,287,308`).
Today `publishSchema` only uses it as a whole-descriptor checksum
short-circuit (`factory.ts:290`: if checksum matches, skip; otherwise push
the new descriptor wholesale). Nothing currently reads the *previous*
descriptor's shape to compute a structural diff. That's the gap to close —
it's a wiring change, not a new storage mechanism.

Planner shape (descriptive, not code):

- Load `previous = loadLatestSnapshot().descriptor`, take `next` from the
  request.
- Walk both descriptors keyed by stable id (see Solution B — without ids
  this diff degrades to name/path matching, which is exactly today's
  ambiguity, so A and B are not independent options, they're sequential
  phases of one fix).
- Classify every model/field into: unchanged, added, removed, renamed
  (same id, new name/path), retyped (same id, changed `kind`/shape — e.g.
  inline-object → modelRef), or moved (same id, new parent path).
- Emit an explicit, ordered list of DDL operations: `CREATE TABLE`,
  `ADD COLUMN`, `RENAME COLUMN`/`RENAME TABLE` (only for the "renamed"
  class — never inferred from prompt-acceptance), `DROP COLUMN`/`DROP TABLE`
  (only for "removed", and only after a confirmation step — see migration
  plan below), plus the FK/constraint changes a retype implies.
- Execute the whole plan inside one Postgres transaction. DDL in Postgres is
  transactional, so this single change also fixes the "no rollback between
  retries" problem — a failed plan rolls back to the exact pre-publish
  state, full stop, instead of leaving partial DDL applied.
- `drizzle-kit push` stops being the decision-maker and becomes, at most, an
  executor for the "added" class (genuinely new tables/columns have no
  ambiguity to resolve). Renames/drops/retypes never go through its
  interactive prompt path again.
- The retry loop in `migration.ts:156` becomes unnecessary in its current
  form: a transactional plan either fully applies or fully doesn't. What
  should remain is a single non-retried attempt that, on failure, marks the
  environment `migration_failed` (per the original solution list) rather
  than blindly re-running — retrying a deterministic plan against an
  unchanged DB state will just fail the same way again; retrying only made
  sense when the previous mechanism was non-transactional and could "make
  progress" across attempts.

## Solution B: stable descriptor/table/field IDs

This is the load-bearing piece — without it, "diffing" two descriptors can
only compare names/paths, which is precisely what produces today's
ambiguity. A rename and a drop+create must be told apart by something other
than the new name.

**Where an ID would have to come from:** the descriptor is inferred fresh
from the TS AST on every CLI run (`descriptorFromType`,
`descriptor-builder-alt.ts:250`) — there is nowhere in the source itself
that persists identity across edits, and nothing requires there to be. Two
realistic options:

1. **Side-store ID map** (recommended starting point): a checked-in
   `.cms0/descriptor-ids.json` (or similar), conceptually `{ [exportName or
   structural-path]: stableId }`, maintained by the CLI alongside the
   descriptor build. On each build, the CLI matches current
   names/paths against the map to assign ids to unchanged/added entities,
   and any name/path that disappears becomes a candidate "removed or
   renamed" the CLI cannot disambiguate on its own.
2. **Explicit annotation in source** (e.g. a `// @cms0-id stats-block` style
   comment or a sibling marker), which removes the ambiguity entirely at
   the cost of requiring the user to annotate intentional renames. Heavier
   on the user, but removes the "CLI guessed wrong" failure mode completely.

Either way, when the CLI cannot match an old id to the new descriptor
unambiguously (i.e., a name vanished and a structurally-similar new name
appeared), the right move is to **ask**, not infer — a CLI prompt ("did you
rename `hairstyleTypes` to `hairstyleCategories`, or remove one and add the
other?") is strictly better than `drizzle-kit`'s current blind
default-accept, and only needs to fire on genuine ambiguity, not on every
push.

**Effect on physical naming:** once an id exists, table/column physical
names can be derived from the id (e.g. a short stable hash of the id) rather
than from `path + attempt-counter`. That removes the sibling-edit
instability described above as a side effect, and makes "rename in
`RootSchema`" a true `ALTER TABLE ... RENAME` against an unchanged physical
identity instead of a new table with a new derived name.

## Production-data migration plan (this is the part that has to be staged carefully)

There are already-running environments with real data and physical tables
named by the current path+hash scheme. Nothing above can be a flag-day
cutover.

**Phase 1 — stop the bleeding, no schema change.** Wire the existing
`SchemaDescriptorSnapshot` into `publishSchema` as a real "previous" input
(today it's checksum-only) and add the `migration_failed` gate plus stop
blind retries past a fatal DDL error. This requires no new storage, no
backfill, and is safe to ship to every existing environment immediately —
it only changes what happens *after* a push starts failing.

**Phase 2 — backfill ids without touching physical schema.** Mint a stable
id for every model/field/table that already exists in production by reading
the *current* live descriptor + current Postgres catalog and recording
`physical name → new stable id` in the id map. This is purely additive
metadata — zero DDL, zero data movement, fully reversible. Every environment
gets a baseline id map before the planner is allowed to run against it.

**Phase 3 — turn on the diff planner, gated per environment.** Ship the
planner behind an explicit per-environment opt-in (something like
`useDeterministicMigrationPlanner`), default off. New environments default
on; existing production environments are migrated to it deliberately, one
at a time, once Phase 2's id map is confirmed correct for that environment.
`drizzle-kit push --force` remains available as a manual escape hatch (the
original list's "destructive reset for dev/empty environments" applies
as-is, unchanged, since those have no data at risk).

**Phase 4 — id-derived physical naming, opt-in and explicit.** Moving a
table/column's *physical* name from `path+hash` to `id-derived` is itself a
one-time rename for every entity currently sitting on the legacy hashed
name. This must be its own explicit, reviewable migration step (a generated
list of `ALTER TABLE/COLUMN RENAME` statements, zero data movement) — not
something that happens implicitly the first time the new planner runs
against an old environment. Until an environment runs this step, the
planner can still work correctly using the Phase 2 id map to locate the
existing (legacy-named) physical objects; it just won't get the
naming-stability benefit until the rename step has run.

This sequencing means an existing customer's environment is never silently
moved onto new behavior — Phase 1 ships everywhere and only changes failure
handling; Phases 2–4 are progressively opt-in and each is independently
reversible before the next is taken.
