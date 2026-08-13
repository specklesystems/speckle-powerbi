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
        type table [object_key = Int64.Type, #"Application ID" = text],
        {{1, "one"}, {2, "two"}, {3, "three"}}
    ) meta [TestMarker = "original Objects"],
    Properties = #table(
        type table [
            object_key = Int64.Type,
            path_key = Int64.Type,
            #"Value Text" = nullable text,
            #"Value Number" = nullable number,
            #"Value Bool" = nullable logical,
            Value = any
        ],
        {
            {1, 10, "typed-column-must-not-win", null, null, 42.5},
            {2, 10, null, 999, null, "instance-value"},
            {1, 11, null, 11, null, 11},
            {1, 12, null, 12, null, 12},
            {1, 13, "identity-name", null, null, "identity-name"}
        }
    ),
    Paths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Dimensions.Area"},
            {11, "properties.Quantities.Area"},
            {12, "properties.Geometry.Dimensions.Area"},
            {13, "properties.Identity.Application ID"}
        }
    ),
    ObjectTypes = #table(
        type table [object_key = Int64.Type, type_key = Int64.Type],
        {{3, 100}}
    ),
    TypeProperties = #table(
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{100, 10, "type-only-value-must-not-appear"}}
    ),
    Source = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", Properties, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true},
            {"Object Types", "object-types", ObjectTypes, "Table", "Table", true},
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true}
        }
    ),
    Result = Speckle.AddInstanceProperties(Source, {"properties.Dimensions.Area"}),
    EmptyResult = Speckle.AddInstanceProperties(Source, {}),
    NormalizedResult = Speckle.AddInstanceProperties(
        Source,
        {" properties.Dimensions.Area ", "properties.Dimensions.Area"}
    ),
    NamingResult = Speckle.AddInstanceProperties(
        Source,
        {
            "properties.Geometry.Dimensions.Area",
            "properties.Quantities.Area",
            "properties.Dimensions.Area",
            "properties.Identity.Application ID"
        }
    ),
    InvalidPathResult = try Speckle.AddInstanceProperties(
        Source,
        {null, "   ", 123, "properties.Dimensions.Area"}
    ),
    InvalidPathError = if not InvalidPathResult[HasError] then
        [Reason = null, Positions = {}]
    else
        [
            Reason = try InvalidPathResult[Error][Reason] otherwise null,
            Positions = try InvalidPathResult[Error][Detail][Positions] otherwise {}
        ],
    MissingNavigationResult = try Speckle.AddInstanceProperties(
        Table.SelectRows(Source, each [Key] = "objects"),
        {"properties.Dimensions.Area"}
    ),
    MissingNavigationError = if not MissingNavigationResult[HasError] then
        [Reason = null, MissingKeys = {}, ShowsCallShape = false]
    else
        [
            Reason = try MissingNavigationResult[Error][Reason] otherwise null,
            MissingKeys = try MissingNavigationResult[Error][Detail][MissingKeys] otherwise {},
            ShowsCallShape = try Text.Contains(
                MissingNavigationResult[Error][Message],
                "Speckle.AddInstanceProperties(Speckle.GetTables(url), propertyPaths)"
            ) otherwise false
        ],
    UnknownAndCaseResult = Speckle.AddInstanceProperties(
        Source,
        {"PROPERTIES.Dimensions.Area", "properties.Unknown.Value"}
    ),
    FederatedObjects = #table(
        type table [object_key = Int64.Type, #"Application ID" = text],
        {{1, "model-a"}, {4294967297, "model-b"}}
    ),
    FederatedProperties = #table(
        type table [object_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "first-model"}, {4294967297, 4294967306, "second-model"}}
    ),
    FederatedPaths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Identity.Name"},
            {4294967306, "properties.Identity.Name"}
        }
    ),
    FederatedSource = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", FederatedObjects, "Table", "Table", true},
            {"Properties", "properties", FederatedProperties, "Table", "Table", true},
            {"Property Paths", "paths", FederatedPaths, "Table", "Table", true}
        }
    ),
    FederatedResult = Speckle.AddInstanceProperties(
        FederatedSource,
        {"properties.Identity.Name"}
    ),
    UnreadTypeEntriesSource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", Properties, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true},
            {"Object Types", "object-types", error "Object Types must not be read", "Table", "Table", true},
            {"Type Properties", "type-properties", error "Type Properties must not be read", "Table", "Table", true}
        }
    ),
    UnreadTypeEntriesResult = Speckle.AddInstanceProperties(
        UnreadTypeEntriesSource,
        {"properties.Dimensions.Area"}
    ),

    facts = {
        Fact(
            "requested instance values are appended without losing objects",
            {{1, "one", 42.5}, {2, "two", "instance-value"}, {3, "three", null}},
            Table.ToRows(Result)
        ),
        Fact(
            "type-only values stay null and Properties Value is used directly",
            {42.5, "instance-value", null},
            Table.Column(Result, "Area")
        ),
        Fact(
            "Object Types and Type Properties navigation data are never read",
            {42.5, "instance-value", null},
            Table.Column(UnreadTypeEntriesResult, "Area")
        ),
        Fact(
            "added property columns have type any",
            true,
            Type.Is(type any, Type.TableColumn(Value.Type(Result), "Area"))
        ),
        Fact(
            "an empty path list returns the original Objects table unchanged",
            [
                Columns = {"object_key", "Application ID"},
                Rows = {{1, "one"}, {2, "two"}, {3, "three"}},
                Marker = "original Objects"
            ],
            [
                Columns = Table.ColumnNames(EmptyResult),
                Rows = Table.ToRows(EmptyResult),
                Marker = try Value.Metadata(EmptyResult)[TestMarker] otherwise null
            ]
        ),
        Fact(
            "paths are trimmed and deduplicated before naming",
            {"object_key", "Application ID", "Area"},
            Table.ColumnNames(NormalizedResult)
        ),
        Fact(
            "shortest unique suffixes include parents in natural order",
            {
                "object_key",
                "Application ID",
                "Geometry.Dimensions.Area",
                "Quantities.Area",
                "properties.Dimensions.Area",
                "Identity.Application ID"
            },
            Table.ColumnNames(NamingResult)
        ),
        Fact(
            "invalid path items report all one-based positions",
            [
                Reason = "Speckle.AddInstanceProperties.InvalidPropertyPaths",
                Positions = {1, 2, 3}
            ],
            InvalidPathError
        ),
        Fact(
            "missing navigation entries fail together before joins",
            [
                Reason = "Speckle.AddInstanceProperties.InvalidNavigationSource",
                MissingKeys = {"properties", "paths"},
                ShowsCallShape = true
            ],
            MissingNavigationError
        ),
        Fact(
            "unknown and differently-cased paths produce null columns",
            [
                Columns = {"object_key", "Application ID", "Area", "Value"},
                Values = {{null, null}, {null, null}, {null, null}}
            ],
            [
                Columns = Table.ColumnNames(UnknownAndCaseResult),
                Values = Table.ToRows(
                    Table.SelectColumns(UnknownAndCaseResult, {"Area", "Value"})
                )
            ]
        ),
        Fact(
            "federated duplicate path names resolve by namespaced path key",
            {{1, "model-a", "first-model"}, {4294967297, "model-b", "second-model"}},
            Table.ToRows(FederatedResult)
        )
    }
in
    Summarize(facts)
