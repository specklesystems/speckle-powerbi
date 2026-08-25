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
        {{1, "one"}, {2, "two"}, {3, "three"}, {4, "four"}}
    ) meta [TestMarker = "original Objects"],
    PropertyValues = #table(
        type table [
            #"Object Key" = Int64.Type,
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
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type],
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
    Call = (propertyPaths as list, optional useFullPaths as nullable logical) as table =>
        Speckle.AddProperties(
            Objects, PropertyValues, Paths, ObjectTypes, TypeProperties,
            propertyPaths, useFullPaths
        ),

    // Lazy tables whose rows error on enumeration: the typed table parameters
    // force each argument to a table value, so an empty selection can no
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
    UnreadPaths = UnreadTable(
        "Property Paths must not be read",
        type table [path_key = Int64.Type, Property = text]
    ),

    Result = Call(
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        }
    ),
    EmptyResult = Speckle.AddProperties(
        Objects, UnreadPropertyValues, UnreadPaths, UnreadObjectTypes, UnreadTypeProperties, {}
    ),
    NormalizedResult = Call({" properties.Dimensions.Area ", "properties.Dimensions.Area"}),
    NamingResult = Call(
        {
            "properties.Geometry.Dimensions.Area",
            "properties.Quantities.Area",
            "properties.Dimensions.Area",
            "properties.Identity.Application ID"
        }
    ),
    SuffixNamingResult = Call({"Area", "properties.Area"}),
    // path 12 has no facts (unprefixed) and path 11 is type-only (prefixed);
    // both resolve to the suffix "Area" without colliding
    NoCrossPrefixCollisionResult = Call(
        {"properties.Geometry.Dimensions.Area", "properties.Quantities.Area"}
    ),
    // the second path is factless and resolves to the literal text "Type_Area",
    // colliding with the first path's prefixed variant, so both paths grow
    LiteralPrefixCollisionResult = Call(
        {"properties.Dimensions.Area", "properties.Odd.Type_Area"}
    ),
    InvalidPathResult = try Call({null, "   ", 123, "properties.Dimensions.Area"}),
    InvalidPathError = if not InvalidPathResult[HasError] then
        [Reason = null, Positions = {}]
    else
        [
            Reason = try InvalidPathResult[Error][Reason] otherwise null,
            Positions = try InvalidPathResult[Error][Detail][Positions] otherwise {}
        ],

    // the retired single-source convention: passing the Speckle.GetTables
    // navigation table as objects must raise the dedicated migration error
    NavigationShapedSource = #table(
        type table [Name = text, Key = text, Data = any, ItemKind = text, ItemName = text, IsLeaf = logical],
        {
            {"Objects", "objects", Objects, "Table", "Table", true},
            {"Property Paths", "paths", Paths, "Table", "Table", true}
        }
    ),
    OldShapeResult = try Table.RowCount(
        Speckle.AddProperties(
            NavigationShapedSource, PropertyValues, Paths, ObjectTypes, TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    OldShapeError = if not OldShapeResult[HasError] then
        [Reason = null, ShowsCallShape = false]
    else
        [
            Reason = try OldShapeResult[Error][Reason] otherwise null,
            ShowsCallShape = try Text.Contains(
                OldShapeResult[Error][Message],
                "pass the five star-schema tables"
            ) otherwise false
        ],
    OldShapeEmptyResult = try Table.RowCount(
        Speckle.AddProperties(
            NavigationShapedSource, PropertyValues, Paths, ObjectTypes, TypeProperties, {}
        )
    ),
    OldShapeEmptyReason = if not OldShapeEmptyResult[HasError] then
        null
    else
        try OldShapeEmptyResult[Error][Reason] otherwise null,

    // per-table required-column validation
    MissingColumnsError = (result as record) as record =>
        if not result[HasError] then
            [Reason = null, Parameter = null, MissingColumns = {}]
        else
            [
                Reason = try result[Error][Reason] otherwise null,
                Parameter = try result[Error][Detail][Parameter] otherwise null,
                MissingColumns = try result[Error][Detail][MissingColumns] otherwise {}
            ],
    MissingObjectsColumnsResult = try Table.RowCount(
        Speckle.AddProperties(
            Table.SelectColumns(Objects, {"Application ID"}),
            PropertyValues, Paths, ObjectTypes, TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    MissingPropertyValuesColumnsResult = try Table.RowCount(
        Speckle.AddProperties(
            Objects,
            Table.SelectColumns(PropertyValues, {"Object Key"}),
            Paths, ObjectTypes, TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    MissingPathsColumnsResult = try Table.RowCount(
        Speckle.AddProperties(
            Objects, PropertyValues,
            Table.SelectColumns(Paths, {"path_key"}),
            ObjectTypes, TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    MissingObjectTypesColumnsResult = try Table.RowCount(
        Speckle.AddProperties(
            Objects, PropertyValues, Paths,
            Table.SelectColumns(ObjectTypes, {"Object Key"}),
            TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    MissingTypePropertiesColumnsResult = try Table.RowCount(
        Speckle.AddProperties(
            Objects, PropertyValues, Paths, ObjectTypes,
            Table.SelectColumns(TypeProperties, {"type_key", "path_key"}),
            {"properties.Dimensions.Area"}
        )
    ),

    // users pass transformed tables: extra columns are tolerated everywhere
    ExtraColumnsResult = Speckle.AddProperties(
        Objects,
        Table.AddColumn(PropertyValues, "Source Model", each "extra"),
        Table.AddColumn(Paths, "Notes", each "extra"),
        Table.AddColumn(ObjectTypes, "Extra", each 1),
        Table.AddColumn(TypeProperties, "Extra", each 1),
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        }
    ),
    // joins restrict silently: a filtered Objects subset restricts the rows
    // while the column set still derives from the unfiltered surviving facts
    FilteredObjectsResult = Speckle.AddProperties(
        Table.SelectRows(Objects, each [Object Key] <= 2),
        PropertyValues, Paths, ObjectTypes, TypeProperties,
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        }
    ),
    // filtering a fact table changes provenance: a path whose type facts are
    // filtered away becomes factless and emits an unprefixed all-null column
    FilteredFactsResult = Speckle.AddProperties(
        Objects, PropertyValues, Paths, ObjectTypes,
        Table.SelectRows(TypeProperties, each [path_key] <> 13),
        {"properties.Dimensions.Area", "properties.Material.TypeName"}
    ),
    // empty typed fact tables are valid inputs (typeless bundles ship them)
    EmptyFactsResult = Speckle.AddProperties(
        Objects,
        #table(type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any], {}),
        Paths,
        #table(type table [#"Object Key" = Int64.Type, type_key = Int64.Type], {}),
        #table(type table [type_key = Int64.Type, path_key = Int64.Type, Value = any], {}),
        {"properties.Dimensions.Area"}
    ),

    UnknownAndCaseResult = Call({"PROPERTIES.Dimensions.Area", "properties.Unknown.Value"}),
    // a clash that survives at full depth no longer fails: the new column
    // takes a numeric suffix, counting up past occupied names
    CollisionSuffixResult = Call({"Object Key"}),
    SuffixIncrementResult = Speckle.AddProperties(
        Table.AddColumn(Objects, "Object Key.1", each "occupied"),
        PropertyValues, Paths, ObjectTypes, TypeProperties,
        {"Object Key"}
    ),
    // an extra column occupying a fact-backed path's full name: the suffixed
    // pair still carries the property values, and both variants suffix
    // together so the Area/Type_Area pair stays aligned
    OccupiedFullPathResult = Speckle.AddProperties(
        Table.AddColumn(Objects, "properties.Dimensions.Area", each "occupied"),
        PropertyValues, Paths, ObjectTypes, TypeProperties,
        {"properties.Dimensions.Area"},
        true
    ),
    // the retired snake_case spelling is no longer a fixed column, so it must
    // NOT collide — it emits an ordinary (all-null, factless) property column
    SnakeCaseResult = Call({"object_key"}),

    FullPathResult = Call(
        {
            "properties.Dimensions.Area",
            "properties.Material.TypeName",
            "properties.Instance.Mark"
        },
        true
    ),
    ExplicitFalseResult = Call({"properties.Dimensions.Area"}, false),
    ExplicitNullResult = Call({"properties.Dimensions.Area"}, null),
    InvalidUseFullPathsResult = try Table.RowCount(Call({"properties.Dimensions.Area"}, "Full path")),
    EmptyFullPathResult = Speckle.AddProperties(
        Objects, UnreadPropertyValues, UnreadPaths, UnreadObjectTypes, UnreadTypeProperties,
        {}, true
    ),
    FullPathBaseCollisionResult = Call({"Object Key"}, true),
    // the literal path resolves to exactly the first path's Type_ variant;
    // neither name can grow at full depth, so the later claimant suffixes
    FullPathPrefixCollisionResult = Call(
        {"properties.Dimensions.Area", "Type_properties.Dimensions.Area"}, true
    ),

    DuplicateObjectTypes = #table(
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {1, 100}, {2, 100}, {2, 101}, {3, 101}, {99, 100}, {99, 101}}
    ),
    DuplicateObjectTypesResult = try Table.RowCount(
        Speckle.AddProperties(
            Objects, PropertyValues, Paths, DuplicateObjectTypes, TypeProperties,
            {"properties.Dimensions.Area"}
        )
    ),
    DuplicateObjectTypesError = if not DuplicateObjectTypesResult[HasError] then
        [Reason = null, ObjectKeys = {}]
    else
        [
            Reason = try DuplicateObjectTypesResult[Error][Reason] otherwise null,
            ObjectKeys = try DuplicateObjectTypesResult[Error][Detail][ObjectKeys] otherwise {}
        ],
    DuplicateObjectTypesUnknownPathResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(
            Objects, PropertyValues, Paths, DuplicateObjectTypes, TypeProperties,
            {"properties.Unknown.Value"}
        )
    ))),
    DuplicateObjectTypesUnknownPathReason = if not DuplicateObjectTypesUnknownPathResult[HasError] then
        null
    else
        try DuplicateObjectTypesUnknownPathResult[Error][Reason] otherwise null,

    FederatedObjects = #table(
        type table [#"Object Key" = Int64.Type, #"Application ID" = text],
        {{1, "model-a"}, {4294967297, "model-b"}}
    ),
    FederatedPropertyValues = #table(
        type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "first-instance"}}
    ),
    FederatedObjectTypes = #table(
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type],
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
    FederatedResult = Speckle.AddProperties(
        FederatedObjects, FederatedPropertyValues, FederatedPaths,
        FederatedObjectTypes, FederatedTypeProperties,
        {"properties.Identity.Name"}
    ),

    DuplicateInstanceResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(
            #table(type table [#"Object Key" = Int64.Type], {{1}}),
            #table(
                type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any],
                {{1, 10, "first"}, {1, 10, "second"}}
            ),
            Paths,
            #table(type table [#"Object Key" = Int64.Type, type_key = Int64.Type], {}),
            #table(type table [type_key = Int64.Type, path_key = Int64.Type, Value = any], {}),
            {"properties.Dimensions.Area"}
        )
    ))),
    DuplicateTypeResult = try Text.FromBinary(Json.FromValue(Table.ToRows(
        Speckle.AddProperties(
            #table(type table [#"Object Key" = Int64.Type], {{3}}),
            #table(type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any], {}),
            Paths,
            #table(type table [#"Object Key" = Int64.Type, type_key = Int64.Type], {{3, 101}}),
            #table(
                type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
                {{101, 11, "first"}, {101, 11, "second"}}
            ),
            {"properties.Quantities.Area"}
        )
    ))),

    facts = {
        Fact(
            "split columns stay adjacent per path, and a type-only path emits only its prefixed column",
            {"Object Key", "Application ID", "Area", "Type_Area", "Type_TypeName", "Mark"},
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
            [Area = Result{[#"Object Key" = 2]}[Area], Type_Area = Result{[#"Object Key" = 2]}[Type_Area]]
        ),
        Fact(
            "raw Value columns are used for both instance and type facts",
            {"instance-area", "type-only", "instance-only"},
            {
                Result{[#"Object Key" = 1]}[Area],
                Result{[#"Object Key" = 1]}[Type_TypeName],
                Result{[#"Object Key" = 4]}[Mark]
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
            "an empty normalized path list returns the exact Objects value without reading the other tables' rows",
            [
                Columns = {"Object Key", "Application ID"},
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
            {"Object Key", "Application ID", "Area", "Type_Area"},
            Table.ColumnNames(NormalizedResult)
        ),
        Fact(
            "shortest unique suffixes extend leftward over the emitted names and preserve requested order",
            {
                "Object Key",
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
            {"Object Key", "Application ID", "Area", "Type_Area"},
            Table.ColumnNames(NoCrossPrefixCollisionResult)
        ),
        Fact(
            "a genuine path resolving to a literal Type_ name collides with a prefixed name and grows",
            {"Object Key", "Application ID", "Dimensions.Area", "Type_Dimensions.Area", "Odd.Type_Area"},
            Table.ColumnNames(LiteralPrefixCollisionResult)
        ),
        Fact(
            "a complete shorter path stays fixed while an ambiguous longer path extends leftward",
            {"Object Key", "Application ID", "Area", "properties.Area"},
            Table.ColumnNames(SuffixNamingResult)
        ),
        Fact(
            "invalid path items report every one-based position under the new namespace",
            [Reason = "Speckle.AddProperties.InvalidPropertyPaths", Positions = {1, 2, 3}],
            InvalidPathError
        ),
        Fact(
            "passing the navigation table as objects raises the dedicated signature-changed error",
            [Reason = "Speckle.AddProperties.SignatureChanged", ShowsCallShape = true],
            OldShapeError
        ),
        Fact(
            "old-shape detection fires even with an empty selection",
            "Speckle.AddProperties.SignatureChanged",
            OldShapeEmptyReason
        ),
        Fact(
            "objects without Object Key raises the structured missing-columns error",
            [
                Reason = "Speckle.AddProperties.MissingColumns",
                Parameter = "objects",
                MissingColumns = {"Object Key"}
            ],
            MissingColumnsError(MissingObjectsColumnsResult)
        ),
        Fact(
            "propertyValues without its key and value columns raises the structured missing-columns error",
            [
                Reason = "Speckle.AddProperties.MissingColumns",
                Parameter = "propertyValues",
                MissingColumns = {"path_key", "Value"}
            ],
            MissingColumnsError(MissingPropertyValuesColumnsResult)
        ),
        Fact(
            "paths without Property raises the structured missing-columns error",
            [
                Reason = "Speckle.AddProperties.MissingColumns",
                Parameter = "paths",
                MissingColumns = {"Property"}
            ],
            MissingColumnsError(MissingPathsColumnsResult)
        ),
        Fact(
            "objectTypes without type_key raises the structured missing-columns error",
            [
                Reason = "Speckle.AddProperties.MissingColumns",
                Parameter = "objectTypes",
                MissingColumns = {"type_key"}
            ],
            MissingColumnsError(MissingObjectTypesColumnsResult)
        ),
        Fact(
            "typeProperties without Value raises the structured missing-columns error",
            [
                Reason = "Speckle.AddProperties.MissingColumns",
                Parameter = "typeProperties",
                MissingColumns = {"Value"}
            ],
            MissingColumnsError(MissingTypePropertiesColumnsResult)
        ),
        Fact(
            "extra columns on every table are tolerated and leave the result unchanged",
            [Columns = Table.ColumnNames(Result), Rows = Table.ToRows(Result)],
            [Columns = Table.ColumnNames(ExtraColumnsResult), Rows = Table.ToRows(ExtraColumnsResult)]
        ),
        Fact(
            "a filtered Objects subset restricts the rows while the column set derives from the unfiltered facts",
            [
                Columns = {"Object Key", "Application ID", "Area", "Type_Area", "Type_TypeName", "Mark"},
                Rows = {
                    {1, "one", "instance-area", "type-area", "type-only", null},
                    {2, "two", null, "type-area", "type-only", null}
                }
            ],
            [
                Columns = Table.ColumnNames(FilteredObjectsResult),
                Rows = Table.ToRows(FilteredObjectsResult)
            ]
        ),
        Fact(
            "a path whose type facts are filtered away becomes factless and emits an unprefixed all-null column",
            [
                Columns = {"Object Key", "Application ID", "Area", "Type_Area", "TypeName"},
                TypeNames = {null, null, null, null}
            ],
            [
                Columns = Table.ColumnNames(FilteredFactsResult),
                TypeNames = Table.Column(FilteredFactsResult, "TypeName")
            ]
        ),
        Fact(
            "empty typed fact tables are valid inputs and yield all-null property columns",
            [
                Columns = {"Object Key", "Application ID", "Area"},
                Areas = {null, null, null, null}
            ],
            [
                Columns = Table.ColumnNames(EmptyFactsResult),
                Areas = Table.Column(EmptyFactsResult, "Area")
            ]
        ),
        Fact(
            "unknown and differently-cased paths append null columns",
            [
                Columns = {"Object Key", "Application ID", "Area", "Value"},
                Values = {{null, null}, {null, null}, {null, null}, {null, null}}
            ],
            [
                Columns = Table.ColumnNames(UnknownAndCaseResult),
                Values = Table.ToRows(Table.SelectColumns(UnknownAndCaseResult, {"Area", "Value"}))
            ]
        ),
        Fact(
            "a full-depth clash with an existing column takes a numeric suffix instead of failing",
            [
                Columns = {"Object Key", "Application ID", "Object Key.1"},
                Values = {null, null, null, null}
            ],
            [
                Columns = Table.ColumnNames(CollisionSuffixResult),
                Values = Table.Column(CollisionSuffixResult, "Object Key.1")
            ]
        ),
        Fact(
            "the numeric suffix counts up past occupied names",
            {"Object Key", "Application ID", "Object Key.1", "Object Key.2"},
            Table.ColumnNames(SuffixIncrementResult)
        ),
        Fact(
            "a suffixed fact-backed path keeps its values and suffixes both sides of the Type_ split together",
            [
                Columns = {
                    "Object Key", "Application ID",
                    "properties.Dimensions.Area",
                    "properties.Dimensions.Area.1",
                    "Type_properties.Dimensions.Area.1"
                },
                Row1 = {1, "one", "occupied", "instance-area", "type-area"}
            ],
            [
                Columns = Table.ColumnNames(OccupiedFullPathResult),
                Row1 = Table.ToRows(OccupiedFullPathResult){0}
            ]
        ),
        Fact(
            "the retired object_key spelling is not a fixed column: it emits an ordinary all-null property column instead of colliding",
            [
                Columns = {"Object Key", "Application ID", "object_key"},
                Values = {null, null, null, null}
            ],
            [
                Columns = Table.ColumnNames(SnakeCaseResult),
                Values = Table.Column(SnakeCaseResult, "object_key")
            ]
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
            "useFullPaths = true names every column with the entire dotted path, keeping the Type_ split",
            {
                "Object Key",
                "Application ID",
                "properties.Dimensions.Area",
                "Type_properties.Dimensions.Area",
                "Type_properties.Material.TypeName",
                "properties.Instance.Mark"
            },
            Table.ColumnNames(FullPathResult)
        ),
        Fact(
            "useFullPaths renames columns only — cell values match the shortest-name result",
            Table.ToRows(Result),
            Table.ToRows(FullPathResult)
        ),
        Fact(
            "an explicit false and an explicit null both keep the default shortest naming",
            [
                ExplicitFalse = {"Object Key", "Application ID", "Area", "Type_Area"},
                ExplicitNull = {"Object Key", "Application ID", "Area", "Type_Area"}
            ],
            [
                ExplicitFalse = Table.ColumnNames(ExplicitFalseResult),
                ExplicitNull = Table.ColumnNames(ExplicitNullResult)
            ]
        ),
        Fact(
            "a non-logical useFullPaths value is rejected by the parameter type",
            true,
            InvalidUseFullPathsResult[HasError]
        ),
        Fact(
            "useFullPaths = true with an empty selection still returns the exact Objects value",
            [Columns = {"Object Key", "Application ID"}, Marker = "original Objects"],
            [
                Columns = Table.ColumnNames(EmptyFullPathResult),
                Marker = try Value.Metadata(EmptyFullPathResult)[TestMarker] otherwise null
            ]
        ),
        Fact(
            "a full-path collision with an Objects column cannot grow and takes a numeric suffix",
            {"Object Key", "Application ID", "Object Key.1"},
            Table.ColumnNames(FullPathBaseCollisionResult)
        ),
        Fact(
            "a full-path collision between a Type_ variant and a literal Type_ path suffixes the later claimant",
            {
                "Object Key",
                "Application ID",
                "properties.Dimensions.Area",
                "Type_properties.Dimensions.Area",
                "Type_properties.Dimensions.Area.1"
            },
            Table.ColumnNames(FullPathPrefixCollisionResult)
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
