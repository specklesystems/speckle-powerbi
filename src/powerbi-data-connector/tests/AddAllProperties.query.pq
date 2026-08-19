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

    // mirrors the real Speckle.GetTables shape, including the Navigator-only
    // Hidden column; EmptySource below omits it to prove the helper does not
    // require it
    Navigation = (
        objects as table,
        properties as any,
        objectTypes as any,
        typeProperties as any,
        paths as table
    ) as table =>
        #table(
            type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical, Hidden = logical],
            {
                {"Objects", "objects", objects, "Table", "Table", true, false},
                {"Properties", "properties", properties, "Table", "Table", true, true},
                {"Object Types", "object-types", objectTypes, "Table", "Table", true, true},
                {"Type Properties", "type-properties", typeProperties, "Table", "Table", true, true},
                {"Property Paths", "paths", paths, "Table", "Table", true, false}
            }
        ),

    Objects = #table(
        type table [#"Object Key" = Int64.Type, #"Application ID" = text],
        {{1, "one"}, {2, "two"}, {3, "three"}}
    ),
    Properties = #table(
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
    Source = Navigation(Objects, Properties, ObjectTypes, TypeProperties, Paths),
    Result = Speckle.AddAllProperties(Source),

    EmptyObjects = Objects meta [TestMarker = "empty paths Objects"],
    EmptySource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", EmptyObjects, "Table", "Table", true},
            {"Properties", "properties", error "Properties must not be read", "Table", "Table", true},
            {"Object Types", "object-types", error "Object Types must not be read", "Table", "Table", true},
            {"Type Properties", "type-properties", error "Type Properties must not be read", "Table", "Table", true},
            {
                "Property Paths",
                "paths",
                #table(type table [path_key = Int64.Type, Property = text], {}),
                "Table",
                "Table",
                true
            }
        }
    ),
    EmptyResult = Speckle.AddAllProperties(EmptySource),

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
        Navigation(Objects, Properties, ObjectTypes, TypeProperties, InvalidPaths)
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
    WideSource = Navigation(
        #table(type table [#"Object Key" = Int64.Type], {{1}}),
        #table(type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any], {}),
        #table(type table [#"Object Key" = Int64.Type, type_key = Int64.Type], {}),
        #table(type table [type_key = Int64.Type, path_key = Int64.Type, Value = any], {}),
        WidePaths
    ),
    WideResult = Speckle.AddAllProperties(WideSource),

    FullPathResult = Speckle.AddAllProperties(Source, "Full path"),
    InvalidColumnNamesResult = try Table.RowCount(Speckle.AddAllProperties(Source, "Longest")),
    InvalidColumnNamesReason = if not InvalidColumnNamesResult[HasError] then
        null
    else
        try InvalidColumnNamesResult[Error][Reason] otherwise null,

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
            "an empty paths table returns the exact Objects value without reading fact tables",
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
            "columnNames forwards to AddProperties: Full path names every column with the entire dotted path",
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
            "an unknown columnNames value forwards to the structured AddProperties error",
            "Speckle.AddProperties.InvalidColumnNames",
            InvalidColumnNamesReason
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
