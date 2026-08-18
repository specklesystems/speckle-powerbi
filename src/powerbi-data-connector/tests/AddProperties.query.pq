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
            {16, "object_key"},
            {17, "Type_properties.Dimensions.Area"}
        }
    ),
    // mirrors the real Speckle.GetTables shape, including the Navigator-only
    // Hidden column; other synthetic sources below omit it to prove the
    // helper does not require it
    Source = #table(
        type table [Name = text, Key = text, Data = table, ItemKind = text, ItemName = text, IsLeaf = logical, Hidden = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true, false},
            {"Properties", "properties", Properties, "Table", "Table", true, true},
            {"Object Types", "object-types", ObjectTypes, "Table", "Table", true, true},
            {"Type Properties", "type-properties", TypeProperties, "Table", "Table", true, true},
            {"Property Paths", "paths", Paths, "Table", "Table", true, false}
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
    // path 12 has no facts (unprefixed) and path 11 is type-only (prefixed);
    // both resolve to the suffix "Area" without colliding
    NoCrossPrefixCollisionResult = Speckle.AddProperties(
        Source,
        {"properties.Geometry.Dimensions.Area", "properties.Quantities.Area"}
    ),
    // the second path is factless and resolves to the literal text "Type_Area",
    // colliding with the first path's prefixed variant, so both paths grow
    LiteralPrefixCollisionResult = Speckle.AddProperties(
        Source,
        {"properties.Dimensions.Area", "properties.Odd.Type_Area"}
    ),
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

    FullPathResult = Speckle.AddProperties(
        Source,
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        },
        "Full path"
    ),
    FullPathCaseInsensitiveResult = Speckle.AddProperties(
        Source,
        {"properties.Dimensions.Area"},
        "full PATH"
    ),
    ExplicitShortestResult = Speckle.AddProperties(
        Source,
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        },
        "shortest"
    ),
    InvalidColumnNamesResult = try Table.RowCount(
        Speckle.AddProperties(Source, {"properties.Dimensions.Area"}, "Longest")
    ),
    InvalidColumnNamesError = if not InvalidColumnNamesResult[HasError] then
        [Reason = null, ColumnNames = null, AllowedValues = {}]
    else
        [
            Reason = try InvalidColumnNamesResult[Error][Reason] otherwise null,
            ColumnNames = try InvalidColumnNamesResult[Error][Detail][ColumnNames] otherwise null,
            AllowedValues = try InvalidColumnNamesResult[Error][Detail][AllowedValues] otherwise {}
        ],
    EmptyInvalidColumnNamesResult = try Table.RowCount(
        Speckle.AddProperties(EmptySource, {}, "Longest")
    ),
    EmptyInvalidColumnNamesReason = if not EmptyInvalidColumnNamesResult[HasError] then
        null
    else
        try EmptyInvalidColumnNamesResult[Error][Reason] otherwise null,
    EmptyFullPathResult = Speckle.AddProperties(EmptySource, {}, "Full path"),
    FullPathBaseCollisionResult = try Table.RowCount(
        Speckle.AddProperties(Source, {"object_key"}, "Full path")
    ),
    FullPathBaseCollisionReason = if not FullPathBaseCollisionResult[HasError] then
        null
    else
        try FullPathBaseCollisionResult[Error][Reason] otherwise null,
    // the literal path resolves to exactly the first path's Type_ variant and
    // neither name can grow at full depth
    FullPathPrefixCollisionResult = try Table.RowCount(
        Speckle.AddProperties(
            Source,
            {"properties.Dimensions.Area", "Type_properties.Dimensions.Area"},
            "Full path"
        )
    ),
    FullPathPrefixCollisionReason = if not FullPathPrefixCollisionResult[HasError] then
        null
    else
        try FullPathPrefixCollisionResult[Error][Reason] otherwise null,

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
            "split columns stay adjacent per path, and a type-only path emits only its prefixed column",
            {"object_key", "Application ID", "Area", "Type_Area", "Type_TypeName", "Mark"},
            Table.ColumnNames(Result)
        ),
        Fact(
            "instance and type facts land in separate unprefixed and Type_-prefixed columns",
            {
                {1, "one", "instance-area", "type-area", "type-only", null},
                {2, "two", null, "type-area", "type-only", null},
                {3, "three", null, null, null, null},
                {4, "four", null, null, null, "instance-only"}
            },
            Table.ToRows(Result)
        ),
        Fact(
            "an explicit null instance row no longer hides the type value, which stays visible in the prefixed column",
            [Area = null, Type_Area = "type-area"],
            [Area = Result{[object_key = 2]}[Area], Type_Area = Result{[object_key = 2]}[Type_Area]]
        ),
        Fact(
            "raw Value columns are used for both instance and type facts",
            {"instance-area", "type-only", "instance-only"},
            {
                Result{[object_key = 1]}[Area],
                Result{[object_key = 1]}[Type_TypeName],
                Result{[object_key = 4]}[Mark]
            }
        ),
        Fact(
            "added property columns have type any on both sides of the split",
            {true, true},
            {
                Type.Is(type any, Type.TableColumn(Value.Type(Result), "Area")),
                Type.Is(type any, Type.TableColumn(Value.Type(Result), "Type_Area"))
            }
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
            {"object_key", "Application ID", "Area", "Type_Area"},
            Table.ColumnNames(NormalizedResult)
        ),
        Fact(
            "shortest unique suffixes extend leftward over the emitted names and preserve requested order",
            {
                "object_key",
                "Application ID",
                "Geometry.Dimensions.Area",
                "Type_Quantities.Area",
                "properties.Dimensions.Area",
                "Type_properties.Dimensions.Area",
                "Identity.Application ID"
            },
            Table.ColumnNames(NamingResult)
        ),
        Fact(
            "an unprefixed path and a Type_-prefixed path sharing a resolved suffix do not collide",
            {"object_key", "Application ID", "Area", "Type_Area"},
            Table.ColumnNames(NoCrossPrefixCollisionResult)
        ),
        Fact(
            "a genuine path resolving to a literal Type_ name collides with a prefixed name and grows",
            {"object_key", "Application ID", "Dimensions.Area", "Type_Dimensions.Area", "Odd.Type_Area"},
            Table.ColumnNames(LiteralPrefixCollisionResult)
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
            "federated duplicate Property text resolves through namespaced keys and the split surfaces the type value previously hidden behind model A's instance value",
            {{1, "model-a", "first-instance", "first-type"}, {4294967297, "model-b", null, "second-type"}},
            Table.ToRows(FederatedResult)
        ),
        Fact(
            "Full path names every column with the entire dotted path, keeping the Type_ split",
            {
                "object_key",
                "Application ID",
                "properties.Dimensions.Area",
                "Type_properties.Dimensions.Area",
                "Type_properties.Material.TypeName",
                "properties.Instance.Mark"
            },
            Table.ColumnNames(FullPathResult)
        ),
        Fact(
            "Full path renames columns only — cell values match the Shortest result",
            Table.ToRows(Result),
            Table.ToRows(FullPathResult)
        ),
        Fact(
            "columnNames matches case-insensitively in both modes",
            [
                FullPath = {
                    "object_key",
                    "Application ID",
                    "properties.Dimensions.Area",
                    "Type_properties.Dimensions.Area"
                },
                Shortest = Table.ColumnNames(Result)
            ],
            [
                FullPath = Table.ColumnNames(FullPathCaseInsensitiveResult),
                Shortest = Table.ColumnNames(ExplicitShortestResult)
            ]
        ),
        Fact(
            "an unknown columnNames value raises the structured error listing the allowed values",
            [
                Reason = "Speckle.AddProperties.InvalidColumnNames",
                ColumnNames = "Longest",
                AllowedValues = {"Shortest", "Full path"}
            ],
            InvalidColumnNamesError
        ),
        Fact(
            "an invalid columnNames fails loudly even with an empty selection and unread fact tables",
            "Speckle.AddProperties.InvalidColumnNames",
            EmptyInvalidColumnNamesReason
        ),
        Fact(
            "a valid columnNames with an empty selection still returns the exact Objects value",
            [Columns = {"object_key", "Application ID"}, Marker = "original Objects"],
            [
                Columns = Table.ColumnNames(EmptyFullPathResult),
                Marker = try Value.Metadata(EmptyFullPathResult)[TestMarker] otherwise null
            ]
        ),
        Fact(
            "a Full path collision with an Objects column cannot grow and keeps the structured error",
            "Speckle.AddProperties.NameCollision",
            FullPathBaseCollisionReason
        ),
        Fact(
            "a Full path collision between a Type_ variant and a literal Type_ path cannot grow and keeps the structured error",
            "Speckle.AddProperties.NameCollision",
            FullPathPrefixCollisionReason
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
