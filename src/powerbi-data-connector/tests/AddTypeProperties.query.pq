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
        {{1, "one"}, {2, "two"}, {3, "three"}, {4, "four"}}
    ) meta [TestMarker = "original Objects"],
    Paths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Dimensions.Area"},
            {11, "properties.Quantities.Area"},
            {12, "properties.Geometry.Dimensions.Area"},
            {13, "properties.Identity.Application ID"}
        }
    ),
    // objects 1 and 2 share type 100 (projection); type 101 has no value for
    // the default requested path; object 4 has no type; object_key 99 is not
    // in Objects, so its rows — although repeated — must be ignored, not fail
    ObjectTypes = #table(
        type table [object_key = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {2, 100}, {3, 101}, {99, 100}, {99, 101}}
    ),
    TypeProperties = #table(
        type table [
            type_key = Int64.Type,
            path_key = Int64.Type,
            #"Value Text" = nullable text,
            #"Value Number" = nullable number,
            #"Value Bool" = nullable logical,
            Value = any
        ],
        {
            {100, 10, "typed-column-must-not-win", null, null, 42.5},
            {101, 11, null, 999, null, "only-quantities"}
        }
    ),
    // the instance Properties entry is present but error-valued: reading it in
    // any code path (e.g. to honor an instance override) would fail the suite
    Source = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", error "instance Properties must not be read", "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true},
            {"Object Types", "object-types", ObjectTypes, "Table", "Table", true},
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true}
        }
    ),
    Result = Speckle.AddTypeProperties(Source, {"properties.Dimensions.Area"}),
    MinimalSource = Table.SelectRows(Source, each [Key] <> "properties"),
    MinimalResult = Speckle.AddTypeProperties(MinimalSource, {"properties.Dimensions.Area"}),
    EmptySource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Property Paths", "paths", error "Property Paths must not be read", "Table", "Table", true},
            {"Object Types", "object-types", error "Object Types must not be read", "Table", "Table", true},
            {"Type Properties", "type-properties", error "Type Properties must not be read", "Table", "Table", true}
        }
    ),
    EmptyResult = Speckle.AddTypeProperties(EmptySource, {}),
    NormalizedResult = Speckle.AddTypeProperties(
        Source,
        {" properties.Dimensions.Area ", "properties.Dimensions.Area"}
    ),
    NamingResult = Speckle.AddTypeProperties(
        Source,
        {
            "properties.Geometry.Dimensions.Area",
            "properties.Quantities.Area",
            "properties.Dimensions.Area",
            "properties.Identity.Application ID"
        }
    ),
    InvalidPathResult = try Speckle.AddTypeProperties(
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
    MissingNavigationResult = try Speckle.AddTypeProperties(
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
                "Speckle.AddTypeProperties(Speckle.GetTables(url), propertyPaths)"
            ) otherwise false
        ],
    MissingObjectsResult = try Speckle.AddTypeProperties(
        Table.SelectRows(Source, each [Key] <> "objects"),
        {"properties.Dimensions.Area"}
    ),
    MissingObjectsError = if not MissingObjectsResult[HasError] then
        [Reason = null, MissingKeys = {}]
    else
        [
            Reason = try MissingObjectsResult[Error][Reason] otherwise null,
            MissingKeys = try MissingObjectsResult[Error][Detail][MissingKeys] otherwise {}
        ],
    EmptyPathsInvalidShellResult = try Speckle.AddTypeProperties(
        Table.SelectRows(Source, each [Key] = "objects"),
        {}
    ),
    EmptyPathsInvalidShellError = if not EmptyPathsInvalidShellResult[HasError] then
        [Reason = null, MissingKeys = {}]
    else
        [
            Reason = try EmptyPathsInvalidShellResult[Error][Reason] otherwise null,
            MissingKeys = try EmptyPathsInvalidShellResult[Error][Detail][MissingKeys] otherwise {}
        ],
    UnknownAndCaseResult = Speckle.AddTypeProperties(
        Source,
        {"PROPERTIES.Dimensions.Area", "properties.Unknown.Value"}
    ),
    DuplicateSource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true},
            // object 1 repeats as an identical duplicate row, object 2 with two
            // different types; the repeated orphan 99 must still be ignored
            {
                "Object Types",
                "object-types",
                #table(
                    type table [object_key = Int64.Type, type_key = Int64.Type],
                    {{1, 100}, {1, 100}, {2, 100}, {2, 101}, {3, 101}, {99, 100}, {99, 101}}
                ),
                "Table",
                "Table",
                true
            },
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true}
        }
    ),
    DuplicateResult = try Speckle.AddTypeProperties(
        DuplicateSource,
        {"properties.Dimensions.Area"}
    ),
    DuplicateError = if not DuplicateResult[HasError] then
        [Reason = null, ObjectKeys = {}]
    else
        [
            Reason = try DuplicateResult[Error][Reason] otherwise null,
            ObjectKeys = try DuplicateResult[Error][Detail][ObjectKeys] otherwise {}
        ],
    FederatedObjects = #table(
        type table [object_key = Int64.Type, #"Application ID" = text],
        {{1, "model-a"}, {4294967297, "model-b"}}
    ),
    FederatedObjectTypes = #table(
        type table [object_key = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {4294967297, 4294967396}}
    ),
    FederatedTypeProperties = #table(
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{100, 10, "first-model"}, {4294967396, 4294967306, "second-model"}}
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
            {"Property Paths", "paths", FederatedPaths, "Table", "Table", true},
            {"Object Types", "object-types", FederatedObjectTypes, "Table", "Table", true},
            {"Type Properties", "type-properties", FederatedTypeProperties, "Table", "Table", true}
        }
    ),
    FederatedResult = Speckle.AddTypeProperties(
        FederatedSource,
        {"properties.Identity.Name"}
    ),

    facts = {
        Fact(
            "shared type values project to every object; missing type or value stays null; orphan bridge rows are ignored",
            {{1, "one", 42.5}, {2, "two", 42.5}, {3, "three", null}, {4, "four", null}},
            Table.ToRows(Result)
        ),
        Fact(
            "Type Properties Value is used directly and instance Properties navigation data is never read",
            {42.5, 42.5, null, null},
            Table.Column(Result, "Area")
        ),
        Fact(
            "the four required navigation entries alone are sufficient",
            {{1, "one", 42.5}, {2, "two", 42.5}, {3, "three", null}, {4, "four", null}},
            Table.ToRows(MinimalResult)
        ),
        Fact(
            "added property columns have type any",
            true,
            Type.Is(type any, Type.TableColumn(Value.Type(Result), "Area"))
        ),
        Fact(
            "an empty path list returns the original Objects table without reading type or path navigation data",
            [
                Columns = {"object_key", "Application ID"},
                Rows = {{1, "one"}, {2, "two"}, {3, "three"}, {4, "four"}},
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
                Reason = "Speckle.AddTypeProperties.InvalidPropertyPaths",
                Positions = {1, 2, 3}
            ],
            InvalidPathError
        ),
        Fact(
            "missing navigation entries fail together before joins",
            [
                Reason = "Speckle.AddTypeProperties.InvalidNavigationSource",
                MissingKeys = {"object-types", "type-properties", "paths"},
                ShowsCallShape = true
            ],
            MissingNavigationError
        ),
        Fact(
            "the objects entry itself is required",
            [
                Reason = "Speckle.AddTypeProperties.InvalidNavigationSource",
                MissingKeys = {"objects"}
            ],
            MissingObjectsError
        ),
        Fact(
            "the navigation shell is validated even for an empty path list",
            [
                Reason = "Speckle.AddTypeProperties.InvalidNavigationSource",
                MissingKeys = {"object-types", "type-properties", "paths"}
            ],
            EmptyPathsInvalidShellError
        ),
        Fact(
            "unknown and differently-cased paths produce null columns",
            [
                Columns = {"object_key", "Application ID", "Area", "Value"},
                Values = {{null, null}, {null, null}, {null, null}, {null, null}}
            ],
            [
                Columns = Table.ColumnNames(UnknownAndCaseResult),
                Values = Table.ToRows(
                    Table.SelectColumns(UnknownAndCaseResult, {"Area", "Value"})
                )
            ]
        ),
        Fact(
            "repeated object_key values in Object Types fail with the offending keys",
            [
                Reason = "Speckle.AddTypeProperties.InvalidObjectTypes",
                ObjectKeys = {1, 2}
            ],
            DuplicateError
        ),
        Fact(
            "federated duplicate path names resolve by namespaced type and path keys",
            {{1, "model-a", "first-model"}, {4294967297, "model-b", "second-model"}},
            Table.ToRows(FederatedResult)
        )
    }
in
    Summarize(facts)
