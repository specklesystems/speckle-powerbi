// Offline contract tests for BuildNavigation.pqm — the composition seam that
// assembles the public Speckle.GetTables navigator: the existing five keyed
// property helper rows and Properties function plus the Relations function
// and three raw graph tables. Deep enrichment semantics
// (suffix naming, source splits, strict failures) stay covered by
// AddProperties.query.pq; this suite covers the six-row layout, the
// Table layout option (Simplified default hides the supporting rows,
// All tables shows every row, invalid values raise a structured error), the
// model-bound function's type/documentation contract — two optional
// parameters, the nullable-list selection and the nullable-logical
// UseFullPaths naming toggle — selection normalization and ordering, the lean
// relationship-ready result shape (Object Key + selected property columns,
// every Objects row retained), and laziness of the fact tables.
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
    Deps = [
        NavigationTable = NavigationTable,
        AddProperties = Speckle.AddProperties,
        AddRelations = Speckle.AddRelations,
        RelationCatalog = Speckle.LoadFunction("RelationCatalog.pqm")()
    ],

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
    Relations = #table(
        type table [
            #"Relation Type" = nullable text,
            rel = Int64.Type,
            src = Int64.Type,
            dst = Int64.Type,
            ord = nullable number
        ],
        {
            {"ON_LEVEL", 7, 1, 1000, null},
            {"CONNECTS_TO", 20, 1, 2, 1},
            {"OBJECT_HAS_MATERIAL", 12, 1, 3000, null},
            {"ON_LEVEL", 7, 4294967297, 4294968296, null}
        }
    ),
    RelationTypes = #table(
        type table [rel = Int64.Type, name = text, src_ns = text, dst_ns = text],
        {
            {7, "ON_LEVEL", "object", "node"},
            {12, "OBJECT_HAS_MATERIAL", "object", "node"},
            {21, "IN_ROOM", "object", "node"},
            {20, "CONNECTS_TO", "object", "object"}
        }
    ),
    Nodes = #table(
        type table [#"Node Key" = Int64.Type, Name = nullable text],
        {{1000, "Level 1"}, {4294968296, "Federated Level"}}
    ),
    SourceTables = [
        Objects = Objects,
        Properties = Properties,
        Paths = Paths,
        ObjectTypes = ObjectTypes,
        TypeProperties = TypeProperties,
        Relations = Relations,
        RelationTypes = RelationTypes,
        Nodes = Nodes
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
    UseFullPathsParamType = Type.FunctionParameters(FnType)[UseFullPaths],
    UseFullPathsParamMeta = Value.Metadata(UseFullPathsParamType),
    Catalogue = {
        "properties.Dimensions.Area",
        "properties.Material.Name",
        "properties.Instance.Mark",
        "properties.Unused.Slot"
    },
    RelationsFunctionRow = Nav{[Key = "expand-relations"]},
    RelationsFn = RelationsFunctionRow[Data],
    RelationsFnType = Value.Type(RelationsFn),
    RelationsParamType = Type.FunctionParameters(RelationsFnType)[Relations],
    RelationsParamMeta = Value.Metadata(RelationsParamType),

    // laziness rig: building the navigator and empty invocations must never
    // read the property fact tables' rows (Paths, the small dimension, is
    // real — it feeds AllowedValues). The bound function's typed table
    // parameters force each argument to a table value, so the fixtures are
    // lazy views whose row enumeration errors rather than scalar errors.
    UnreadTable = (message as text, tableType as type) as table =>
        Table.View(null, [GetType = () => tableType, GetRows = () => error message]),
    LazyTables = [
        Objects = Objects,
        Properties = UnreadTable(
            "Properties must not be read",
            type table [#"Object Key" = Int64.Type, path_key = Int64.Type, Value = any]
        ),
        Paths = Paths,
        ObjectTypes = UnreadTable(
            "Object Types must not be read",
            type table [#"Object Key" = Int64.Type, type_key = Int64.Type]
        ),
        TypeProperties = UnreadTable(
            "Type Properties must not be read",
            type table [type_key = Int64.Type, path_key = Int64.Type, Value = any]
        ),
        Relations = UnreadTable(
            "Relations must not be read",
            type table [#"Relation Type" = nullable text, rel = Int64.Type, src = Int64.Type, dst = Int64.Type, ord = nullable number]
        ),
        RelationTypes = RelationTypes,
        Nodes = UnreadTable(
            "Nodes must not be read",
            type table [#"Node Key" = Int64.Type, Name = nullable text]
        )
    ],
    LazyNav = BuildNavigation(Deps, LazyTables),
    LazyAllTablesNav = BuildNavigation(Deps, LazyTables, "All tables"),
    LazyFn = LazyNav{[Key = "expand-properties"]}[Data],
    LazyRelationsFn = LazyNav{[Key = "expand-relations"]}[Data],
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
    // against the lean base; an unknown path named Object Key clashes at
    // full depth and takes a numeric suffix instead of failing
    RemovedColumnResult = ExpandFn({"Application ID"}),
    CollisionSuffixResult = ExpandFn({"Object Key"}),
    // column naming through the closure: UseFullPaths = true names columns
    // with entire dotted paths; the parameter type rejects non-logical values
    // before the fact tables are ever read
    FullPathResult = ExpandFn({"properties.Dimensions.Area"}, true),
    ExplicitFalseResult = ExpandFn({"properties.Instance.Mark"}, false),
    LazyFullPathEmptyResult = LazyFn({}, true),
    LazyInvalidUseFullPathsResult = try Table.RowCount(LazyFn({}, "Longest")),
    RelationResult = RelationsFn({"CONNECTS_TO", "ON_LEVEL"}),
    LazyRelationsResult = LazyRelationsFn({}),
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
            "the ten rows preserve the existing six keys and append relation entries",
            {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties", "expand-relations", "relations", "relation-types", "nodes"},
            Table.Column(Nav, "Key")
        ),
        Fact(
            "row names follow the settled order",
            {"Objects", "Property Values", "Property Paths", "Object Types", "Type Properties", "Properties", "Relations", "Relations", "Relation Types", "Nodes"},
            Table.Column(Nav, "Name")
        ),
        Fact(
            "keys are unique",
            10,
            List.Count(List.Distinct(Table.Column(Nav, "Key"), Comparer.Ordinal))
        ),
        Fact(
            "hidden flags leave Objects and both picker functions visible",
            {false, true, true, true, true, false, false, true, true, true},
            Table.Column(Nav, "Hidden")
        ),
        Fact(
            "visible entries appear as Objects, Properties and Relations",
            {"Objects", "Properties", "Relations"},
            Table.Column(Table.SelectRows(Nav, each not [Hidden]), "Name")
        ),

        // -- Table layout option ------------------------------------------------
        Fact(
            "an explicit Simplified layout matches the default hidden flags",
            {false, true, true, true, true, false, false, true, true, true},
            Table.Column(SimplifiedNav, "Hidden")
        ),
        Fact(
            "the All tables layout shows every row",
            {false, false, false, false, false, false, false, false, false, false},
            Table.Column(AllTablesNav, "Hidden")
        ),
        Fact(
            "the All tables layout keeps the settled keys and names",
            [
                Keys = {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties", "expand-relations", "relations", "relation-types", "nodes"},
                Names = {"Objects", "Property Values", "Property Paths", "Object Types", "Type Properties", "Properties", "Relations", "Relations", "Relation Types", "Nodes"}
            ],
            [
                Keys = Table.Column(AllTablesNav, "Key"),
                Names = Table.Column(AllTablesNav, "Name")
            ]
        ),
        Fact(
            "the layout value matches case-insensitively",
            {false, false, false, false, false, false, false, false, false, false},
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
            {false, false, false, false, false, false, false, false, false, false},
            Table.Column(LazyAllTablesNav, "Hidden")
        ),
        Fact(
            "every row is a leaf",
            {true, true, true, true, true, true, true, true, true, true},
            Table.Column(Nav, "IsLeaf")
        ),
        Fact(
            "table rows keep ItemKind Table and the function row uses Function for both ItemKind and ItemName",
            {"Table", "Table", "Table", "Table", "Table", "Function", "Function", "Table", "Table", "Table"},
            Table.Column(Nav, "ItemKind")
        ),
        Fact(
            "the Properties function row's ItemName is Function",
            "Function",
            FunctionRow[ItemName]
        ),
        Fact(
            "the Relations function row uses Function for ItemName",
            "Function",
            RelationsFunctionRow[ItemName]
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
            "the machine parameter names are Properties and UseFullPaths",
            {"Properties", "UseFullPaths"},
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
            "the UseFullPaths parameter is nullable logical",
            [IsLogical = true, IsNullable = true],
            [
                IsLogical = Type.Is(UseFullPathsParamType, type nullable logical),
                IsNullable = Type.IsNullable(UseFullPathsParamType)
            ]
        ),
        Fact(
            "the UseFullPaths caption omits the (optional) suffix the parameter dialog adds itself",
            "Use full paths",
            UseFullPathsParamMeta[Documentation.FieldCaption]
        ),
        Fact(
            "UseFullPaths carries no AllowedValues so it renders as a true/false picker, not a dropdown",
            false,
            Record.HasFields(UseFullPathsParamMeta, "Documentation.AllowedValues")
        ),
        Fact(
            "the UseFullPaths description leads with the default",
            true,
            Text.StartsWith(
                UseFullPathsParamMeta[Documentation.FieldDescription],
                "Default: false."
            )
        ),
        Fact(
            "the Relations function has one optional nullable-list parameter",
            [Names = {"Relations"}, Required = 0, IsNullableList = true],
            [
                Names = Record.FieldNames(Type.FunctionParameters(RelationsFnType)),
                Required = Type.FunctionRequiredParameters(RelationsFnType),
                IsNullableList = Type.Is(RelationsParamType, type nullable list)
            ]
        ),
        Fact(
            "Relations AllowedValues keep catalog order, require a present edge and enforce the allow-list",
            {"ON_LEVEL", "CONNECTS_TO"},
            RelationsParamMeta[Documentation.AllowedValues]
        ),
        Fact(
            "the relation picker excludes OBJECT_HAS_MATERIAL and an allow-listed type without edges",
            false,
            List.Contains(RelationsParamMeta[Documentation.AllowedValues], "OBJECT_HAS_MATERIAL")
                or List.Contains(RelationsParamMeta[Documentation.AllowedValues], "IN_ROOM")
        ),
        Fact(
            "the function documentation name is Relations",
            "Relations",
            Value.Metadata(RelationsFnType)[Documentation.Name]
        ),

        // -- empty selections and laziness ------------------------------------
        Fact(
            "building the navigator does not force the fact tables",
            {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties", "expand-relations", "relations", "relation-types", "nodes"},
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
            "an empty selection with UseFullPaths = true returns the base without reading facts",
            ExpectedBase,
            Shape(LazyFullPathEmptyResult)
        ),
        Fact(
            "an empty Relations selection returns the lean base without reading envelope facts",
            ExpectedBase,
            Shape(LazyRelationsResult)
        ),
        Fact(
            "a non-logical UseFullPaths is rejected by the parameter type without reading facts",
            true,
            LazyInvalidUseFullPathsResult[HasError]
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
            "a UseFullPaths = true selection names columns with entire dotted paths over the lean base",
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
            "an explicit UseFullPaths = false keeps the default shortest naming through the closure",
            {"Object Key", "Mark"},
            Table.ColumnNames(ExplicitFalseResult)
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
            "a full-depth clash with Object Key takes a numeric suffix over the lean base",
            [
                Columns = {"Object Key", "Object Key.1"},
                Values = {null, null, null}
            ],
            [
                Columns = Table.ColumnNames(CollisionSuffixResult),
                Values = Table.Column(CollisionSuffixResult, "Object Key.1")
            ]
        ),
        Fact(
            "blank or non-text entries raise the structured invalid-path error with caller positions",
            [Reason = "Speckle.AddProperties.InvalidPropertyPaths", Positions = {1, 2}],
            InvalidError
        ),
        Fact(
            "the Relations function returns a lean catalog-ordered result across namespaces",
            [
                Columns = {"Object Key", "ON_LEVEL", "CONNECTS_TO"},
                Rows = {
                    {1, "Level 1", "2"},
                    {2, null, null},
                    {4294967297, "Federated Level", null}
                }
            ],
            [
                Columns = Table.ColumnNames(RelationResult),
                Rows = Table.ToRows(RelationResult)
            ]
        )
    }
in
    Summarize(facts)
