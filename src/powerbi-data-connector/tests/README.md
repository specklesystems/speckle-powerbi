# Connector tests (PQTest)

Run against the built `.mez` with the Power Query SDK's `PQTest.exe`
(the VS Code task `tests` does exactly this):

```
PQTest.exe run-test --extension bin\Speckle.mez --queryFile tests --prettyPrint
```

Each `*.query.pq` file evaluates to `"PASSED n facts"` or raises an error
listing the failed facts.

## Offline suites (run in CI, no credentials)

- `Exports.Contract.query.pq` — the public interface: every 3.x export exists
  with its 3.x parameter names, arity and return type (ENG-9165 regression:
  removed exports fail existing reports with "name wasn't recognized"), plus
  the 4.0 `Speckle.GetTables` entry point.
- `Legacy.Shapes.query.pq` — the restored legacy data-shaping helpers against
  legacy-shaped inputs (the flat shapes returned by `Speckle.GetByUrl`).
  These helpers are not expected to accept `Speckle.GetTables` output.
- `GetEavModel.query.pq` — the star-schema shaping seam with an injected
  `ReadBundleTable`: every keyed table carries the canonical `Object Key`
  column (Int64, keyOffset-namespaced, row order preserved, no `object_key`
  alias), raw artifact fields (`object_index`, `application_id`) stay raw,
  `path_key`/`type_key` are unrenamed, and property paths spelled like either
  literal key name are suffixed with `" (property)"`.
- `AddRelations.query.pq` covers the relation resolver against synthetic envelope
  tables: node-name and object-key targets, single and multi cardinality,
  duplicate-edge and resolved-value deduplication, deterministic ordering,
  federated keys, disappeared selections, structured errors and empty-call
  laziness.
- `AddProperties.query.pq` — the unified property enrichment helper against a
  navigation-shaped Source table, with filtered Objects overrides, chained
  enrichment, extra navigation rows, empty typed fact tables and an
  override-only instance-fact semi-join laziness check, including source-split
  columns (instance values unprefixed, type values `Type_`-prefixed, instance
  overrides surfacing both side by side), per-table missing-column and
  old-navigation-shape structured errors, naming over the emitted names, the
  `useFullPaths` bool (`false` default shortest suffixes, `true` entire paths,
  numeric-suffix disambiguation for full-depth collisions, loud errors for
  non-logical values), raw values,
  malformed facts, source-shape validation, Object Types invariants, and
  federated-key behavior.
- `AddAllProperties.query.pq` — the convenience wrapper that appends every path
  in Source's Property Paths row through `Speckle.AddProperties`, with Objects
  overrides, the same source-split columns and forwarded `useFullPaths`,
  including null-only and moderately wide property sets while preserving empty
  Objects tables and validation behavior.
- `BuildNavigation.query.pq` — the navigator composition seam behind
  `Speckle.GetTables`, against tiny synthetic property and graph tables: the
  ten-row layout (visible `Objects`, `Properties` and `Relations`, hidden
  supporting rows), the `TableLayout` option (`Simplified` default,
  case-insensitive `All tables` showing every row without forcing the fact
  tables, structured errors for unknown values), navigation metadata and
  keys, and the model-bound
  `Properties` function's contract — two optional parameters (the
  nullable-list selection and the nullable-logical `UseFullPaths` naming
  toggle rendered as a true/false picker), zero required arity,
  `Properties` documentation, deduplicated
  catalogue-ordered `AllowedValues`, table return type, the lean
  relationship-ready result (`Object Key` plus the selected property columns,
  every Objects row retained in order with its key type), empty-selection
  laziness (fact rows are never read), selection trimming/ordering,
  disappeared-path null columns, numeric-suffix collision handling against
  the lean base and structured invalid-path errors. It also pins the Relations
  allow-list and present-edge gating, namespace resolution, lean result shape
  and empty-selection laziness.

## Live suite (manual, needs a server + credential)

- `../tests-live/RepresentationMatrix.query.pq` — the ENG-9165 representation
  matrix (JSON/artifact × GetByUrl/GetTables), plus the Navigator visibility
  contract: `NavigationTable.HiddenColumn` names `Hidden`; by default Objects,
  Properties and Relations are visible. The suite invokes the model-bound
  Properties function against live data, and the `[TableLayout = "All tables"]` advanced option shows
  every row. It lives outside `tests\`
  because PQTest recurses through this folder and the live suite cannot run
  without credentials. Fill in the placeholder URLs, set a credential with
  `PQTest.exe set-credential`, then run with
  `--queryFile tests-live\RepresentationMatrix.query.pq`.

Before a release, also complete a manual compatibility pass opening
representative existing `.pbix` reports against the new `.mez` (ENG-9165
acceptance criteria).
