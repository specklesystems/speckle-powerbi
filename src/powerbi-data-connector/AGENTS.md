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
  - `SendToServer.pqm` - Desktop Service communication on port `29364`
  - `GetStructuredData.pqm` - Data pipeline that filters `DataChunk`/`RawEncoding` and prioritizes `DataObjects`
  - `CheckPermissions.pqm` - Authorization validation
  - `Models.Federate.pqm` - Multi-model federation
  - `Objects.Properties.pqm`, `Objects.Collections.pqm` - Object processing

## Data Flow

1. `Parser.pqm` parses the URL into a single model or federation.
2. `CheckPermissions.pqm` validates access.
3. `SendToServer.pqm` retrieves data via Speckle Desktop Service.
4. `GetStructuredData.pqm` processes and structures output.
5. `Models.Federate.pqm` combines tables for federated models.

## Gotchas

- **Restart required**: Restart Power BI Desktop after `.mez` changes to reload the connector.
- **Critical runtime dependency**: Speckle Desktop Service must be running on port `29364` for the data connector to function.
