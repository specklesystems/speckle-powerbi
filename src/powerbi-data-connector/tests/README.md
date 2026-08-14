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
  the 4.0 `Speckle.GetTables` / `Speckle.ExpandProperties` entry points.
- `Legacy.Shapes.query.pq` — the restored legacy data-shaping helpers against
  legacy-shaped inputs (the flat shapes returned by `Speckle.GetByUrl`).
  These helpers are not expected to accept `Speckle.GetTables` output.
- `AddProperties.query.pq` — the unified property enrichment helper against
  in-memory star-schema navigation tables, including instance-over-type
  precedence (including explicit nulls), validation, naming, raw values,
  malformed facts, Object Types invariants, and federated-key behavior.

## Live suite (manual, needs a server + credential)

- `../tests-live/RepresentationMatrix.query.pq` — the ENG-9165 representation
  matrix (JSON/artifact × GetByUrl/GetTables). It lives outside `tests\`
  because PQTest recurses through this folder and the live suite cannot run
  without credentials. Fill in the placeholder URLs, set a credential with
  `PQTest.exe set-credential`, then run with
  `--queryFile tests-live\RepresentationMatrix.query.pq`.

Before a release, also complete a manual compatibility pass opening
representative existing `.pbix` reports against the new `.mez` (ENG-9165
acceptance criteria).
