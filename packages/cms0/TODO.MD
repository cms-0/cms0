# @cms0/cms0 TODO

## CMS0-SDK-001
Title: Infer return type shape from `fields`/`exclude` in accessors

Status: Deferred (not implementing now)

Goal:
- Make the inferred return type of:
  - `data.RootName({...})`
  - `data.models.ModelName({...})`
  reflect `fields` and `exclude` selections.

Scope:
- Add type-level narrowing for `fields` and `exclude` when provided as literal (`as const`) paths.
- Preserve current broad return type when selectors are dynamic (`string`/`string[]` not literal).
- Keep include-id behavior aligned with overloads (`includeId: true | false | default`).

Acceptance Criteria:
- `fields` narrows result shape to selected nested paths.
- `exclude` narrows/removes selected nested paths from inferred result type.
- Works for nested objects and arrays.
- No runtime behavior changes required.
- Existing SDK tests remain green; add dedicated type-inference tests for selector-based narrowing.

Notes:
- Start with `fields` narrowing first if complexity becomes high, then add `exclude`.
- Ensure compile performance remains acceptable for large schemas.
