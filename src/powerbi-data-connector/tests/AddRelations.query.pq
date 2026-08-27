// Offline contract tests for Speckle.AddRelations. Synthetic graph tables
// cover namespace-driven resolution, curated cardinality, deterministic multi
// values, duplicate edge rows, disappeared selections and lazy empty calls.
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

    KeySpace = 4294967296,
    Objects = #table(
        type table [#"Object Key" = Int64.Type, Label = text],
        {{1, "one"}, {2, "two"}, {3, "three"}, {KeySpace + 1, "federated"}}
    ),
    RelationTypes = #table(
        type table [rel = Int64.Type, name = text, src_ns = text, dst_ns = text],
        {
            {20, "CONNECTS_TO", "object", "object"},
            {7, "ON_LEVEL", "object", "node"},
            {31, "HOSTED_ON", "object", "object"},
            {40, "CUSTOM_NODE_MULTI", "object", "node"},
            {88, "BROKEN", "object", "geometry"}
        }
    ),
    Relations = #table(
        type table [rel = Int64.Type, src = Int64.Type, dst = Int64.Type, ord = nullable number],
        {
            {7, 1, 100, null},
            {7, 1, 100, null},
            {7, 2, 101, null},
            {7, KeySpace + 1, KeySpace + 100, null},
            {20, 1, 3, 2},
            {20, 1, 2, 1},
            {20, 1, 2, 5},
            {20, 2, 3, null},
            {31, 1, 3, null},
            {40, 1, 100, 4},
            {40, 1, 102, 1},
            {40, 1, 103, 2}
        }
    ),
    Nodes = #table(
        type table [#"Node Key" = Int64.Type, Name = nullable text],
        {
            {100, "Level A"},
            {101, "Level B"},
            {102, "Level A"},
            {103, "Level B"},
            {KeySpace + 100, "Federated Level"}
        }
    ),
    EmptyRelations = #table(
        type table [rel = Int64.Type, src = Int64.Type, dst = Int64.Type, ord = nullable number],
        {}
    ),
    EmptyRelationTypes = #table(
        type table [rel = Int64.Type, name = text, src_ns = text, dst_ns = text],
        {}
    ),
    EmptyNodes = #table(type table [#"Node Key" = Int64.Type, Name = nullable text], {}),

    SingleNode = Speckle.AddRelations(Objects, Relations, RelationTypes, Nodes, {"ON_LEVEL"}),
    SingleObject = Speckle.AddRelations(Objects, Relations, RelationTypes, Nodes, {"HOSTED_ON"}),
    MultiObject = Speckle.AddRelations(Objects, Relations, RelationTypes, Nodes, {"CONNECTS_TO"}),
    GenericMulti = Speckle.AddRelations(Objects, Relations, RelationTypes, Nodes, {"CUSTOM_NODE_MULTI"}),
    IdCatalogResult = Speckle.AddRelations(
        Objects,
        Relations,
        Table.RenameColumns(RelationTypes, {{"rel", "id"}}),
        Nodes,
        {"ON_LEVEL"}
    ),
    Ordered = Speckle.AddRelations(
        Objects,
        Relations,
        RelationTypes,
        Nodes,
        {" GONE ", "ON_LEVEL", "CONNECTS_TO", "ON_LEVEL"}
    ),
    Legacy = Speckle.AddRelations(
        Objects,
        EmptyRelations,
        EmptyRelationTypes,
        EmptyNodes,
        {"ON_LEVEL"}
    ),
    CardinalityResult = try Table.RowCount(
        Speckle.AddRelations(
            Objects,
            Table.InsertRows(Relations, 0, {[rel = 7, src = 1, dst = 101, ord = null]}),
            RelationTypes,
            Nodes,
            {"ON_LEVEL"}
        )
    ),
    CardinalityError = if not CardinalityResult[HasError] then
        [Reason = null, RelationName = null]
    else
        [
            Reason = try CardinalityResult[Error][Reason] otherwise null,
            RelationName = try CardinalityResult[Error][Detail][RelationName] otherwise null
        ],
    InvalidResult = try Speckle.AddRelations(
        Objects,
        Relations,
        RelationTypes,
        Nodes,
        {"", 5, "ON_LEVEL"}
    ),
    InvalidError = if not InvalidResult[HasError] then
        [Reason = null, Positions = {}]
    else
        [
            Reason = try InvalidResult[Error][Reason] otherwise null,
            Positions = try InvalidResult[Error][Detail][Positions] otherwise {}
        ],
    UnsupportedResult = try Table.RowCount(
        Speckle.AddRelations(Objects, Relations, RelationTypes, Nodes, {"BROKEN"})
    ),
    UnsupportedReason = if UnsupportedResult[HasError] then
        try UnsupportedResult[Error][Reason] otherwise null
    else
        null,
    MissingColumnsResult = try Table.RowCount(
        Speckle.AddRelations(
            Objects,
            #table(type table [rel = Int64.Type], {}),
            RelationTypes,
            Nodes,
            {"ON_LEVEL"}
        )
    ),
    MissingColumnsError = if not MissingColumnsResult[HasError] then
        [Reason = null, Parameter = null]
    else
        [
            Reason = try MissingColumnsResult[Error][Reason] otherwise null,
            Parameter = try MissingColumnsResult[Error][Detail][Parameter] otherwise null
        ],

    UnreadTable = (message as text, tableType as type) as table =>
        Table.View(null, [GetType = () => tableType, GetRows = () => error message]),
    LazyResult = Speckle.AddRelations(
        Objects,
        UnreadTable(
            "Relations must not be read",
            type table [rel = Int64.Type, src = Int64.Type, dst = Int64.Type, ord = nullable number]
        ),
        UnreadTable(
            "Relation Types must not be read",
            type table [rel = Int64.Type, name = text, src_ns = text, dst_ns = text]
        ),
        UnreadTable(
            "Nodes must not be read",
            type table [#"Node Key" = Int64.Type, Name = nullable text]
        ),
        {}
    ),

    facts = {
        Fact(
            "node targets resolve to names and duplicate edge rows collapse",
            {"Level A", "Level B", null, "Federated Level"},
            Table.Column(SingleNode, "ON_LEVEL")
        ),
        Fact(
            "the SQL-spec id catalog key remains supported",
            Table.Column(SingleNode, "ON_LEVEL"),
            Table.Column(IdCatalogResult, "ON_LEVEL")
        ),
        Fact(
            "a single object target remains an Int64 Object Key",
            [Values = {3, null, null, null}, Type = "Int64.Type"],
            [
                Values = Table.Column(SingleObject, "HOSTED_ON"),
                Type = Table.Schema(SingleObject){[Name = "HOSTED_ON"]}[TypeName]
            ]
        ),
        Fact(
            "multi object targets dedupe and sort by ord then resolved value",
            {"2, 3", "3", null, null},
            Table.Column(MultiObject, "CONNECTS_TO")
        ),
        Fact(
            "multi columns are always text",
            "Text.Type",
            Table.Schema(MultiObject){[Name = "CONNECTS_TO"]}[TypeName]
        ),
        Fact(
            "an uncurated supported relation resolves as multi and dedupes equal node names",
            {"Level A, Level B", null, null, null},
            Table.Column(GenericMulti, "CUSTOM_NODE_MULTI")
        ),
        Fact(
            "known names follow bundle catalog order and disappeared names trail",
            {"Object Key", "Label", "CONNECTS_TO", "ON_LEVEL", "GONE"},
            Table.ColumnNames(Ordered)
        ),
        Fact(
            "a disappeared name stays as an all-null column",
            {null, null, null, null},
            Table.Column(Ordered, "GONE")
        ),
        Fact(
            "legacy empty envelope tables produce an all-null requested column",
            [Columns = {"Object Key", "Label", "ON_LEVEL"}, Values = {null, null, null, null}],
            [Columns = Table.ColumnNames(Legacy), Values = Table.Column(Legacy, "ON_LEVEL")]
        ),
        Fact(
            "single cardinality violations raise a structured error",
            [Reason = "Speckle.AddRelations.CardinalityViolation", RelationName = "ON_LEVEL"],
            CardinalityError
        ),
        Fact(
            "blank and non-text selections report one-based caller positions",
            [Reason = "Speckle.AddRelations.InvalidRelationNames", Positions = {1, 2}],
            InvalidError
        ),
        Fact(
            "unsupported endpoint namespaces raise a structured error",
            "Speckle.AddRelations.UnsupportedNamespace",
            UnsupportedReason
        ),
        Fact(
            "per-table column validation identifies the failing argument",
            [Reason = "Speckle.AddRelations.MissingColumns", Parameter = "relations"],
            MissingColumnsError
        ),
        Fact(
            "an empty selection returns the Objects value without reading envelope tables",
            Table.ToRows(Objects),
            Table.ToRows(LazyResult)
        ),
        Fact(
            "the result preserves every Objects row and its existing columns",
            [Rows = 4, LeadingColumns = {"Object Key", "Label"}],
            [Rows = Table.RowCount(Ordered), LeadingColumns = List.FirstN(Table.ColumnNames(Ordered), 2)]
        )
    }
in
    Summarize(facts)
