<<h1 align="center">
  <img src="https://user-images.githubusercontent.com/2679513/131189167-18ea5fe1-c578-47f6-9785-3748178e4312.png" width="150px"/><br/>
  Speckle | Power BI
</h1>

<p align="center"><a href="https://twitter.com/SpeckleSystems"><img src="https://img.shields.io/twitter/follow/SpeckleSystems?style=social" alt="Twitter Follow"></a> <a href="https://speckle.community"><img src="https://img.shields.io/discourse/users?server=https%3A%2F%2Fspeckle.community&amp;style=flat-square&amp;logo=discourse&amp;logoColor=white" alt="Community forum users"></a> <a href="https://speckle.systems"><img src="https://img.shields.io/badge/https://-speckle.systems-royalblue?style=flat-square" alt="website"></a> <a href="https://docs.speckle.systems/"><img src="https://img.shields.io/badge/docs-speckle.systems-orange?style=flat-square&amp;logo=read-the-docs&amp;logoColor=white" alt="docs"></a></p>

> Speckle is the first AEC data hub that connects with your favorite AEC tools. Speckle exists to overcome the challenges of working in a fragmented industry where communication, creative workflows, and the exchange of data are often hindered by siloed software and processes. It is here to make the industry better.

<h3 align="center">
    Speckle Connector and 3D Visual for Power BI
</h3>

## Features

Speckle Power BI Data Connector lets you easily get data from Speckle into Power BI reports and visualizations. You can access and analyze data from various AEC apps (like Revit, Archicad, Grasshopper, and more) and open-source files (IFC, STL, OBJ, etc.) into Power BI with ease. 

<p align="center">
  <div align="center">
    <a href="https://app.speckle.systems/connectors/">
      Download Power BI Connector
    </a>
  </div>
</p>

Speckle’s connection to Power BI consists of two parts:

- **Data Connector** fetches the data you uploaded from AEC apps to Speckle.
- **3D Visual** allows you to see those models in 3D within Power BI.

