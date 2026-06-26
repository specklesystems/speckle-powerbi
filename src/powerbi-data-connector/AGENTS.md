# Power BI Data Connector

Power Query M connector for fetching Speckle data.

## Build Commands

```bash
# From src/powerbi-data-connector/
msbuild Speckle.proj              # Build .mez file and auto-copy to Power BI Custom Connectors
msbuild Speckle.proj /t:Clean     # Clean build artifacts

# From repository root, requires InnoSetup in tools/
tools/InnoSetup/ISCC.exe tools/powerbi.iss  # Build installer
```

## Architecture

Modular Power Query M with dynamic function loading via `Speckle.LoadFunction`:

- **Speckle.pq** - Entry point with OAuth2/PKCE auth and function registration
- **speckle/GetModelByUrl.pqm** - Primary user function orchestrating data retrieval
- **speckle/GetByUrl.pqm** - Legacy compatibility wrapper for existing reports
- **speckle/GetByUrlWithoutProperties.pqm** - `Properties column = None (fastest)` orchestration, kept close to the pre-properties-column fast path
- **speckle/api/** - Core modules:
  - `Api.Fetch.pqm` - GraphQL client with error handling
  - `Parser.pqm` - URL parsing and federated model detection
  - `FetchEavParquet.pqm` - Fetches structured EAV data from `/api/v1/projects/{projectId}/models/{modelId}/versions/{versionId}/eav/query` as parquet
  - `BuildPropertyPathLookup.pqm` - Builds federation-wide shortest-unique property names
  - `GetStructuredDataWithoutProperties.pqm` - Fast path for `Properties column = None (fastest)`
  - `GetStructuredData.pqm` - Groups EAV rows by object ID, prioritizes `DataObjects`, optionally pivots eligible properties, and optionally adds material quantities during the existing object-grouping pass
  - `SendToServer.pqm` - Legacy Desktop Service helper; structured data no longer depends on it
  - `CheckPermissions.pqm` - Authorization validation
  - `Models.Federate.pqm` - Multi-model federation
  - `Objects.Properties.pqm` - Object processing

## Data Flow

1. `Parser.pqm` parses the URL into a single model or federation.
2. `CheckPermissions.pqm` validates access.
3. `GetModel.pqm` resolves the model/version metadata and root object ID.
4. `GetModelByUrl.pqm` calls `FetchEavParquet.pqm`. Keep the `None (fastest)` path streaming; do not buffer the raw EAV table there.
5. Short-name loads buffer EAV tables only when needed to build one property-path lookup across the model or complete federation.
6. `GetStructuredDataWithoutProperties.pqm` handles `None (fastest)` without property-path processing; `GetStructuredData.pqm` handles `Full paths` and `Short names`, returning a `properties` record by default or pivoted top-level property columns when `ExpandProperties = true`.
   When `IncludeMaterialQuantities = true`, both paths add a `Material Quantities` list column by extracting matching `properties.Material Quantities.*` rows inside each existing object group.
7. Federated model tables are combined after transformation.
8. `GetModelByUrl.pqm` attempts a non-blocking Desktop Service user-info handoff for backward compatibility.

## Gotchas

- **Restart required**: Restart Power BI Desktop after `.mez` changes to reload the connector.
- **Desktop Service is optional for structured data**: The connector fetches object data directly from Speckle's EAV parquet endpoint. Desktop Service on port `29364` is used only for best-effort legacy user-info handoff.
- **Protect the `None (fastest)` path**: Avoid `Table.Buffer` on the raw EAV parquet table and avoid extra table-wide filter/group/join passes. A previous material quantities implementation buffered the full table and regressed a ~40s load to 110s+. Add optional derived columns during the existing `Table.Group(..., GroupKind.Local)` per-object callback whenever possible.
