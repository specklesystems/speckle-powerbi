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
- `AddProperties.query.pq` — the unified property enrichment helper against
  in-memory star-schema navigation tables, including source-split columns
  (instance values unprefixed, type values `Type_`-prefixed, instance
  overrides surfacing both side by side), validation, naming over the emitted
  names, raw values, malformed facts, Object Types invariants, and
  federated-key behavior.
- `AddAllProperties.query.pq` — the convenience wrapper that appends every path
  through `Speckle.AddProperties` with the same source-split columns, including
  null-only and moderately wide property sets, while preserving empty Objects
  tables and validation behavior.
- `BuildNavigation.query.pq` — the navigator composition seam behind
  `Speckle.GetTables`, against tiny synthetic five-table data: the six-row
  layout (visible `Objects`, `Property Paths` and `ExpandProperties`, hidden
  helper rows), navigation metadata and keys, and the model-bound
  `ExpandProperties` function's contract — optional nullable-list parameter,
  zero required arity, `ExpandProperties` documentation, deduplicated
  catalogue-ordered `AllowedValues`, table return type, the lean
  relationship-ready result (`object_key` plus the selected property columns,
  every Objects row retained in order with its key type), empty-selection
  laziness (fact tables are never forced), selection trimming/ordering,
  disappeared-path null columns, collision detection against the lean base
  and structured invalid-path errors.

## Live suite (manual, needs a server + credential)

- `../tests-live/RepresentationMatrix.query.pq` — the ENG-9165 representation
  matrix (JSON/artifact × GetByUrl/GetTables), plus the Navigator visibility
  contract: `NavigationTable.HiddenColumn` names `Hidden`, and only the
  `Objects`, `Property Paths` and `ExpandProperties` rows are visible — the
  last one a real model-bound function that the suite also invokes against
  live data. It lives outside `tests\`
  because PQTest recurses through this folder and the live suite cannot run
  without credentials. Fill in the placeholder URLs, set a credential with
  `PQTest.exe set-credential`, then run with
  `--queryFile tests-live\RepresentationMatrix.query.pq`.

Before a release, also complete a manual compatibility pass opening
representative existing `.pbix` reports against the new `.mez` (ENG-9165
acceptance criteria).