![Desktop - 1 (1)](https://github.com/specklesystems/speckle-powerbi/assets/51519350/6d2c5224-965f-4eae-b869-be26cb48c6b2)

## Repository Structure

This repository is home to our Power BI connector. The Speckle Server provides all the web-facing functionality and can be found [here](https://github.com/specklesystems/Server).

`src/powerbi-data-connector` contains all the code for the Data connector.

`src/powerbi-visual` contains all the code for 3D Visual.

## Installation

Power BI connector installer can be downloaded from the [connectors portal](https://app.speckle.systems/connectors/). Full instructions for [installation](https://docs.speckle.systems/connectors/power-bi#setup) and [configuration](https://docs.speckle.systems/connectors/power-bi#why-dont-i-see-speckle-as-a-data-source-in-power-bi) can be found on our docs.

### 3D Visual

3D Visual can be imported as any other Power BI custom visual.

1. Navigate to the Visualization Pane.
2. Click the three dots (…) and select “Import a visual from a file”.
3. Go to `Documents/Power BI Desktop/Custom Visuals` and import `Speckle 3D Visual.pbiviz` file.
4. Speckle cube will appear in the Visualization pane.

For more on how to use the visual, [check our docs](https://docs.speckle.systems/connectors/power-bi).

## Quick Start

To get started with Power BI connector, please take a look at the [documentation](https://docs.speckle.systems/connectors/power-bi) and extensive [tutorials](https://www.youtube.com/@SpeckleSystems) published. 

### Load model tables

Connecting with `Speckle.GetTables` lists two entries in the Navigator:

- **Objects** — one row per object; bind `Objects[Object Key]` to the Speckle
  3D visual's **Object Keys** field (along with **Model Info**).
- **Properties** — a function bound to the model: it returns a lean
  table of `Object Key` plus the property columns you select, with one row per
  Objects row — relate it one-to-one to the Objects table on `Object Key`. It
  never modifies the imported Objects query.

Property values are not loaded as separate tables by default. Select the ones
you need with `Properties` (or the M helpers below) — the underlying source
keeps four hidden supporting tables (Property Values, Property Paths, Object
Types, Type Properties) that they read, and advanced M code can still address
them by key.

For advanced users who prefer to build their own relationships, the **Table
layout** setting under the connect dialog's collapsible **Advanced options**
section controls what the Navigator shows:

- **Simplified** (the default, and the behavior when omitted) — the Objects
  table and the `Properties` function, as above.
- **All tables** — additionally shows the four supporting tables (Property
  Values, Property Paths, Object Types, Type Properties) so you can load them
  and relate them yourself, e.g. Objects 1-\* Property Values \*-1 Property
  Paths on `Object Key` / `path_key`.

The same choice can be written directly in M:
`Speckle.GetTables(url, [TableLayout = "All tables"])`. The layout only
changes Navigator visibility — the underlying tables, keys and the
`Properties` function are identical in both layouts.

### Select properties with Properties

The recommended query model uses three queries:

1. **Objects** — the raw table; load it if the 3D visual needs it, otherwise
   loading is optional.
2. **Properties** — the function query; functions are inherently
   connection-only.
3. **Invoked result** — invoking `Properties` creates a separate table
   query; load it into the semantic model and relate it to Objects
   one-to-one on `Object Key` (the connector guarantees a
   relationship-ready key; Power BI may or may not autodetect the
   relationship).

In the invocation dialog, pick the properties to append from the dropdown
(the values come from the hidden Property Paths catalog, listed once each — in
federated models a path shared by several source models appears once and
applies across all of them, with `Source Model` providing row provenance).
Invoking with **Select All** works and has no width cap, but appending every
property can significantly increase refresh time and table width.

The same call can be written directly in M:

```powerquery-m
let
    Source = Speckle.GetTables("https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID"),
    Properties = Source{[Key = "expand-properties"]}[Data],
    ObjectProperties = Properties({"properties.Dimensions.Area", "properties.Material.Name"})
in
    ObjectProperties
```

Selection behavior:

- Omitting the argument, passing `null` or passing `{}` returns an
  `Object Key`-only table containing every object.
- Entries are trimmed and duplicates are dropped. Known paths are emitted in
  Property Paths catalog order (not the order you pass them); unknown paths
  follow the known ones.
- A well-formed path that disappears in a later model version keeps its column
  as an all-null column, so saved reports keep refreshing.
- Blank or non-text entries raise a structured invalid-path error.
- Every Objects row is preserved in Objects order, so the result relates
  one-to-one to Objects on `Object Key`; instance values land in unprefixed
  columns and type values in `Type_`-prefixed columns (see below).
- An optional second argument, **Column names**, controls how property columns
  are named: `"Shortest"` (the default) uses the shortest unique trailing part
  of each dotted path, `"Full path"` uses the entire path — for example
  `Properties({"properties.Dimensions.Area"}, "Full path")`. The `Type_`
  prefix applies in both modes.

### Add every object property

The M helpers remain available alongside `Properties` and, unlike it, return
the full Objects table enriched with property columns. For property-light
CAD models, create a blank query in Power Query and pass the navigation table
returned by `Speckle.GetTables` to the convenience helper:

```powerquery-m
let
    Source = Speckle.GetTables("https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID"),
    ObjectsWithProperties = Speckle.AddAllProperties(Source)
in
    ObjectsWithProperties
```

The result is the Objects table with every path from the Property Paths table
appended, split by source so provenance stays visible in the field list: values
stored per object land in an unprefixed column (for example `Area`), while
values stored on the object's type land in a `Type_`-prefixed column
(`Type_Area`). A property with both an instance value and a type value produces
both columns side by side. Paths without a value are retained as null columns.
Property columns use the shortest unique suffix of their dotted paths by
default; both helpers accept the same optional `columnNames` argument as the
`Properties` function (`"Shortest"` or `"Full path"`), so
`Speckle.AddAllProperties(Source, "Full path")` names every column with its
entire dotted path.

This helper is intended for models with relatively few property paths. BIM
models can contain hundreds or thousands of paths, producing a very wide table
and slower refreshes; use `Speckle.AddProperties(Source, propertyPaths, columnNames)`
to select only the properties needed in those cases.

## Development Setup

### For local development of the 3D Visual

1. **Clone the repository**:
   ```bash
   git clone https://github.com/specklesystems/speckle-powerbi.git
   cd speckle-powerbi
   ```

2. **Navigate to the visual directory**:
   ```bash
   cd src/powerbi-visual
   ```

3. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Build the visual**:
   ```bash
   # Development build
   npm run build:dev
   
   # Production build
   npm run build
   ```

### For local development of the Data Connector

1. **Install PowerQuery SDK**:
   Follow the instructions from the [official docs](https://docs.microsoft.com/en-us/power-query/installingsdk)

2. **Open the project in Visual Studio Code**:
   - Open `src/powerbi-data-connector/Speckle.proj`
   - Build the project to generate the `.mez` file

3. **Testing the connector**:
   - Visual Studio will automatically copy the `.mez` file to the appropriate location
   - Restart Power BI Desktop to see the latest changes

## About Speckle

What is Speckle? Check our ![YouTube Video Views](https://img.shields.io/youtube/views/B9humiSpHzM?label=Speckle%20in%201%20minute%20video&style=social)

### Features

- **Object-based:** say goodbye to files! Speckle is the first object based platform for the AEC industry
- **Version control:** Speckle is the Git & Hub for geometry and BIM data
- **Collaboration:** share your designs collaborate with others
- **3D Viewer:** see your CAD and BIM models online, share and embed them anywhere
- **Interoperability:** get your CAD and BIM models into other software without exporting or importing
- **Real time:** get real time updates and notifications and changes
- **GraphQL API:** get what you need anywhere you want it
- **Webhooks:** the base for a automation and next-gen pipelines
- **Built for developers:** we are building Speckle with developers in mind and got tools for every stack
- **Built for the AEC industry:** Speckle connectors are plugins for the most common software used in the industry such as Revit, Rhino, Grasshopper, AutoCAD, Civil 3D, Excel, Unreal Engine, Unity, QGIS, Blender and more!

### Try Speckle now!

Give Speckle a try in no time by:

- [![app.speckle.systems](https://img.shields.io/badge/https://-app.speckle.systems-0069ff?style=flat-square&logo=hackthebox&logoColor=white)](https://app.speckle.systems) ⇒ creating an account at our public server

### Resources

- [![Community forum users](https://img.shields.io/badge/community-forum-green?style=for-the-badge&logo=discourse&logoColor=white)](https://speckle.community) for help, feature requests or just to hang with other speckle enthusiasts, check out our community forum!
- [![website](https://img.shields.io/badge/tutorials-speckle.systems-royalblue?style=for-the-badge&logo=youtube)](https://speckle.systems) our tutorials portal is full of resources to get you started using Speckle
- [![docs](https://img.shields.io/badge/docs-speckle.systems-orange?style=for-the-badge&logo=read-the-docs&logoColor=white)](https://docs.speckle.systems) reference on almost any end-user and developer functionality
