// Offline contract tests for BuildNavigation.pqm — the composition seam that
// assembles the public Speckle.GetTables navigator: the five keyed helper rows
// plus the visible Properties function row. Deep enrichment semantics
// (suffix naming, source splits, strict failures) stay covered by
// AddProperties.query.pq; this suite covers the six-row layout, the
// Table layout option (Simplified default hides the supporting rows,
// All tables shows every row, invalid values raise a structured error), the
// model-bound function's type/documentation contract, selection
// normalization and ordering, the lean relationship-ready result shape
// (Object Key + selected property columns, every Objects row retained),
// and laziness of the fact tables.
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

    // BuildNavigation is not exported; load it (and the NavigationTable it
    // composes with) the same way GetTables.pqm does
    BuildNavigation = Speckle.LoadFunction("BuildNavigation.pqm"),
    NavigationTable = Speckle.LoadFunction("NavigationTable.pqm"),
    Deps = [NavigationTable = NavigationTable, AddProperties = Speckle.AddProperties],

    Objects = #table(
        type table [#"Object Key" = Int64.Type, #"Application ID" = text],
        {{1, "one"}, {2, "two"}, {4294967297, "fed"}}
    ),
    Properties = #table(
        type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "instance-area"}, {2, 12, "instance-mark"}}
    ),
    ObjectTypes = #table(
        type table [#"Object Key" = Int64.Type, type_key = Int64.Type],
        {{1, 100}, {2, 100}, {4294967297, 4294967396}}
    ),
    TypeProperties = #table(
        type table [type_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{100, 10, "type-area"}, {100, 11, "type-name"}, {4294967396, 4294967306, "fed-type-name"}}
    ),
    // path 11 and its federated twin 4294967306 carry identical Property text
    // (the selector must list it once and apply it across sources); path 13
    // has no facts on either side
    Paths = #table(
        type table [path_key = Int64.Type, Property = text],
        {
            {10, "properties.Dimensions.Area"},
            {11, "properties.Material.Name"},
            {12, "properties.Instance.Mark"},
            {13, "properties.Unused.Slot"},
            {4294967306, "properties.Material.Name"}
        }
    ),
    SourceTables = [
        Objects = Objects,
        Properties = Properties,
        Paths = Paths,
        ObjectTypes = ObjectTypes,
        TypeProperties = TypeProperties
    ],
    Nav = BuildNavigation(Deps, SourceTables),
    SimplifiedNav = BuildNavigation(Deps, SourceTables, "Simplified"),
    AllTablesNav = BuildNavigation(Deps, SourceTables, "All tables"),
    CaseInsensitiveLayoutNav = BuildNavigation(Deps, SourceTables, "all TABLES"),
    // List.AnyTrue forces the lazy Hidden cells so the validation error
    // surfaces inside the try (Table.Column alone returns an unevaluated list)
    InvalidLayoutResult = try List.AnyTrue(Table.Column(BuildNavigation(Deps, SourceTables, "Everything"), "Hidden")),
    InvalidLayoutError = if not InvalidLayoutResult[HasError] then
        [Reason = null, AllowedValues = {}]
    else
        [
            Reason = try InvalidLayoutResult[Error][Reason] otherwise null,
            AllowedValues = try InvalidLayoutResult[Error][Detail][AllowedValues] otherwise {}
        ],
    NavType = Value.Type(Nav),
    NavMeta = Value.Metadata(NavType),
    FunctionRow = Nav{[Key = "expand-properties"]},
    ExpandFn = FunctionRow[Data],
    FnType = Value.Type(ExpandFn),
    ParamType = Type.FunctionParameters(FnType)[Properties],
    ParamMeta = Value.Metadata(ParamType),
    ColumnNamesParamType = Type.FunctionParameters(FnType)[ColumnNames],
    ColumnNamesParamMeta = Value.Metadata(ColumnNamesParamType),
    Catalogue = {
        "properties.Dimensions.Area",
        "properties.Material.Name",
        "properties.Instance.Mark",
        "properties.Unused.Slot"
    },

    // laziness rig: building the navigator and empty invocations must never
    // force the property fact tables (Paths, the small dimension, is real —
    // it feeds AllowedValues)
    LazyTables = [
        Objects = Objects,
        Properties = error "Properties must not be read",
        Paths = Paths,
        ObjectTypes = error "Object Types must not be read",
        TypeProperties = error "Type Properties must not be read"
    ],
    LazyNav = BuildNavigation(Deps, LazyTables),
    LazyAllTablesNav = BuildNavigation(Deps, LazyTables, "All tables"),
    LazyFn = LazyNav{[Key = "expand-properties"]}[Data],
    Shape = (t as table) as record => [
        Columns = Table.ColumnNames(t),
        Rows = Table.ToRows(t),
        KeyType = Table.Schema(t){[Name = "Object Key"]}[TypeName]
    ],
    // the lean base: Object Key only, every Objects row in Objects order,
    // key type preserved — never the other Objects columns
    ExpectedBase = [
        Columns = {"Object Key"},
        Rows = {{1}, {2}, {4294967297}},
        KeyType = "Int64.Type"
    ],

    // caller order (Mark before Area) must not survive: known selections
    // follow the Property Paths catalogue order, unknown paths trail behind
    OrderingResult = ExpandFn({"properties.Instance.Mark", "properties.Dimensions.Area", "zz.unknown"}),
    TrimDedupResult = ExpandFn({" properties.Instance.Mark ", "properties.Instance.Mark"}),
    FederatedResult = ExpandFn({"properties.Material.Name"}),
    // Select All is exactly "invoke with every AllowedValues entry" — no cap
    SelectAllResult = ExpandFn(ParamMeta[Documentation.AllowedValues]),
    // an unknown path named after a removed Objects column must not collide
    // against the lean base; an unknown path named Object Key cannot be made
    // unique and must keep the structured collision error
    RemovedColumnResult = ExpandFn({"Application ID"}),
    CollisionResult = try Table.RowCount(ExpandFn({"Object Key"})),
    CollisionError = if not CollisionResult[HasError] then
        [Reason = null, ExistingColumns = {}]
    else
        [
            Reason = try CollisionResult[Error][Reason] otherwise null,
            ExistingColumns = try CollisionResult[Error][Detail][ExistingColumns] otherwise {}
        ],
    // column naming through the closure: Full path names columns with entire
    // dotted paths, matching case-insensitively; validation stays in
    // AddProperties and must fire without reading the fact tables
    FullPathResult = ExpandFn({"properties.Dimensions.Area"}, "Full path"),
    CaseInsensitiveFullPathResult = ExpandFn({"properties.Instance.Mark"}, "full path"),
    LazyFullPathEmptyResult = LazyFn({}, "Full path"),
    LazyInvalidColumnNamesResult = try Table.RowCount(LazyFn({}, "Longest")),
    LazyInvalidColumnNamesReason = if not LazyInvalidColumnNamesResult[HasError] then
        null
    else
        try LazyInvalidColumnNamesResult[Error][Reason] otherwise null,
    InvalidResult = try ExpandFn({"   ", 5, "properties.Instance.Mark"}),
    InvalidError = if not InvalidResult[HasError] then
        [Reason = null, Positions = {}]
    else
        [
            Reason = try InvalidResult[Error][Reason] otherwise null,
            Positions = try InvalidResult[Error][Detail][Positions] otherwise {}
        ],

    facts = {
        // -- navigator layout -------------------------------------------------
        Fact(
            "the six rows keep the five helper keys and append expand-properties",
            {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties"},
            Table.Column(Nav, "Key")
        ),
        Fact(
            "row names follow the settled order",
            {"Objects", "Property Values", "Property Paths", "Object Types", "Type Properties", "Properties"},
            Table.Column(Nav, "Name")
        ),
        Fact(
            "keys are unique",
            6,
            List.Count(List.Distinct(Table.Column(Nav, "Key"), Comparer.Ordinal))
        ),
        Fact(
            "hidden flags leave exactly Objects and Properties visible",
            {false, true, true, true, true, false},
            Table.Column(Nav, "Hidden")
        ),
        Fact(
            "visible entries appear as Objects, Properties",
            {"Objects", "Properties"},
            Table.Column(Table.SelectRows(Nav, each not [Hidden]), "Name")
        ),

        // -- Table layout option ------------------------------------------------
        Fact(
            "an explicit Simplified layout matches the default hidden flags",
            {false, true, true, true, true, false},
            Table.Column(SimplifiedNav, "Hidden")
        ),
        Fact(
            "the All tables layout shows every row",
            {false, false, false, false, false, false},
            Table.Column(AllTablesNav, "Hidden")
        ),
        Fact(
            "the All tables layout keeps the settled keys and names",
            [
                Keys = {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties"},
                Names = {"Objects", "Property Values", "Property Paths", "Object Types", "Type Properties", "Properties"}
            ],
            [
                Keys = Table.Column(AllTablesNav, "Key"),
                Names = Table.Column(AllTablesNav, "Name")
            ]
        ),
        Fact(
            "the layout value matches case-insensitively",
            {false, false, false, false, false, false},
            Table.Column(CaseInsensitiveLayoutNav, "Hidden")
        ),
        Fact(
            "an unknown layout raises the structured error listing the allowed values",
            [
                Reason = "Speckle.GetTables.InvalidTableLayout",
                AllowedValues = {"Simplified", "All tables"}
            ],
            InvalidLayoutError
        ),
        Fact(
            "the All tables layout does not force the fact tables",
            {false, false, false, false, false, false},
            Table.Column(LazyAllTablesNav, "Hidden")
        ),
        Fact(
            "every row is a leaf",
            {true, true, true, true, true, true},
            Table.Column(Nav, "IsLeaf")
        ),
        Fact(
            "table rows keep ItemKind Table and the function row uses Function for both ItemKind and ItemName",
            {"Table", "Table", "Table", "Table", "Table", "Function"},
            Table.Column(Nav, "ItemKind")
        ),
        Fact(
            "the function row's ItemName is Function",
            "Function",
            FunctionRow[ItemName]
        ),
        Fact(
            "the function row holds a function value",
            true,
            Value.Is(ExpandFn, type function)
        ),
        Fact(
            "navigation metadata names all five navigator columns",
            [Name = "Name", Data = "Data", ItemKind = "ItemKind", IsLeaf = "IsLeaf", Hidden = "Hidden"],
            [
                Name = NavMeta[NavigationTable.NameColumn],
                Data = NavMeta[NavigationTable.DataColumn],
                ItemKind = NavMeta[NavigationTable.ItemKindColumn],
                IsLeaf = NavMeta[NavigationTable.IsLeafColumn],
                Hidden = NavMeta[NavigationTable.HiddenColumn]
            ]
        ),
        Fact(
            "the navigation table keeps its primary key on Key",
            [Columns = {"Key"}, Primary = true],
            [
                Columns = Type.TableKeys(NavType){0}[Columns],
                Primary = Type.TableKeys(NavType){0}[Primary]
            ]
        ),

        // -- function type contract -------------------------------------------
        Fact(
            "the function returns a table",
            true,
            Type.Is(Type.FunctionReturn(FnType), type table)
        ),
        Fact(
            "the machine parameter names are Properties and ColumnNames",
            {"Properties", "ColumnNames"},
            Record.FieldNames(Type.FunctionParameters(FnType))
        ),
        Fact(
            "required arity is zero",
            0,
            Type.FunctionRequiredParameters(FnType)
        ),
        Fact(
            "the parameter is a nullable list",
            [IsList = true, IsNullable = true],
            [
                IsList = Type.Is(ParamType, type nullable list),
                IsNullable = Type.IsNullable(ParamType)
            ]
        ),
        Fact(
            "the parameter caption omits the (optional) suffix the parameter dialog adds itself",
            "Properties",
            ParamMeta[Documentation.FieldCaption]
        ),
        Fact(
            "AllowedValues are the Property Paths values deduplicated in catalogue order",
            Catalogue,
            ParamMeta[Documentation.AllowedValues]
        ),
        Fact(
            "the documentation name is Properties",
            "Properties",
            Value.Metadata(FnType)[Documentation.Name]
        ),
        Fact(
            "the parameter description warns about selecting all properties",
            true,
            Text.Contains(
                ParamMeta[Documentation.FieldDescription],
                "significantly increase refresh time and table width"
            )
        ),
        Fact(
            "the ColumnNames parameter is nullable text",
            [IsText = true, IsNullable = true],
            [
                IsText = Type.Is(ColumnNamesParamType, type nullable text),
                IsNullable = Type.IsNullable(ColumnNamesParamType)
            ]
        ),
        Fact(
            "the ColumnNames caption omits the (optional) suffix the parameter dialog adds itself",
            "Column names",
            ColumnNamesParamMeta[Documentation.FieldCaption]
        ),
        Fact(
            "the ColumnNames AllowedValues list the two modes with the Shortest default first",
            {"Shortest", "Full path"},
            ColumnNamesParamMeta[Documentation.AllowedValues]
        ),
        Fact(
            "the ColumnNames description leads with the default",
            true,
            Text.StartsWith(
                ColumnNamesParamMeta[Documentation.FieldDescription],
                "Default: Shortest."
            )
        ),

        // -- empty selections and laziness ------------------------------------
        Fact(
            "building the navigator does not force the fact tables",
            {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties"},
            Table.Column(LazyNav, "Key")
        ),
        Fact(
            "an omitted selection returns the Object Key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn())
        ),
        Fact(
            "a null selection returns the Object Key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn(null))
        ),
        Fact(
            "an empty selection returns the Object Key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn({}))
        ),
        Fact(
            "an empty selection with Full path returns the base without reading facts",
            ExpectedBase,
            Shape(LazyFullPathEmptyResult)
        ),
        Fact(
            "an invalid ColumnNames raises the structured error without reading facts",
            "Speckle.AddProperties.InvalidColumnNames",
            LazyInvalidColumnNamesReason
        ),

        // -- selection behavior through the closure ----------------------------
        Fact(
            "known selections follow catalogue order and unknown paths trail as all-null columns",
            [
                Columns = {"Object Key", "Area", "Type_Area", "Mark", "unknown"},
                Rows = {
                    {1, "instance-area", "type-area", null, null},
                    {2, null, "type-area", "instance-mark", null},
                    {4294967297, null, null, null, null}
                }
            ],
            [
                Columns = Table.ColumnNames(OrderingResult),
                Rows = Table.ToRows(OrderingResult)
            ]
        ),
        Fact(
            "a selected result keeps the Object Key type of the Objects table",
            "Int64.Type",
            Table.Schema(OrderingResult){[Name = "Object Key"]}[TypeName]
        ),
        Fact(
            "selections are trimmed and ordinally deduplicated",
            {"Object Key", "Mark"},
            Table.ColumnNames(TrimDedupResult)
        ),
        Fact(
            "a federated duplicate path is selected once and produces one column across sources",
            [
                Columns = {"Object Key", "Type_Name"},
                Values = {"type-name", "type-name", "fed-type-name"}
            ],
            [
                Columns = Table.ColumnNames(FederatedResult),
                Values = Table.Column(FederatedResult, "Type_Name")
            ]
        ),
        Fact(
            "invoking with every AllowedValues entry emits every property column and preserves all rows",
            [
                Columns = {"Object Key", "Area", "Type_Area", "Type_Name", "Mark", "Slot"},
                Rows = {
                    {1, "instance-area", "type-area", "type-name", null, null},
                    {2, null, "type-area", "type-name", "instance-mark", null},
                    {4294967297, null, null, "fed-type-name", null, null}
                }
            ],
            [
                Columns = Table.ColumnNames(SelectAllResult),
                Rows = Table.ToRows(SelectAllResult)
            ]
        ),
        Fact(
            "a Full path selection names columns with entire dotted paths over the lean base",
            [
                Columns = {"Object Key", "properties.Dimensions.Area", "Type_properties.Dimensions.Area"},
                Rows = {
                    {1, "instance-area", "type-area"},
                    {2, null, "type-area"},
                    {4294967297, null, null}
                }
            ],
            [
                Columns = Table.ColumnNames(FullPathResult),
                Rows = Table.ToRows(FullPathResult)
            ]
        ),
        Fact(
            "the ColumnNames value matches case-insensitively through the closure",
            {"Object Key", "properties.Instance.Mark"},
            Table.ColumnNames(CaseInsensitiveFullPathResult)
        ),
        Fact(
            "a path named after a removed Objects column no longer collides against the lean base",
            [
                Columns = {"Object Key", "Application ID"},
                Values = {null, null, null}
            ],
            [
                Columns = Table.ColumnNames(RemovedColumnResult),
                Values = Table.Column(RemovedColumnResult, "Application ID")
            ]
        ),
        Fact(
            "an unresolvable collision with Object Key keeps the structured collision error over the lean base",
            [
                Reason = "Speckle.AddProperties.NameCollision",
                ExistingColumns = {"Object Key"}
            ],
            CollisionError
        ),
        Fact(
            "blank or non-text entries raise the structured invalid-path error with caller positions",
            [Reason = "Speckle.AddProperties.InvalidPropertyPaths", Positions = {1, 2}],
            InvalidError
        )
    }
in
    Summarize(facts)
