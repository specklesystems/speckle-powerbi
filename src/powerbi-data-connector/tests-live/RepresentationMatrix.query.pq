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
    StarItems = {"Objects"},
    StarKinds = {"Function"},
    HiddenColumnName = (nav as table) as any =>
        Record.FieldOrDefault(Value.Metadata(Value.Type(nav)), "NavigationTable.HiddenColumn", null),
    ObjectsFunction = (nav as table) as function => nav{[Key = "objects"]}[Data],
    FunctionMetadata = (f as function) as record => Value.Metadata(Value.Type(f)),
    ParameterType = (f as function) as type =>
        Record.Field(Type.FunctionParameters(Value.Type(f)), "Properties"),
    ParameterMetadata = (f as function) as record => Value.Metadata(ParameterType(f)),
    ParameterNames = (f as function) as list =>
        Record.FieldNames(Type.FunctionParameters(Value.Type(f))),
    RequiredParameterCount = (f as function) as number =>
        Type.FunctionRequiredParameters(Value.Type(f)),
    TableSnapshot = (t as table) as record => [
        Columns = Table.ColumnNames(t),
        Rows = Table.ToRows(t)
    ],
    PropertyDescription = "Select properties to append. Instance and type values are returned in separate columns. Selecting all properties may significantly increase refresh time and table width.",

    legacyBoth = Speckle.GetByUrl(UrlJsonAndArtifact),
    legacyJsonOnly = Speckle.GetByUrl(UrlJsonOnly),
    starBoth = Speckle.GetTables(UrlJsonAndArtifact),
    starArtifactOnly = Speckle.GetTables(UrlArtifactOnly),
    loadObjectsBoth = ObjectsFunction(starBoth),
    propertyOptions = Record.Field(ParameterMetadata(loadObjectsBoth), "Documentation.AllowedValues"),
    baseObjects = Function.Invoke(loadObjectsBoth, {}),
    nullSelectionObjects = Function.Invoke(loadObjectsBoth, {null}),
    emptySelectionObjects = Function.Invoke(loadObjectsBoth, {{}}),
    firstSelectionObjects = if List.IsEmpty(propertyOptions) then
        baseObjects
    else
        Function.Invoke(loadObjectsBoth, {{List.First(propertyOptions)}}),
    allSelectionObjects = Function.Invoke(loadObjectsBoth, {propertyOptions}),
    baseColumns = Table.ColumnNames(baseObjects),
    PropertyColumns = (selected as list) as list =>
        List.Skip(
            Table.ColumnNames(Function.Invoke(loadObjectsBoth, {selected})),
            List.Count(baseColumns)
        ),
    firstTwoOptions = List.FirstN(propertyOptions, 2),
    expectedFirstTwoColumns = PropertyColumns(firstTwoOptions),
    reversedFirstTwoColumns = PropertyColumns(List.Reverse(firstTwoOptions)),
    missingPath = "__speckle_test_missing_property__",
    missingPathObjects = Function.Invoke(loadObjectsBoth, {{missingPath}}),

    facts = {
        // both representations: each function reads its own representation
        Fact("GetByUrl(both) returns the 3.x flat columns", true,
            List.ContainsAll(Table.ColumnNames(legacyBoth), LegacyColumns)),
        Fact("GetByUrl(both, true) expands properties without error", true,
            Table.RowCount(Speckle.GetByUrl(UrlJsonAndArtifact, true)) > 0),
        Fact("GetTables(both) exposes only the Objects function", StarItems,
            Table.Column(starBoth, "Name")),
        Fact("GetTables(both) marks Objects as a function", StarKinds,
            Table.Column(starBoth, "ItemKind")),
        Fact("GetTables(both) declares the Navigator hidden column", "Hidden",
            HiddenColumnName(starBoth)),
        Fact("Objects function parameters", {"Properties"},
            ParameterNames(loadObjectsBoth)),
        Fact("Objects function required arity", 0,
            RequiredParameterCount(loadObjectsBoth)),
        Fact("Objects function returns a table", true,
            Type.Is(Type.FunctionReturn(Value.Type(loadObjectsBoth)), type table)),
        Fact("Objects function invocation title", "Load Speckle Objects",
            Record.Field(FunctionMetadata(loadObjectsBoth), "Documentation.Name")),
        Fact("Objects function parameter caption", "Properties (optional)",
            Record.Field(ParameterMetadata(loadObjectsBoth), "Documentation.FieldCaption")),
        Fact("Objects function parameter description", PropertyDescription,
            Record.Field(ParameterMetadata(loadObjectsBoth), "Documentation.FieldDescription")),
        Fact("Objects function parameter is a nullable list", true,
            Type.IsNullable(ParameterType(loadObjectsBoth))
                and Type.Is(Type.NonNullable(ParameterType(loadObjectsBoth)), type list)),
        Fact("Objects function exposes property options", true,
            Value.Is(propertyOptions, type list)),
        Fact("omitted properties return Objects unchanged", TableSnapshot(baseObjects),
            TableSnapshot(nullSelectionObjects)),
        Fact("empty properties return Objects unchanged", TableSnapshot(baseObjects),
            TableSnapshot(emptySelectionObjects)),
        Fact("selected properties follow the fixed Objects columns", baseColumns,
            List.FirstN(Table.ColumnNames(firstSelectionObjects), List.Count(baseColumns))),
        Fact("selected properties follow Property Paths order", expectedFirstTwoColumns,
            reversedFirstTwoColumns),
        Fact("a disappeared selected path retains a null column", {missingPath},
            List.Skip(Table.ColumnNames(missingPathObjects), List.Count(baseColumns))),
        Fact("a disappeared selected path contains only nulls", 0,
            List.NonNullCount(Table.Column(missingPathObjects, missingPath))),
        Fact("select all executes without a width cap", true,
            Table.ColumnCount(allSelectionObjects) >= List.Count(baseColumns)),

        // JSON only
        Fact("GetByUrl(json-only) returns the 3.x flat columns", true,
            List.ContainsAll(Table.ColumnNames(legacyJsonOnly), LegacyColumns)),
        Fact("GetTables(json-only) errors towards GetByUrl", "ArtifactBundleUnavailable",
            ErrorReason(() => Table.RowCount(Table.Combine(Table.Column(Speckle.GetTables(UrlJsonOnly), "Data"))))),

        // artifact only
        Fact("GetByUrl(artifact-only) errors towards GetTables", "JsonRepresentationUnavailable",
            ErrorReason(() => Table.RowCount(Speckle.GetByUrl(UrlArtifactOnly)))),
        Fact("GetTables(artifact-only) exposes only the Objects function", StarItems,
            Table.Column(starArtifactOnly, "Name")),
        Fact("GetTables(artifact-only) marks Objects as a function", StarKinds,
            Table.Column(starArtifactOnly, "ItemKind"))
    }
in
    Summarize(facts)
