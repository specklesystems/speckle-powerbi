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
    Properties = #table(
        type table [
            object_key = Int64.Type,
            path_key = Int64.Type,
            #"Value Text" = nullable text,
            #"Value Number" = nullable number,
            Value = any
        ],
        {
            {1, 10, "typed-instance-must-not-win", null, "instance-area"},
            {2, 10, null, 999, null},
            {4, 14, "typed-instance-only-must-not-win", null, "instance-only"}
        }
    ),
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
            Value = any
        ],
        {
            {100, 10, "typed-type-must-not-win", null, "type-area"},
            {100, 13, "typed-type-only-must-not-win", null, "type-only"},
            {101, 11, null, 123, "type-quantity"}
        }
    ),
    Paths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Dimensions.Area"},
            {11, "properties.Quantities.Area"},
            {12, "properties.Geometry.Dimensions.Area"},
            {13, "properties.Material.TypeName"},
            {14, "properties.Instance.Mark"},
            {15, "properties.Identity.Application ID"},
            {16, "object_key"}
        }
    ),
    Source = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", Properties, "Table", "Table", true},
            {"Object Types", "object-types", ObjectTypes, "Table", "Table", true},
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true}
        }
    ),
    Result = Speckle.AddProperties(
        Source,
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        }
    ),
    EmptySource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", error "Properties must not be read", "Table", "Table", true},
            {"Object Types", "object-types", error "Object Types must not be read", "Table", "Table", true},
            {"Type Properties", "type-properties", error "Type Properties must not be read", "Table", "Table", true},
            {"Property Paths", "paths", error "Property Paths must not be read", "Table", "Table", true}
        }
    ),
    EmptyResult = Speckle.AddProperties(EmptySource, {}),
    NormalizedResult = Speckle.AddProperties(
        Source,
        {" properties.Dimensions.Area ", "properties.Dimensions.Area"}
    ),
    NamingResult = Speckle.AddProperties(
        Source,
        {
            "properties.Geometry.Dimensions.Area",
            "properties.Quantities.Area",
            "properties.Dimensions.Area",
            "properties.Identity.Application ID"
        }
    ),
    SuffixNamingResult = Speckle.AddProperties(Source, {"Area", "properties.Area"}),
    InvalidPathResult = try Speckle.AddProperties(
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
    MissingNavigationResult = try Speckle.AddProperties(
        Table.SelectRows(Source, each [Key] = "objects"),
        {"properties.Dimensions.Area"}
    ),
    MissingNavigationError = if not MissingNavigationResult[HasError] then
        [Reason = null, MissingKeys = {}, RequiredKeys = {}, ShowsCallShape = false]
    else
        [
            Reason = try MissingNavigationResult[Error][Reason] otherwise null,
            MissingKeys = try MissingNavigationResult[Error][Detail][MissingKeys] otherwise {},
            RequiredKeys = try MissingNavigationResult[Error][Detail][RequiredKeys] otherwise {},
            ShowsCallShape = try Text.Contains(
                MissingNavigationResult[Error][Message],
                "Speckle.AddProperties(Speckle.GetTables(url), propertyPaths)"
            ) otherwise false
        ],
    EmptyPathsInvalidShellResult = try Speckle.AddProperties(
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
    UnknownAndCaseResult = Speckle.AddProperties(
        Source,
        {"PROPERTIES.Dimensions.Area", "properties.Unknown.Value"}
    ),
    NameCollisionResult = try Table.RowCount(Speckle.AddProperties(Source, {"object_key"})),
    NameCollisionError = if not NameCollisionResult[HasError] then
        [Reason = null, PropertyPaths = {}, ExistingColumns = {}]
    else
        [
            Reason = try NameCollisionResult[Error][Reason] otherwise null,
            PropertyPaths = try NameCollisionResult[Error][Detail][PropertyPaths] otherwise {},
            ExistingColumns = try NameCollisionResult[Error][Detail][ExistingColumns] otherwise {}
        ],

    DuplicateObjectTypesSource = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Properties", "properties", Properties, "Table", "Table", true},
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
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true}
        }
    ),
    DuplicateObjectTypesResult = try Table.RowCount(
        Speckle.AddProperties(DuplicateObjectTypesSource, {"properties.Dimensions.Area"})
    ),
    DuplicateObjectTypesError = if not DuplicateObjectTypesResult[HasError] then
        [Reason = null, ObjectKeys = {}]
    else
        [
            Reason = try DuplicateObjectTypesResult[Error][Reason] otherwise null,
            ObjectKeys = try DuplicateObjectTypesResult[Error][Detail][ObjectKeys] otherwise {}
        ],
    DuplicateObjectTypesUnknownPathResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(DuplicateObjectTypesSource, {"properties.Unknown.Value"})
    ))),
    DuplicateObjectTypesUnknownPathReason = if not DuplicateObjectTypesUnknownPathResult[HasError] then
        null
    else
        try DuplicateObjectTypesUnknownPathResult[Error][Reason] otherwise null,

    FederatedObjects = #table(
        type table [object_key = Int64.Type, #"Application ID" = text],
        {{1, "model-a"}, {4294967297, "model-b"}}
    ),
    FederatedProperties = #table(
        type table [object_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "first-instance"}}
    ),
    FederatedObjectTypes = #table(
        type table [object_key = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {4294967297, 4294967396}}
    ),
    FederatedTypeProperties = #table(
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{100, 10, "first-type"}, {4294967396, 4294967306, "second-type"}}
    ),
    FederatedPaths = #table(
        type table [path_key = Int64.Type, Property = text],
        {{10, "properties.Identity.Name"}, {4294967306, "properties.Identity.Name"}}
    ),
    FederatedSource = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", FederatedObjects, "Table", "Table", true},
            {"Properties", "properties", FederatedProperties, "Table", "Table", true},
            {"Object Types", "object-types", FederatedObjectTypes, "Table", "Table", true},
            {"Type Properties", "type-properties", FederatedTypeProperties, "Table", "Table", true},
            {"Property Paths", "paths", FederatedPaths, "Table", "Table", true}
        }
    ),
    FederatedResult = Speckle.AddProperties(FederatedSource, {"properties.Identity.Name"}),

    DuplicateInstanceSource = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", #table(type table [object_key = Int64.Type], {{1}}), "Table", "Table", true},
            {
                "Properties",
                "properties",
                #table(
                    type table [object_key = Int64.Type, path_key = Int64.Type, Value = any],
                    {{1, 10, "first"}, {1, 10, "second"}}
                ),
                "Table",
                "Table",
                true
            },
            {"Object Types", "object-types", #table(type table [object_key = Int64.Type, type_key = Int64.Type], {}), "Table", "Table", true},
            {"Type Properties", "type-properties", #table(type table [type_key = Int64.Type, path_key = Int64.Type, Value = any], {}), "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true}
        }
    ),
    DuplicateInstanceResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(DuplicateInstanceSource, {"properties.Dimensions.Area"})
    ))),
    DuplicateTypeSource = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", #table(type table [object_key = Int64.Type], {{3}}), "Table", "Table", true},
            {"Properties", "properties", #table(type table [object_key = Int64.Type, path_key = Int64.Type, Value = any], {}), "Table", "Table", true},
            {"Object Types", "object-types", #table(type table [object_key = Int64.Type, type_key = Int64.Type], {{3, 101}}), "Table", "Table", true},
            {
                "Type Properties",
                "type-properties",
                #table(
                    type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
                    {{101, 11, "first"}, {101, 11, "second"}}
                ),
                "Table",
                "Table",
                true
            },
            {"Property Paths", "paths", Paths, "Table", "Table", true}
        }
    ),
    DuplicateTypeResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(DuplicateTypeSource, {"properties.Quantities.Area"})
    ))),

    facts = {
        Fact(
            "instance and type paths can be requested together with instance-row precedence",
            {
                {1, "one", "instance-area", "type-only", null},
                {2, "two", null, "type-only", null},
                {3, "three", null, null, null},
                {4, "four", null, null, "instance-only"}
            },
            Table.ToRows(Result)
        ),
        Fact(
            "an explicit null instance row suppresses the non-null type value",
            null,
            Result{[object_key = 2]}[Area]
        ),
        Fact(
            "raw Value columns are used for both instance and type facts",
            {"instance-area", "type-only", "instance-only"},
            {
                Result{[object_key = 1]}[Area],
                Result{[object_key = 1]}[TypeName],
                Result{[object_key = 4]}[Mark]
            }
        ),
        Fact(
            "added property columns have type any",
            true,
            Type.Is(type any, Type.TableColumn(Value.Type(Result), "Area"))
        ),
        Fact(
            "an empty normalized path list returns the exact Objects value without reading other navigation data",
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
            "paths are trimmed and deduplicated ordinally",
            {"object_key", "Application ID", "Area"},
            Table.ColumnNames(NormalizedResult)
        ),
        Fact(
            "shortest unique suffixes extend leftward and preserve requested order",
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
            "a complete shorter path stays fixed while an ambiguous longer path extends leftward",
            {"object_key", "Application ID", "Area", "properties.Area"},
            Table.ColumnNames(SuffixNamingResult)
        ),
        Fact(
            "invalid path items report every one-based position under the new namespace",
            [Reason = "Speckle.AddProperties.InvalidPropertyPaths", Positions = {1, 2, 3}],
            InvalidPathError
        ),
        Fact(
            "all five navigation keys are required and diagnostics show the new call shape",
            [
                Reason = "Speckle.AddProperties.InvalidNavigationSource",
                MissingKeys = {"properties", "object-types", "type-properties", "paths"},
                RequiredKeys = {"objects", "properties", "object-types", "type-properties", "paths"},
                ShowsCallShape = true
            ],
            MissingNavigationError
        ),
        Fact(
            "the complete navigation shell is validated before the empty-list return",
            [
                Reason = "Speckle.AddProperties.InvalidNavigationSource",
                MissingKeys = {"properties", "object-types", "type-properties", "paths"}
            ],
            EmptyPathsInvalidShellError
        ),
        Fact(
            "unknown and differently-cased paths append null columns",
            [
                Columns = {"object_key", "Application ID", "Area", "Value"},
                Values = {{null, null}, {null, null}, {null, null}, {null, null}}
            ],
            [
                Columns = Table.ColumnNames(UnknownAndCaseResult),
                Values = Table.ToRows(Table.SelectColumns(UnknownAndCaseResult, {"Area", "Value"}))
            ]
        ),
        Fact(
            "unresolvable Objects-column collisions use the new structured error",
            [
                Reason = "Speckle.AddProperties.NameCollision",
                PropertyPaths = {"object_key"},
                ExistingColumns = {"object_key", "Application ID"}
            ],
            NameCollisionError
        ),
        Fact(
            "duplicate Object Types rows for present objects report every offending key while orphan rows are ignored",
            [Reason = "Speckle.AddProperties.InvalidObjectTypes", ObjectKeys = {1, 2}],
            DuplicateObjectTypesError
        ),
        Fact(
            "Object Types uniqueness is validated for every nonempty request even when the path is unknown",
            "Speckle.AddProperties.InvalidObjectTypes",
            DuplicateObjectTypesUnknownPathReason
        ),
        Fact(
            "federated duplicate Property text resolves through namespaced object, type, and path keys",
            {{1, "model-a", "first-instance"}, {4294967297, "model-b", "second-type"}},
            Table.ToRows(FederatedResult)
        ),
        Fact(
            "duplicate instance facts fail instead of silently selecting a value",
            true,
            DuplicateInstanceResult[HasError]
        ),
        Fact(
            "duplicate type facts fail after projection instead of silently selecting a value",
            true,
            DuplicateTypeResult[HasError]
        )
    }
in
    Summarize(facts)
