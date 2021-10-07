section Speckle;

/* This is an additional nav bar that can display branches of a stream: not using this for now
[DataSource.Kind="Speckle",  Publish="Speckle.Publish"]
shared Speckle.Contents = Value.ReplaceType(NavigationTable.Simple, type function (url as Uri.Type) as any);

// set up nav table
shared NavigationTable.Simple = (url) as table => 
    let
        baseUrl = Uri.Parts(url)[Host] as text,
        streamId = Text.Split(Uri.Parts(url)[Path], "/"){2},
        objects = Speckle.GetBranches(baseUrl, streamId),
        table = #table(
        {"Name", "Key", "Data", "ItemKind", "ItemName", "IsLeaf"}, 
        List.InsertRange(objects, List.Count(objects), {{"GetCommit", "GetCommit", Speckle.GetObjectFromObject(baseUrl, streamId), "Function", "Function", true}})
        ),
        NavTable = Table.ToNavigationTable(table, {"Key"}, "Name", "Data", "ItemKind", "ItemName", "IsLeaf")
    in
        NavTable;

Speckle.GetBranches = (url, id) =>
    let
		Source = Web.Contents(
		Text.Combine({"https:/", url, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary("{""query"": ""query { stream( id: \"""&id&"\"" ) { branches { items { name commits { items { id message sourceApplication authorName createdAt } } } } } }""}")
		]
		),
		#"JSON" = Json.Document(Source),
        branches = #"JSON"[data][stream][branches][items],
        branchList = List.Generate(
            () => [x = 0, y = Speckle.GetBranchAsList(branches{x})],
            each [x] < List.Count(branches),
            each [x = [x] + 1, y = Speckle.GetBranchAsList(branches{x})],
            each [y]
        )
	in
		branchList;

Speckle.GetBranchAsList = (branchRecord) =>
    let
        commits = Table.FromRecords(branchRecord[commits][items]),
        list = {branchRecord[name], branchRecord[name], commits, "Table", "Table", true}
    in
        list;
*/

[DataSource.Kind="Speckle",  Publish="Speckle.Publish"]
shared Speckle.Contents = Value.ReplaceType(CommitTable, type function (StreamUrl as Uri.Type) as any);

shared CommitTable = (url) as table => 
    let
        // Get server and streamId, and branchName / commitId / objectid from the input url
        server = Text.Combine({"https://", Uri.Parts(url)[Host]}),
        segments = Text.Split(Text.AfterDelimiter(Uri.Parts(url)[Path], "/", 0), "/"),
        streamId = segments{1},
        branchName = if( List.Count(segments) = 4 and segments{2} = "branches" ) then segments{3} else null,
        commitId = if (List.Count(segments) = 4 and segments{2} = "commits" ) then segments{3} else null,
        objectId = if (List.Count(segments) = 4 and segments{2} = "objects" ) then segments{3} else null,
        
        commitTable = if (commitId <> null) then Speckle.GetObjectFromCommit(server, streamId, commitId)
        else if (objectId <> null) then Speckle.GetObjectFromObject(server, streamId, objectId, false)
        else if (branchName <> null) then #table( { "Error" }, { { "Invalid URL, use a stream or commit or object url" } } ) // currently not implemented, see reason below
        else Speckle.GetObjectFromStream(server, streamId)
    in
        commitTable;

