// Offline contract tests for BuildNavigation.pqm — the composition seam that
// assembles the public Speckle.GetTables navigator: the five keyed helper rows
// plus the visible Properties function row. Deep enrichment semantics
// (suffix naming, source splits, strict failures) stay covered by
// AddProperties.query.pq; this suite covers the six-row layout, the
// model-bound function's type/documentation contract, selection
// normalization and ordering, the lean relationship-ready result shape
// (object_key + selected property columns, every Objects row retained),
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
        type table [object_key = Int64.Type, #"Application ID" = text],
        {{1, "one"}, {2, "two"}, {4294967297, "fed"}}
    ),
    Properties = #table(
        type table [object_key = Int64.Type, path_key = Int64.Type, Value = any],
        {{1, 10, "instance-area"}, {2, 12, "instance-mark"}}
    ),
    ObjectTypes = #table(
        type table [object_key = Int64.Type, type_key = Int64.Type],
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
    Nav = BuildNavigation(
        Deps,
        [
            Objects = Objects,
            Properties = Properties,
            Paths = Paths,
            ObjectTypes = ObjectTypes,
            TypeProperties = TypeProperties
        ]
    ),
    NavType = Value.Type(Nav),
    NavMeta = Value.Metadata(NavType),
    FunctionRow = Nav{[Key = "expand-properties"]},
    ExpandFn = FunctionRow[Data],
    FnType = Value.Type(ExpandFn),
    ParamType = Type.FunctionParameters(FnType)[Properties],
    ParamMeta = Value.Metadata(ParamType),
    Catalogue = {
        "properties.Dimensions.Area",
        "properties.Material.Name",
        "properties.Instance.Mark",
        "properties.Unused.Slot"
    },

    // laziness rig: building the navigator and empty invocations must never
    // force the property fact tables (Paths, the small dimension, is real —
    // it feeds AllowedValues)
    LazyNav = BuildNavigation(
        Deps,
        [
            Objects = Objects,
            Properties = error "Properties must not be read",
            Paths = Paths,
            ObjectTypes = error "Object Types must not be read",
            TypeProperties = error "Type Properties must not be read"
        ]
    ),
    LazyFn = LazyNav{[Key = "expand-properties"]}[Data],
    Shape = (t as table) as record => [
        Columns = Table.ColumnNames(t),
        Rows = Table.ToRows(t),
        KeyType = Table.Schema(t){[Name = "object_key"]}[TypeName]
    ],
    // the lean base: object_key only, every Objects row in Objects order,
    // key type preserved — never the other Objects columns
    ExpectedBase = [
        Columns = {"object_key"},
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
    // against the lean base; an unknown path named object_key cannot be made
    // unique and must keep the structured collision error
    RemovedColumnResult = ExpandFn({"Application ID"}),
    CollisionResult = try Table.RowCount(ExpandFn({"object_key"})),
    CollisionError = if not CollisionResult[HasError] then
        [Reason = null, ExistingColumns = {}]
    else
        [
            Reason = try CollisionResult[Error][Reason] otherwise null,
            ExistingColumns = try CollisionResult[Error][Detail][ExistingColumns] otherwise {}
        ],
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
            {"Objects", "Properties", "Property Paths", "Object Types", "Type Properties", "Properties"},
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
            "the single parameter's machine name is Properties",
            {"Properties"},
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
            "the parameter caption marks it optional",
            "Properties (optional)",
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

        // -- empty selections and laziness ------------------------------------
        Fact(
            "building the navigator does not force the fact tables",
            {"objects", "properties", "paths", "object-types", "type-properties", "expand-properties"},
            Table.Column(LazyNav, "Key")
        ),
        Fact(
            "an omitted selection returns the object_key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn())
        ),
        Fact(
            "a null selection returns the object_key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn(null))
        ),
        Fact(
            "an empty selection returns the object_key-only base without reading facts",
            ExpectedBase,
            Shape(LazyFn({}))
        ),

        // -- selection behavior through the closure ----------------------------
        Fact(
            "known selections follow catalogue order and unknown paths trail as all-null columns",
            [
                Columns = {"object_key", "Area", "Type_Area", "Mark", "unknown"},
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
            "a selected result keeps the object_key type of the Objects table",
            "Int64.Type",
            Table.Schema(OrderingResult){[Name = "object_key"]}[TypeName]
        ),
        Fact(
            "selections are trimmed and ordinally deduplicated",
            {"object_key", "Mark"},
            Table.ColumnNames(TrimDedupResult)
        ),
        Fact(
            "a federated duplicate path is selected once and produces one column across sources",
            [
                Columns = {"object_key", "Type_Name"},
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
                Columns = {"object_key", "Area", "Type_Area", "Type_Name", "Mark", "Slot"},
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
            "a path named after a removed Objects column no longer collides against the lean base",
            [
                Columns = {"object_key", "Application ID"},
                Values = {null, null, null}
            ],
            [
                Columns = Table.ColumnNames(RemovedColumnResult),
                Values = Table.Column(RemovedColumnResult, "Application ID")
            ]
        ),
        Fact(
            "an unresolvable collision with object_key keeps the structured collision error over the lean base",
            [
                Reason = "Speckle.AddProperties.NameCollision",
                ExistingColumns = {"object_key"}
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
