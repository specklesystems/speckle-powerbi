// ENG-9165 live representation-matrix tests. Kept in tests-live\ (PQTest
// recurses through tests\, and these must not run offline) because they need:
//   1. a credential:  PQTest.exe set-credential --extension bin\Speckle.mez
//                        --queryFile tests-live\RepresentationMatrix.query.pq
//   2. the four placeholder URLs below, pointing at versions on a server you
//      can read (see the matrix in the ENG-9165 ticket).
//
// | version representation | Speckle.GetByUrl        | Speckle.GetTables        |
// | ----------------------- | ----------------------- | ------------------------ |
// | JSON and artifact       | legacy flat table       | star-schema tables       |
// | JSON only (pre-4.0)     | legacy flat table       | error ArtifactBundleUnavailable |
// | artifact only (4.0)     | error JsonRepresentationUnavailable | star-schema tables |
// | neither                 | error DataUnavailable   | error DataUnavailable    |
let
    // -- fill these in ------------------------------------------------------
    UrlJsonAndArtifact = "https://app.speckle.systems/projects/PROJECT/models/MODEL_BOTH",
    UrlJsonOnly = "https://app.speckle.systems/projects/PROJECT/models/MODEL_JSON_ONLY",
    UrlArtifactOnly = "https://app.speckle.systems/projects/PROJECT/models/MODEL_ARTIFACT_ONLY",
    // ------------------------------------------------------------------------

    Repr = (v as any) as text => try Text.FromBinary(Json.FromValue(v)) otherwise "<unserializable>",
    Fact = (description as text, expected as any, actual as any) as record => [
        Description = description,
        Passed = (try expected = actual otherwise false) = true,
        Expected = Repr(expected),
        Actual = Repr(try actual otherwise "<error>")
    ],
    Summarize = (facts as list) as text =>
        let
            failures = List.Select(facts, each not [Passed])
        in
            if List.IsEmpty(failures) then
                "PASSED " & Text.From(List.Count(facts)) & " facts"
            else
                error Text.Combine(
                    List.Transform(
                        failures,
                        each "FAILED: " & [Description] & " (expected " & [Expected] & ", got " & [Actual] & ")"
                    ),
                    "#(lf)"
                ),

    ErrorReason = (action as function) as text =>
        let outcome = try action() in
            if outcome[HasError] then outcome[Error][Reason] else "<no error>",

    LegacyColumns = {"Object IDs", "Speckle Type", "Version Object ID", "Model Info", "Application ID", "data"},
    StarTables = {"Objects", "Properties", "Property Paths", "Object Types", "Type Properties", "Properties"},
    // Objects, Property Paths and the Properties function surface in
    // the Navigator; the other three rows are hidden implementation details
    // for the property helpers
    StarHidden = {false, true, false, true, true, false},
    HiddenColumnName = (nav as table) as any =>
        Record.FieldOrDefault(Value.Metadata(Value.Type(nav)), "NavigationTable.HiddenColumn", null),

    legacyBoth = Speckle.GetByUrl(UrlJsonAndArtifact),
    legacyJsonOnly = Speckle.GetByUrl(UrlJsonOnly),
    starBoth = Speckle.GetTables(UrlJsonAndArtifact),
    starArtifactOnly = Speckle.GetTables(UrlArtifactOnly),
    starObjects = starBoth{[Key = "objects"]}[Data],
    starExpand = starBoth{[Key = "expand-properties"]}[Data],
    starFirstPath = List.First(Table.Column(starBoth{[Key = "paths"]}[Data], "Property")),
    starExpanded = starExpand({starFirstPath}),

    facts = {
        // both representations: each function reads its own representation
        Fact("GetByUrl(both) returns the 3.x flat columns", true,
            List.ContainsAll(Table.ColumnNames(legacyBoth), LegacyColumns)),
        Fact("GetByUrl(both, true) expands properties without error", true,
            Table.RowCount(Speckle.GetByUrl(UrlJsonAndArtifact, true)) > 0),
        Fact("GetTables(both) returns the star-schema navigation table", StarTables,
            Table.Column(starBoth, "Name")),
        Fact("GetTables(both) declares the Navigator hidden column", "Hidden",
            HiddenColumnName(starBoth)),
        Fact("GetTables(both) hides all but Objects, Property Paths and Properties", StarHidden,
            Table.Column(starBoth, "Hidden")),
        Fact("GetTables(both) exposes Properties as a function", true,
            Value.Is(starExpand, type function)),
        Fact("Properties(null) returns the full Objects table", Table.RowCount(starObjects),
            Table.RowCount(starExpand(null))),
        Fact("Properties appends the selected property while preserving all rows", true,
            Table.RowCount(starExpanded) = Table.RowCount(starObjects)
                and Table.ColumnCount(starExpanded) > Table.ColumnCount(starObjects)),

        // JSON only — force a known table row: the Data column also carries
        // the Properties function, so combining every Data value would
        // fail for the wrong reason
        Fact("GetByUrl(json-only) returns the 3.x flat columns", true,
            List.ContainsAll(Table.ColumnNames(legacyJsonOnly), LegacyColumns)),
        Fact("GetTables(json-only) errors towards GetByUrl", "ArtifactBundleUnavailable",
            ErrorReason(() => Table.RowCount(Speckle.GetTables(UrlJsonOnly){[Key = "objects"]}[Data]))),

        // artifact only
        Fact("GetByUrl(artifact-only) errors towards GetTables", "JsonRepresentationUnavailable",
            ErrorReason(() => Table.RowCount(Speckle.GetByUrl(UrlArtifactOnly)))),
        Fact("GetTables(artifact-only) returns the star-schema navigation table", StarTables,
            Table.Column(starArtifactOnly, "Name")),
        Fact("GetTables(artifact-only) hides all but Objects, Property Paths and Properties", StarHidden,
            Table.Column(starArtifactOnly, "Hidden"))
    }
in
    Summarize(facts)
