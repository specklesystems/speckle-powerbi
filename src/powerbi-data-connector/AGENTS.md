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
- **speckle/GetByUrl.pqm** - Primary user function orchestrating data retrieval
- **speckle/api/** - Core modules:
  - `Api.Fetch.pqm` - GraphQL client with error handling
  - `Parser.pqm` - URL parsing and federated model detection
  - `FetchEavParquet.pqm` - Fetches structured EAV data from `/api/v1/projects/{projectId}/models/{modelId}/versions/{versionId}/eav/query` as parquet
  - `DecodeEavObjects.pqm` - Reconstructs object records from EAV parquet rows
  - `GetStructuredData.pqm` - Data pipeline that fetches EAV parquet, decodes object data, filters `DataChunk`/`RawEncoding`, and prioritizes `DataObjects`
  - `SendToServer.pqm` - Legacy Desktop Service helper; structured data no longer depends on it
  - `CheckPermissions.pqm` - Authorization validation
  - `Models.Federate.pqm` - Multi-model federation
  - `Objects.Properties.pqm`, `Objects.Collections.pqm` - Object processing

## Data Flow

1. `Parser.pqm` parses the URL into a single model or federation.
2. `CheckPermissions.pqm` validates access.
3. `GetModel.pqm` resolves the model/version metadata and root object ID.
4. `GetStructuredData.pqm` calls `FetchEavParquet.pqm` to download parquet from `/eav/query`.
5. `DecodeEavObjects.pqm` rebuilds nested object records from EAV paths and values.
6. `GetStructuredData.pqm` filters transport/internal rows and returns the structured table.
7. `Models.Federate.pqm` combines tables for federated models.
8. `GetByUrl.pqm` attempts a non-blocking Desktop Service user-info handoff for backward compatibility.

## Gotchas

- **Restart required**: Restart Power BI Desktop after `.mez` changes to reload the connector.
- **Desktop Service is optional for structured data**: The connector fetches object data directly from Speckle's EAV parquet endpoint. Desktop Service on port `29364` is used only for best-effort legacy user-info handoff.
