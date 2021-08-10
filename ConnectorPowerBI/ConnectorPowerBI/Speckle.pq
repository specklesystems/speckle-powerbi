section Speckle;

// params
baseUrl = "https://speckle.xyz";
streamId = "5dfbeb49c9";

shared Speckle.Contents = Value.ReplaceType(Speckle.NavImpl, Speckle.Params);

Speckle.Params = type function() as table
        meta [
            Documentation.Name = Extension.LoadString("Speckle.Contents.Name"),
            Documentation.LongDescription = Extension.LoadString("Speckle.Contents.LongDescription")
        ];

// set side navigation bar as streams available to account on server
Speckle.NavImpl = () as table => 
	let
		objects = #table(
		{"Name", "Key", "Data", "ItemKind", "ItemName"},
		{{"Branches", "Branches", Speckle.GetBranches() , "Table", "Table"}}
		),
		NavTable = Speckle.ToNavigationTable(objects, {"Key"}, "Name", "Data", "ItemKind", "ItemName" )
	in
		NavTable;

[DataSource.Kind="Speckle"]
shared Speckle.GetBranches = Value.ReplaceType(Speckle.GetBranchesImpl, Speckle.GetBranchesImplType);

Speckle.GetBranchesImplType = type function() as table
        meta [
            Documentation.Name = Extension.LoadString("Speckle.GetBranches.Name"),
            Documentation.LongDescription = Extension.LoadString("Speckle.GetBranches.LongDescription")
        ];

Speckle.GetBranchesImpl = () =>
    let
        Source = Speckle.GetBranchesFromAPI(),
        table = Table.FromRecords({Source})
    in
           table;

// get the branches of the input stream
Speckle.GetBranchesFromAPI = () =>
	let
		Source = Web.Contents(
		Text.Combine({baseUrl, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary("{""query"": ""query { stream( id: \"""&streamId&"\"" ) { branches { items { name description } } } }""}")
		]
		),
		#"JSON" = Json.Document(Source)
	in
		#"JSON";

Speckle = [
    Authentication = [
        Implicit = []
    ],
    Label = Extension.LoadString("DataSourceLabel")
];
 
Speckle.Publish = [
    Beta = true,
    ButtonText = { Extension.LoadString("FormulaTitle"), Extension.LoadString("FormulaHelp") },
    SourceImage = Speckle.Icons,
    SourceTypeImage = Speckle.Icons
];
 
Speckle.Icons = [
    Icon16 = { Extension.Contents("Speckle16.png"), Extension.Contents("Speckle20.png"), Extension.Contents("Speckle24.png"), Extension.Contents("Speckle32.png") },
    Icon32 = { Extension.Contents("Speckle32.png"), Extension.Contents("Speckle40.png"), Extension.Contents("Speckle48.png"), Extension.Contents("Speckle64.png") }
];

// nav table helper
Speckle.ToNavigationTable =
(
    table as table,
    keyColumns as list,
    nameColumn as text,
    dataColumn as text,
    itemKindColumn as text,
    itemNameColumn as text
) as table =>
    let
        tableType = Value.Type(table),
        newTableType = Type.AddTableKey(tableType, keyColumns, true) meta 
        [
            NavigationTable.NameColumn = nameColumn, 
            NavigationTable.DataColumn = dataColumn,
            NavigationTable.ItemKindColumn = itemKindColumn, 
            Preview.DelayColumn = dataColumn
        ],
        navigationTable = Value.ReplaceType(table, newTableType)
    in
        navigationTable;