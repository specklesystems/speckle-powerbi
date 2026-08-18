// ENG-9165 contract tests: the connector's public interface.
// Runs offline (no credentials) — checks export presence, parameter names,
// arity and return types. A missing export fails with "name wasn't recognized",
// which is exactly the 3.x regression these tests guard against.
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

    ParamNames = (f as function) as list => Record.FieldNames(Type.FunctionParameters(Value.Type(f))),
    RequiredCount = (f as function) as number => Type.FunctionRequiredParameters(Value.Type(f)),
    ReturnsTable = (f as function) as logical => Type.Is(Type.FunctionReturn(Value.Type(f)), type table),

    // the GetTables advanced-options record: a typed record parameter renders
    // as the connect dialog's collapsible group, titled by its FieldCaption
    GetTablesOptionsType = Type.FunctionParameters(Value.Type(Speckle.GetTables))[options],
    GetTablesOptionsFields = Type.RecordFields(Type.NonNullable(GetTablesOptionsType)),
    GetTablesTableLayoutMeta = Value.Metadata(GetTablesOptionsFields[TableLayout][Type]),

    facts = {
        // Speckle.GetByUrl keeps the full 3.x contract (url + optional ExpandProperties)
        Fact("GetByUrl parameters", {"url", "ExpandProperties"}, ParamNames(Speckle.GetByUrl)),
        Fact("GetByUrl required arity", 1, RequiredCount(Speckle.GetByUrl)),
        Fact("GetByUrl returns table", true, ReturnsTable(Speckle.GetByUrl)),

        // the 4.0 star schema is a separate entry point
        Fact("GetTables parameters", {"url", "options"}, ParamNames(Speckle.GetTables)),
        Fact("GetTables required arity", 1, RequiredCount(Speckle.GetTables)),
        Fact("GetTables returns table", true, ReturnsTable(Speckle.GetTables)),
        Fact("GetTables options render as the collapsible Advanced options group",
            "Advanced options",
            Value.Metadata(GetTablesOptionsType)[Documentation.FieldCaption]),
        Fact("GetTables options carry the single optional TableLayout field",
            [Names = {"TableLayout"}, Optional = true],
            [
                Names = Record.FieldNames(GetTablesOptionsFields),
                Optional = GetTablesOptionsFields[TableLayout][Optional]
            ]),
        Fact("TableLayout is a dropdown captioned Table layout with the Simplified default first",
            [Caption = "Table layout", AllowedValues = {"Simplified", "All tables"}],
            [
                Caption = GetTablesTableLayoutMeta[Documentation.FieldCaption],
                AllowedValues = GetTablesTableLayoutMeta[Documentation.AllowedValues]
            ]),
        Fact("AddProperties parameters", {"source", "propertyPaths", "columnNames"}, ParamNames(Speckle.AddProperties)),
        Fact("AddProperties required arity", 2, RequiredCount(Speckle.AddProperties)),
        Fact("AddProperties returns table", true, ReturnsTable(Speckle.AddProperties)),
        Fact("AddAllProperties parameters", {"source", "columnNames"}, ParamNames(Speckle.AddAllProperties)),
        Fact("AddAllProperties required arity", 1, RequiredCount(Speckle.AddAllProperties)),
        Fact("AddAllProperties returns table", true, ReturnsTable(Speckle.AddAllProperties)),
        Fact("AddInstanceProperties is no longer exported", false, Record.HasFields(#shared, "Speckle.AddInstanceProperties")),
        Fact("AddTypeProperties is no longer exported", false, Record.HasFields(#shared, "Speckle.AddTypeProperties")),
        Fact("ExpandProperties is no longer exported", false, Record.HasFields(#shared, "Speckle.ExpandProperties")),

        // 3.x single-parameter interfaces preserved
        Fact("GetStructuredData parameters", {"url"}, ParamNames(Speckle.GetStructuredData)),
        Fact("SendToServer parameters", {"url"}, ParamNames(Speckle.SendToServer)),
        Fact("SendToServer returns table (3.x metadata)", true, ReturnsTable(Speckle.SendToServer)),

        // the eight restored compatibility functions
        Fact("GetVersion arity", 0, RequiredCount(Speckle.GetVersion)),
        Fact("GetVersion value", "4.0.0", Speckle.GetVersion()),
        Fact("Objects.Collections parameters", {"inputData"}, ParamNames(Speckle.Objects.Collections)),
        Fact("Objects.CompositeStructure parameters", {"objectRecord", "outputAsList"}, ParamNames(Speckle.Objects.CompositeStructure)),
        Fact("Objects.MaterialQuantities parameters", {"objectRecord", "outputAsList"}, ParamNames(Speckle.Objects.MaterialQuantities)),
        Fact("Models.Federate parameters", {"tables", "excludeData"}, ParamNames(Speckle.Models.Federate)),
        Fact("Models.MaterialQuantities parameters", {"inputTable", "addPrefix"}, ParamNames(Speckle.Models.MaterialQuantities)),
        Fact("Project.Issues parameters", {"url", "getReplies"}, ParamNames(Speckle.Project.Issues)),
        Fact("Revit.Parameters.ToNameValueRecord parameters", {"r", "exclude"}, ParamNames(Speckle.Revit.Parameters.ToNameValueRecord)),

        // retained shared data-shaping helpers
        Fact("Objects.Properties required arity", 1, RequiredCount(Speckle.Objects.Properties)),
        Fact("Utils.ExpandRecord required arity", 2, RequiredCount(Speckle.Utils.ExpandRecord))
    }
in
    Summarize(facts)
