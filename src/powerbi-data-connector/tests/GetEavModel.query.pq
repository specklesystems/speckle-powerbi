// Offline contract tests for GetEavModel.pqm — the star-schema shaping seam
// behind Speckle.GetTables. ReadBundleTable is injected, so the suite feeds
// synthetic bundle tables and proves the fixed output schema: every keyed
// table carries `Object Key` (Int64, keyOffset-namespaced, row order
// preserved) with no `object_key` alias, raw artifact fields stay raw, and
// property paths that would collide with either literal key spelling are
// suffixed with " (property)".
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

    GetEavModel = Speckle.LoadFunction("GetEavModel.pqm"),
    KeySpace = 4294967296,

    ObjectsBundle = #table(
        type table [object_index = Int64.Type, application_id = text],
        {{0, "app-zero"}, {1, "app-one"}, {2, "app-two"}}
    ),
    // both literal key spellings plus a raw-field name must be suffixed;
    // ordinary dotted paths pass through untouched
    PathsBundle = #table(
        type table [path_index = Int64.Type, path = text],
        {
            {0, "properties.Dimensions.Area"},
            {1, "object_key"},
            {2, "Object Key"},
            {3, "application_id"}
        }
    ),
    EavBundle = #table(
        type table [
            object_index = Int64.Type,
            path_index = Int64.Type,
            value_string = nullable text,
            value_double = nullable number,
            value_boolean = nullable logical
        ],
        {
            {0, 0, "area-zero", null, null},
            {2, 0, null, 42, null}
        }
    ),
    ObjectTypeBundle = #table(
        type table [object_index = Int64.Type, type_index = Int64.Type],
        {{0, 0}, {1, 0}}
    ),
    TypeEavBundle = #table(
        type table [
            type_index = Int64.Type,
            path_index = Int64.Type,
            value_string = nullable text,
            value_double = nullable number,
            value_boolean = nullable logical
        ],
        {{0, 0, "type-area", null, null}}
    ),
    RelationsBundle = #table(
        type table [rel = Int64.Type, src = Int64.Type, dst = Int64.Type, ord = nullable number],
        {{7, 0, 10, null}, {20, 1, 2, 3}}
    ),
    RelationTypesBundle = #table(
        type table [
            rel = Int64.Type,
            name = text,
            src_ns = text,
            dst_ns = text,
            status = text,
            ord_semantics = nullable text,
            description = text
        ],
        {
            {7, "ON_LEVEL", "object", "node", "active", null, "level"},
            {20, "CONNECTS_TO", "object", "object", "active", "scope", "connection"}
        }
    ),
    NodesBundle = #table(
        type table [
            id = Int64.Type,
            kind = Int64.Type,
            name = nullable text,
            elevation = nullable number,
            subtype = nullable text,
            units = nullable text,
            argb = nullable number
        ],
        {{10, 5, "Level 1", 3.5, "Building Story", "m", 4278190080}}
    ),
    NodeKindsBundle = #table(
        type table [kind = Int64.Type, name = text, description = text],
        {{5, "LEVEL", "building level"}}
    ),

    MakeReader = (withTypes as logical, withEnvelope as logical) =>
        (files as list, suffix as text, required as logical) =>
        if suffix = ".eav.objects.parquet" then ObjectsBundle
        else if suffix = ".eav.paths.parquet" then PathsBundle
        else if suffix = ".eav.eav.parquet" then EavBundle
        else if suffix = ".eav.object_type.parquet" then (if withTypes then ObjectTypeBundle else null)
        else if suffix = ".eav.type_eav.parquet" then (if withTypes then TypeEavBundle else null)
        else if suffix = ".envelope.relations.parquet" then (if withEnvelope then RelationsBundle else null)
        else if suffix = ".envelope.rel_types.parquet" then (if withEnvelope then RelationTypesBundle else null)
        else if suffix = ".envelope.nodes.parquet" then (if withEnvelope then NodesBundle else null)
        else if suffix = ".envelope.node_kinds.parquet" then (if withEnvelope then NodeKindsBundle else null)
        else error "unexpected bundle suffix: " & suffix,

    SpecKeyReader = (files as list, suffix as text, required as logical) =>
        if suffix = ".envelope.rel_types.parquet" then
            Table.RenameColumns(RelationTypesBundle, {{"rel", "id"}})
        else if suffix = ".envelope.node_kinds.parquet" then
            Table.RenameColumns(NodeKindsBundle, {{"kind", "id"}})
        else
            MakeReader(true, true)(files, suffix, required),

    Model = GetEavModel([ReadBundleTable = MakeReader(true, true)], {}, 0),
    SpecKeyModel = GetEavModel([ReadBundleTable = SpecKeyReader], {}, 0),
    // second federated model: keyOffset = ordinal 1 * 2^32
    FederatedModel = GetEavModel([ReadBundleTable = MakeReader(true, true)], {}, KeySpace),
    TypelessModel = GetEavModel([ReadBundleTable = MakeReader(false, false)], {}, 0),

    KeyTypeName = (t as table) as text => Table.Schema(t){[Name = "Object Key"]}[TypeName],

    facts = {
        Fact(
            "Objects carries exactly Object Key and Application ID — no object_key alias, no raw fields",
            {"Object Key", "Application ID"},
            Table.ColumnNames(Model[Objects])
        ),
        Fact(
            "Object Key is Int64 on Objects",
            "Int64.Type",
            KeyTypeName(Model[Objects])
        ),
        Fact(
            "Objects preserves bundle row order and cardinality with keys equal to object_index at offset 0",
            {{0, "app-zero"}, {1, "app-one"}, {2, "app-two"}},
            Table.ToRows(Model[Objects])
        ),
        Fact(
            "Property Values carries Object Key first with the shared value shape",
            {"Object Key", "path_key", "Value Text", "Value Number", "Value Bool", "Value"},
            Table.ColumnNames(Model[Properties])
        ),
        Fact(
            "Property Values keys resolve against Objects and keep raw display values",
            {{0, 0, "area-zero"}, {2, 0, 42}},
            Table.ToRows(Table.SelectColumns(Model[Properties], {"Object Key", "path_key", "Value"}))
        ),
        Fact(
            "Object Key is Int64 on Property Values",
            "Int64.Type",
            KeyTypeName(Model[Properties])
        ),
        Fact(
            "Object Types carries Object Key and the unrenamed type_key",
            {"Object Key", "type_key"},
            Table.ColumnNames(Model[ObjectTypes])
        ),
        Fact(
            "a typeless bundle still yields an empty Object Types table with the Object Key column",
            [Columns = {"Object Key", "type_key"}, Rows = 0, KeyType = "Int64.Type"],
            [
                Columns = Table.ColumnNames(TypelessModel[ObjectTypes]),
                Rows = Table.RowCount(TypelessModel[ObjectTypes]),
                KeyType = KeyTypeName(TypelessModel[ObjectTypes])
            ]
        ),
        Fact(
            "Type Properties keeps its type_key grain untouched by the rename",
            {"type_key", "path_key", "Value Text", "Value Number", "Value Bool", "Value"},
            Table.ColumnNames(Model[TypeProperties])
        ),
        Fact(
            "Paths keeps path_key and Property with both literal key spellings and raw field names suffixed",
            {
                {0, "properties.Dimensions.Area"},
                {1, "object_key (property)"},
                {2, "Object Key (property)"},
                {3, "application_id (property)"}
            },
            Table.ToRows(Table.SelectColumns(Model[Paths], {"path_key", "Property"}))
        ),
        Fact(
            "federation namespaces Object Key, path_key and type_key by ordinal * 2^32 while preserving order",
            [
                ObjectKeys = {KeySpace, KeySpace + 1, KeySpace + 2},
                PropertyKeys = {{KeySpace, KeySpace}, {KeySpace + 2, KeySpace}},
                Bridge = {{KeySpace, KeySpace}, {KeySpace + 1, KeySpace}}
            ],
            [
                ObjectKeys = Table.Column(FederatedModel[Objects], "Object Key"),
                PropertyKeys = Table.ToRows(
                    Table.SelectColumns(FederatedModel[Properties], {"Object Key", "path_key"})
                ),
                Bridge = Table.ToRows(FederatedModel[ObjectTypes])
            ]
        ),
        Fact(
            "Relations exposes the catalog name and offsets both endpoints",
            {
                {"ON_LEVEL", 7, 0, 10, null},
                {"CONNECTS_TO", 20, 1, 2, 3}
            },
            Table.ToRows(Model[Relations])
        ),
        Fact(
            "federation offsets relation endpoints but leaves relation ids local",
            {
                {"ON_LEVEL", 7, KeySpace, KeySpace + 10, null},
                {"CONNECTS_TO", 20, KeySpace + 1, KeySpace + 2, 3}
            },
            Table.ToRows(FederatedModel[Relations])
        ),
        Fact(
            "Relation Types preserves the bundle catalog columns and values",
            Table.ToRows(RelationTypesBundle),
            Table.ToRows(Model[RelationTypes])
        ),
        Fact(
            "Nodes keeps only BI fields, resolves Kind and offsets Node Key",
            {
                {10, "LEVEL", "Level 1", 3.5, "Building Story", "m"}
            },
            Table.ToRows(Model[Nodes])
        ),
        Fact(
            "SQL-spec id keys produce the same relation and node shapes",
            [Relations = Table.ToRows(Model[Relations]), Nodes = Table.ToRows(Model[Nodes])],
            [Relations = Table.ToRows(SpecKeyModel[Relations]), Nodes = Table.ToRows(SpecKeyModel[Nodes])]
        ),
        Fact(
            "federation offsets Node Key",
            {KeySpace + 10},
            Table.Column(FederatedModel[Nodes], "Node Key")
        ),
        Fact(
            "a legacy bundle gets typed empty envelope tables",
            [
                Relations = [Columns = {"Relation Type", "rel", "src", "dst", "ord"}, Rows = 0],
                RelationTypes = [
                    Columns = {"rel", "name", "src_ns", "dst_ns", "status", "ord_semantics", "description"},
                    Rows = 0
                ],
                Nodes = [Columns = {"Node Key", "Kind", "Name", "Elevation", "Subtype", "Units"}, Rows = 0]
            ],
            [
                Relations = [Columns = Table.ColumnNames(TypelessModel[Relations]), Rows = Table.RowCount(TypelessModel[Relations])],
                RelationTypes = [Columns = Table.ColumnNames(TypelessModel[RelationTypes]), Rows = Table.RowCount(TypelessModel[RelationTypes])],
                Nodes = [Columns = Table.ColumnNames(TypelessModel[Nodes]), Rows = Table.RowCount(TypelessModel[Nodes])]
            ]
        )
    }
in
    Summarize(facts)