Speckle.GetObjectFromStream = (server, streamId) =>
    let
        branchName = "main",
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary("{""query"": ""query { stream( id: \"""&streamId&"\"" ) { branch (name: \"""&branchName&"\""){ commits (limit: 1) { items { referencedObject } } } } }""}")
		]
		),
		#"JSON" = Json.Document(Source),
        objectId = #"JSON"[data][stream][branch][commits][items]{0}[referencedObject],
        objectsTable = Speckle.GetObjectFromObject(server, streamId, objectId, true)
    in
        objectsTable;

/* Not implemented since power query M uri does not have a decode method...def not manually writing a method to handle special chars and emojis
Speckle.GetObjectFromBranch = (server, streamId, branchName) => 
    let
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary("{""query"": ""query { stream( id: \"""&streamId&"\"" ) { branch (name: \"""&branchName&"\""){ commits (limit: 1) { items { referencedObject } } } } }""}")
		]
		),
		#"JSON" = Json.Document(Source),
        objectId = #"JSON"[data][stream][branch][commits][items]{0}[referencedObject],
        objectsTable = Speckle.GetObjectFromObject(server, streamId, objectId)
    in
        objectsTable;
*/

shared Speckle.GetObjectFromCommit = (server, streamId, commitId) =>
    let
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary("{""query"": ""query { stream( id: \"""&streamId&"\"" ) { commit (id: \"""&commitId&"\""){ referencedObject } } }""}")
		]
		),
		#"JSON" = Json.Document(Source),
        objectId = #"JSON"[data][stream][commit][referencedObject],
        objectsTable = Speckle.GetObjectFromObject(server, streamId, objectId, true)
    in
        objectsTable;

Speckle.GetObjectFromObject = (server, streamId, objectId, IsCommitObject) => 
    let
        query = if (IsCommitObject) then "{""query"": ""query { stream( id: \"""&streamId&"\"" ) { object (id: \"""&objectId&"\"") { children { objects { data } } } } }""}"
        else "{""query"": ""query { stream( id: \"""&streamId&"\"" ) { object (id: \"""&objectId&"\"") { data } } }""}",
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json"
			],
			Content=Text.ToBinary(query)
		]
		),
		#"JSON" = Json.Document(Source),
        objects = if (IsCommitObject) then #"JSON"[data][stream][object][children][objects]
        else {#"JSON"[data][stream][object][data]},

        // remove closures from records, and remove DataChunk records
        removeClosureField = List.Transform(objects, each Record.RemoveFields(_, "__closure", MissingField.Ignore)),
        removeDatachunkRecords = List.RemoveItems(removeClosureField, List.FindText(removeClosureField, "Speckle.Core.Models.DataChunk")),

        objectsTable = Table.FromRecords(removeDatachunkRecords)
    in
        objectsTable;

// Data Source Kind description
Speckle = [
    Authentication = [
        Key = [
            KeyLabel="Personal Access Token",
            Label = "Private stream"
        ],
        Implicit = [
            Label = "Public stream"
        ]
    ],
    Label = Extension.LoadString("Speckle Connector")
];

// Data Source UI publishing description
Speckle.Publish = [
    Beta = true,
    Category = "Other",
    ButtonText = { Extension.LoadString("ButtonTitle"), Extension.LoadString("ButtonHelp") },
    LearnMoreUrl = "https://speckle.guide",
    SourceImage = Speckle.Icons,
    SourceTypeImage = Speckle.Icons
];

Speckle.Icons = [
    Icon16 = { Extension.Contents("SpeckleLogo16.png"), Extension.Contents("SpeckleLogo20.png"), Extension.Contents("SpeckleLogo24.png"), Extension.Contents("SpeckleLogo32.png") },
    Icon32 = { Extension.Contents("SpeckleLogo32.png"), Extension.Contents("SpeckleLogo40.png"), Extension.Contents("SpeckleLogo48.png"), Extension.Contents("SpeckleLogo64.png") }
];

// copy and pasted function from microsoft docs since it's not included yet in M standard lib
Table.ToNavigationTable = (
    table as table,
    keyColumns as list,
    nameColumn as text,
    dataColumn as text,
    itemKindColumn as text,
    itemNameColumn as text,
    isLeafColumn as text
) as table =>
    let
        tableType = Value.Type(table),
        newTableType = Type.AddTableKey(tableType, keyColumns, true) meta 
        [
            NavigationTable.NameColumn = nameColumn, 
            NavigationTable.DataColumn = dataColumn,
            NavigationTable.ItemKindColumn = itemKindColumn, 
            Preview.DelayColumn = itemNameColumn, 
            NavigationTable.IsLeafColumn = isLeafColumn
        ],
        navigationTable = Value.ReplaceType(table, newTableType)
    in
        navigationTable;
