# Power BI 3D Visual

TypeScript/Vue.js custom visual for 3D model rendering in Power BI.

## Commands

```bash
# From src/powerbi-visual/; requires Node ^20.17.0 and yarn 4.9.1
yarn install             # Install dependencies
npm run dev              # Dev server with hot reload
npm run build            # Production build
npm run build:dev        # Development build
npm run generate-certs   # HTTPS certs for local dev
```

## Architecture

Vue 3 + TypeScript + Webpack + Tailwind CSS.

### Core

- **visual.ts** - PowerBI entry point implementing `IVisual`. Orchestrates the `update()` lifecycle, detects internalization toggle changes, triggers data loading or removal, and persists settings to file.
- **store/visualStore.ts** - Pinia store managing visual state: viewer lifecycle flags, camera/projection settings, edge rendering, filter state, loading progress, object persistence, and file write methods. Uses a viewer emitter callback system. Tracks multiple ready states and skip flags (`postFileSaveSkipNeeded`, `postClickSkipNeeded`) to prevent cascading updates after file writes.
- **plugins/viewer.ts** - `ViewerHandler` class wrapping the Speckle viewer. Manages extensions (`HybridCameraController`, `FilteringExtension`, `FilteredSelectionExtension`, `ViewModes`). Handles filtering, selection, camera, and object loading events.

### Handlers And Extensions

- **handlers/selectionHandler.ts** - Maps Speckle object IDs to PowerBI `SelectionId`s for cross-visual highlighting and context menus.
- **handlers/tooltipHandler.ts** - Manages tooltip display for hovered objects via PowerBI's `ITooltipService`.
- **extensions/FilteredSelectionExtension.ts** - Custom viewer extension that respects `FilteringExtension` isolated object state and only allows selection of currently filtered objects.

### Data Loading

- **loader/SpeckleApiLoader.ts** - Downloads objects from the Speckle API via `ObjectLoader2Factory` with progress tracking. Recursively fetches missing references up to 10 iterations. Used during internalization.
- **laoder/SpeckleObjectsOfflineLoader.ts** - Loads already-downloaded objects from memory using `ObjectLoader2Factory.createFromObjects`. Note: folder has a typo, `laoder/`.

### Settings

- **settings/visualSettingsModel.ts** - Base formatting model composing settings cards.
- **settings/colorSettings.ts** - Color override controls with context dropdown (`hidden`, `ghosted`, `show`).
- **settings/dataLoadingSettings.ts** - "Data Management" card with `internalizeData` toggle for offline/online mode.
- **settings/cameraSettings.ts** - Camera config (`defaultView`, `projection`, `allowCameraUnder`, `zoomOnDataChange`). Currently inactive.
- **settings/lightingSettings.ts** - Lighting config (`intensity`, `elevation`, `azimuth`, `shadows`). Currently inactive.

### Components And Views

- **App.vue** - Root component. Conditionally renders `ViewerView` or `HomeView` based on `isViewerReadyToLoad`. Shows `LoadingBar` and errors.
- **views/HomeView.vue** - Onboarding screen explaining required fields with links to docs.
- **views/ViewerView.vue** - Wrapper rendering `ViewerWrapper`.
- **components/ViewerWrapper.vue** - Initializes `ViewerHandler` and mounts the 3D viewer to the DOM.
- **components/ViewerControls.vue** - Control panel with zoom extents, view modes menu, and camera menu.
- **components/viewer/** - Subcomponents for camera menu, view modes, and control button groups.
- **components/form/** - `FormButton`, `FormRange`, `FormSwitch`.
- **components/global/icon/** - Extensive icon library with 50+ icons.

### Utilities And Composables

- **utils/matrixViewUtils.ts** - Extracts data from PowerBI matrix view into `SpeckleDataInput`. Validates field inputs and handles color-by rules.
- **utils/compression.ts** - Compresses/decompresses model objects using `pako`. Chunks objects at roughly 1000 per chunk to Base64 for PowerBI property storage.
- **utils/decodeUserInfo.ts** - Decodes Base64 JSON from Version Object ID containing credentials (`token`, `server`, `projectId`). Supports federated models via `|||` delimiter.
- **utils/mixpanel.ts** - Analytics tracking.
- **composables/useUpdateConnector.ts** - Fetches available connector versions from `releases.speckle.dev` and notifies the store of the latest version.

## Key Patterns

### Data Flow

```text
Matrix View -> validateMatrixView() -> processMatrixView()
-> SpeckleDataInput -> visualStore.setDataInput()
-> viewerEmit() -> ViewerHandler -> Viewer + Extensions
```

### Internalization Pipeline

1. User toggles "Internalize Data" in settings.
2. `visual.ts` detects toggle change via `previousToggleState` comparison.
3. If ON: `SpeckleApiLoader` downloads objects, compresses them, then calls `writeObjectsToFile()`.
4. If OFF: `removeInternalizedData()` clears stored data from file.

### Federated Models

The data connector can encode multiple root objects with the `|||` delimiter. `decodeUserInfoSafe()` splits and decodes each entry; the store handles loading multiple objects.

### Settings Persistence

Uses `host.persistProperties()` to save to the PowerBI file at keys: `storedData`, `camera`, `viewMode`, `workspace`, `cameraPosition`, `dataLoading`. Includes compressed object data, `receiveInfo` JSON, camera position, and view mode.

### Weak Token

The data connector provides a scoped "weak token" stored in `receiveInfo`, used by `SpeckleApiLoader` for internalization. This enables offline access when the desktop service is unavailable.

## Key Types

- **`SpeckleDataInput`** (`types.ts`) - Model objects, object IDs, selected IDs, color-by groups, tooltips, and `isFromStore` flag
- **`DecodedUserInfo`** - Token, server URL, and `projectId` decoded from Version Object ID
- **`SpeckleSelectionData`** / **`SpeckleTooltip`** (`interfaces.ts`) - Selection and tooltip data with world/screen positions

## Dependencies

- `@speckle/viewer` (`2.26.5`) - 3D rendering
- `@speckle/objectloader2` (`2.26.7`) - Object loading
- `powerbi-visuals-api` (`^5.11.0`) - PowerBI framework
- Vue 3, Pinia, VueUse, Tailwind CSS, `pako` for compression

## Gotchas

- **Hot reload limitation**: Hot reload works only in Power BI Web, not Desktop.
- **Certificate setup required**:
  1. Install `mkcert`.
  2. Run `npm run generate-certs`.
  3. On Windows, install `rootCA.pem` in "Trusted Root Certification Authorities".
- **Update skip flags**: The store uses multiple skip flags to prevent cascading `update()` calls after file writes and click events. Be careful when modifying the update lifecycle.
- **Folder typo**: The `laoder/` directory contains `SpeckleObjectsOfflineLoader.ts`.
