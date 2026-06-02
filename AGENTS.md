# AGENTS.md

Speckle Power BI integration with two independent components.

## Components

- **[Data Connector](src/powerbi-data-connector/AGENTS.md)** - Power Query M connector for fetching Speckle data
- **[3D Visual](src/powerbi-visual/AGENTS.md)** - TypeScript/Vue.js custom visual for 3D model rendering

## Quick Reference

**Data Connector**: M language connector, build with `msbuild`, requires Speckle Desktop Service on port `29364`.

**3D Visual**: Vue 3 + TypeScript, run `npm run dev` for development.

## Shared Context

### URL Formats

- Model: `https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID`
- Version: `https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID@VERSION_ID`
- Federated: Multiple models are auto-detected and combined

### Authentication

OAuth2 with PKCE only. The connector previously supported PAT and Implicit auth, but now uses OAuth exclusively with enhanced PKCE security.

## Repository Structure

```text
src/
|-- powerbi-data-connector/  # M language connector
`-- powerbi-visual/          # Vue 3 + TypeScript visual
tools/                       # Build tools, including InnoSetup
```
