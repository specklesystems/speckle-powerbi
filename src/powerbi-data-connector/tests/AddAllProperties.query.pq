let
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

    Objects = #table(
        type table [#"Object Key" = Int64.Type, #"Application ID" = text],
        {{1, "one"}, {2, "two"}, {3, "three"}}
    ),
    PropertyValues = #table(
        type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "instance-area"}, {2, 10, null}}
    ),
    ObjectTypes = #table(
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {2, 100}}
    ),
    TypeProperties = #table(
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{100, 10, "type-area"}, {100, 11, "type-quantity"}}
    ),
    Paths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Zeta.Area"},
            {11, "properties.Alpha.Area"},
            {12, "properties.Empty.Value"}
        }
    ),
    Result = Speckle.AddAllProperties(Objects, PropertyValues, Paths, ObjectTypes, TypeProperties),

    // Lazy tables whose rows error on enumeration: the typed table parameters
    // force each argument to a table value, so an empty paths table can no
    // longer avoid evaluating the arguments entirely — the preserved contract
    // is that the fact rows are never read.
    UnreadTable = (message as text, tableType as type) as table =>
        Table.View(null, [GetType = () => tableType, GetRows = () => error message]),
    UnreadPropertyValues = UnreadTable(
        "Property Values must not be read",
        type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any]
    ),
    UnreadObjectTypes = UnreadTable(
        "Object Types must not be read",
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type]
    ),
    UnreadTypeProperties = UnreadTable(
        "Type Properties must not be read",
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any]
    ),

    EmptyObjects = Objects meta [TestMarker = "empty paths Objects"],
    EmptyPaths = #table(type table [path_key = Int64.Type, Property = text], {}),
    EmptyResult = Speckle.AddAllProperties(
        EmptyObjects, UnreadPropertyValues, EmptyPaths, UnreadObjectTypes, UnreadTypeProperties
    ),

    InvalidPaths = #table(
        type table [path_key = Int64.Type, Property = any],
        {
            {10, "properties.Valid.Value"},
            {11, null},
            {12, "   "},
            {13, 123}
        }
    ),
    InvalidResult = try Speckle.AddAllProperties(
        Objects, PropertyValues, InvalidPaths, ObjectTypes, TypeProperties
    ),
    InvalidError = if not InvalidResult[HasError] then
        [Reason = null, Positions = {}]
    else
        [
            Reason = try InvalidResult[Error][Reason] otherwise null,
            Positions = try InvalidResult[Error][Detail][Positions] otherwise {}
        ],

    WidePathCount = 128,
    WidePaths = #table(
        type table [path_key = Int64.Type, Property = text],
        List.Transform(
            {1..WidePathCount},
            each {_, "properties.Wide.P" & Text.PadStart(Text.From(_), 3, "0")}
        )
    ),
    WideResult = Speckle.AddAllProperties(
        #table(type table [#"Object Key" = Int64.Type], {{1}}),
        #table(type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any], {}),
        WidePaths,
        #table(type table [#"Object Key" = Int64.Type, type_key = Int64.Type], {}),
        #table(type table [type_key = Int64.Type, path_key = Int64.Type, Value = any], {})
    ),

    FullPathResult = Speckle.AddAllProperties(
        Objects, PropertyValues, Paths, ObjectTypes, TypeProperties, true
    ),
    InvalidUseFullPathsResult = try Table.RowCount(
        Speckle.AddAllProperties(Objects, PropertyValues, Paths, ObjectTypes, TypeProperties, "Longest")
    ),

    // the retired single-source convention forwards to AddProperties'
    // dedicated migration error
    NavigationShapedSource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {{"Objects", "objects", Objects, "Table", "Table", true}}
    ),
    OldShapeResult = try Table.RowCount(
        Speckle.AddAllProperties(
            NavigationShapedSource, PropertyValues, Paths, ObjectTypes, TypeProperties
        )
    ),
    OldShapeReason = if not OldShapeResult[HasError] then
        null
    else
        try OldShapeResult[Error][Reason] otherwise null,

    facts = {
        Fact(
            "every path is appended in path-table order with type-backed paths Type_-prefixed, and prefixed variants sharing a suffix still grow both paths",
            {"Object Key", "Application ID", "Zeta.Area", "Type_Zeta.Area", "Type_Alpha.Area", "Value"},
            Table.ColumnNames(Result)
        ),
        Fact(
            "instance and type values land in separate columns and explicit null instance rows no longer hide type values",
            {
                {1, "instance-area", "type-area", "type-quantity", null},
                {2, null, "type-area", "type-quantity", null},
                {3, null, null, null, null}
            },
            Table.ToRows(
                Table.SelectColumns(
                    Result,
                    {"Object Key", "Zeta.Area", "Type_Zeta.Area", "Type_Alpha.Area", "Value"}
                )
            )
        ),
        Fact(
            "paths without values are retained as all-null columns",
            {null, null, null},
            Table.Column(Result, "Value")
        ),
        Fact(
            "added property columns retain type any on both sides of the split",
            {true, true},
            {
                Type.Is(type any, Type.TableColumn(Value.Type(Result), "Zeta.Area")),
                Type.Is(type any, Type.TableColumn(Value.Type(Result), "Type_Zeta.Area"))
            }
        ),
        Fact(
            "an empty paths table returns the exact Objects value without reading the fact tables' rows",
            [
                Columns = {"Object Key", "Application ID"},
                Rows = {{1, "one"}, {2, "two"}, {3, "three"}},
                Marker = "empty paths Objects"
            ],
            [
                Columns = Table.ColumnNames(EmptyResult),
                Rows = Table.ToRows(EmptyResult),
                Marker = try Value.Metadata(EmptyResult)[TestMarker] otherwise null
            ]
        ),
        Fact(
            "malformed path entries reuse AddProperties structured validation",
            [Reason = "Speckle.AddProperties.InvalidPropertyPaths", Positions = {2, 3, 4}],
            InvalidError
        ),
        Fact(
            "useFullPaths forwards to AddProperties: true names every column with the entire dotted path",
            {
                "Object Key",
                "Application ID",
                "properties.Zeta.Area",
                "Type_properties.Zeta.Area",
                "Type_properties.Alpha.Area",
                "properties.Empty.Value"
            },
            Table.ColumnNames(FullPathResult)
        ),
        Fact(
            "a non-logical useFullPaths value is rejected by the parameter type",
            true,
            InvalidUseFullPathsResult[HasError]
        ),
        Fact(
            "passing the navigation table as objects forwards to the dedicated signature-changed error",
            "Speckle.AddProperties.SignatureChanged",
            OldShapeReason
        ),
        Fact(
            "a moderately wide property-light model adds every null-only path",
            [ColumnCount = WidePathCount + 1, LastColumn = "P128", LastValue = null],
            [
                ColumnCount = Table.ColumnCount(WideResult),
                LastColumn = List.Last(Table.ColumnNames(WideResult)),
                LastValue = WideResult{0}[P128]
            ]
        )
    }
in
    Summarize(facts)
