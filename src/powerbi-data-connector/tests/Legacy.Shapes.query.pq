// ENG-9165 regression tests: the legacy data-shaping helpers against
// legacy-shaped inputs (the flat table/record shapes returned by
// Speckle.GetByUrl). Runs offline (no credentials).
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

    // ---- Speckle.Utils.ExpandRecord --------------------------------------
    PropsTable = #table({"id", "props"}, {{1, [a = 1, b = "x"]}, {2, [a = 2]}}),
    Expanded = Speckle.Utils.ExpandRecord(PropsTable, "props"),
    ExpandedCombined = Speckle.Utils.ExpandRecord(PropsTable, "props", null, true),
    ExpandedFiltered = Speckle.Utils.ExpandRecord(PropsTable, "props", {"b"}),

    // ---- Speckle.Models.Federate ------------------------------------------
    LegacyRow = (objectId as text, root as text, info as text) => [
        #"Object IDs" = objectId,
        #"Speckle Type" = "Base",
        #"Version Object ID" = root,
        #"Model Info" = info,
        #"Application ID" = objectId & "-app",
        data = [x = objectId]
    ],
    LegacyTable = (objectId as text, root as text, info as text) => Table.FromRecords({LegacyRow(objectId, root, info)}),
    Federated = Speckle.Models.Federate({LegacyTable("o1", "root1", "info1"), LegacyTable("o2", "root2", "info2")}),
    FederatedViewerOnly = Speckle.Models.Federate({LegacyTable("o1", "root1", "info1"), LegacyTable("o2", "root2", "info2")}, true),

    // ---- Speckle.Objects.MaterialQuantities --------------------------------
    MqRecord = [properties = [#"Material Quantities" = [Concrete = [volume = 1]]]],

    // ---- Speckle.Objects.CompositeStructure --------------------------------
    CompositeDirect = [properties = [#"Composite Structure" = [Layer1 = "Concrete", Layer2 = "Insulation"]]],
    CompositeRevit = [properties = [Parameters = [#"Type Parameters" = [Structure = [S = 1]]]]],
    CompositeNone = [properties = [Foo = 1]],

    // ---- Speckle.Objects.Properties ----------------------------------------
    FlatProps = Speckle.Objects.Properties([properties = [Area = 5, Name = "Wall"]]),

    // ---- Speckle.Revit.Parameters.ToNameValueRecord ------------------------
    RevitParams = [
        id = "x",
        speckle_type = "t",
        applicationId = "a",
        totalChildrenCount = 0,
        P1 = [name = "Width", value = 10, applicationInternalName = "WIDTH_PARAM"]
    ],

    // ---- Speckle.Models.MaterialQuantities ----------------------------------
    MqTable = #table({"data"}, {{MqRecord}}),
    MqExpanded = Speckle.Models.MaterialQuantities(MqTable),

    facts = {
        Fact(
            "ExpandRecord expands fields, missing fields become null",
            {[id = 1, props = [a = 1, b = "x"], a = 1, b = "x"], [id = 2, props = [a = 2], a = 2, b = null]},
            Table.ToRecords(Expanded)
        ),
        Fact(
            "ExpandRecord combined names prefix the column name",
            {"id", "props", "props.a", "props.b"},
            Table.ColumnNames(ExpandedCombined)
        ),
        Fact(
            "ExpandRecord honors the FieldNames filter",
            {"id", "props", "b"},
            Table.ColumnNames(ExpandedFiltered)
        ),
        Fact(
            "Federate concatenates Version Object IDs on every row",
            {"root1,root2", "root1,root2"},
            Table.Column(Federated, "Version Object ID")
        ),
        Fact(
            "Federate concatenates Model Info with the ||| delimiter",
            {"info1|||info2", "info1|||info2"},
            Table.Column(Federated, "Model Info")
        ),
        Fact(
            "Federate keeps all rows",
            2,
            Table.RowCount(Federated)
        ),
        Fact(
            "Federate excludeData keeps only the viewer columns",
            {"Version Object ID", "Model Info", "Object IDs"},
            Table.ColumnNames(FederatedViewerOnly)
        ),
        Fact(
            "Objects.MaterialQuantities returns the Material Quantities record",
            [Concrete = [volume = 1]],
            Speckle.Objects.MaterialQuantities(MqRecord)
        ),
        Fact(
            "Objects.MaterialQuantities outputs a list when asked",
            {[volume = 1]},
            Speckle.Objects.MaterialQuantities(MqRecord, true)
        ),
        Fact(
            "Objects.MaterialQuantities returns null without the field",
            null,
            Speckle.Objects.MaterialQuantities([properties = [Foo = 1]])
        ),
        Fact(
            "Objects.CompositeStructure reads the direct field",
            [Layer1 = "Concrete", Layer2 = "Insulation"],
            Speckle.Objects.CompositeStructure(CompositeDirect)
        ),
        Fact(
            "Objects.CompositeStructure outputs a list when asked",
            {"Concrete", "Insulation"},
            Speckle.Objects.CompositeStructure(CompositeDirect, true)
        ),
        Fact(
            "Objects.CompositeStructure reads the Revit Type Parameters path",
            [S = 1],
            Speckle.Objects.CompositeStructure(CompositeRevit)
        ),
        Fact(
            "Objects.CompositeStructure returns null when absent",
            null,
            Speckle.Objects.CompositeStructure(CompositeNone)
        ),
        Fact(
            "Objects.Properties flattens a properties record",
            [Area = 5, Name = "Wall"],
            FlatProps
        ),
        Fact(
            "Revit.Parameters.ToNameValueRecord flattens to 'name [uid]' fields",
            [#"Width [WIDTH_PARAM]" = 10],
            Speckle.Revit.Parameters.ToNameValueRecord(RevitParams)
        ),
        Fact(
            "Models.MaterialQuantities expands quantities onto rows",
            1,
            Table.RowCount(MqExpanded)
        ),
        Fact(
            "Models.MaterialQuantities exposes the quantity columns",
            true,
            List.Contains(Table.ColumnNames(MqExpanded), "volume")
        )
    }
in
    Summarize(facts)
