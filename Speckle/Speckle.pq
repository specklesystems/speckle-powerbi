section Speckle;

[DataSource.Kind="Speckle",  Publish="Speckle.Publish"]
shared Speckle.Contents = Value.ReplaceType(CommitTable, type function (StreamUrl as Uri.Type) as any);

/* INFO: Variables will not be instantiated (or any code run) until they are used */
shared CommitTable = (url) as table => 
    let
        // Get server and streamId, and branchName / commitId / objectid from the input url
        s = Text.Combine({"https://", Uri.Parts(url)[Host]}),
        server = Speckle.LogToMatomo(s),

        segments = Text.Split(Text.AfterDelimiter(Uri.Parts(url)[Path], "/", 0), "/"),
        streamId = segments{1},
        branchName = if( List.Count(segments) = 4 and segments{2} = "branches" ) then segments{3} else null,
        commitId = if (List.Count(segments) = 4 and segments{2} = "commits" ) then segments{3} else null,
        objectId = if (List.Count(segments) = 4 and segments{2} = "objects" ) then segments{3} else null,
        
        commitTable = if (commitId <> null) then Speckle.GetObjectFromCommit(server, streamId, commitId)
        else if (objectId <> null) then Speckle.GetObjectFromObject(server, streamId, objectId, false)
        else if (branchName <> null) then Speckle.GetObjectFromBranch(server,streamId,branchName)
        else Speckle.GetObjectFromStream(server, streamId)
    in
        commitTable;

Speckle.CommitReceived = (server, streamId, commitId) =>
    let
        app= "PowerBI",
        apiKey = try Extension.CurrentCredential()[Key] otherwise "",
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
                #"Content-Type"="application/json",
                #"Authorization"= if apiKey = null then "" else Text.Format("Bearer #{0}",{apiKey})
			],
            ManualStatusHandling = {400},
			Content=Text.ToBinary("{""query"": ""mutation { commitReceive(input: { streamId: \"""&streamId&"\"", commitId: \"""&commitId&"\"", sourceApplication: \"""&app&"\""}) }""}")		]
		),
		#"JSON" = Json.Document(Source),
        Result = #"JSON"[data][commitReceive]
    in
        if apiKey = "" then [data="skipped"] else [data=Text.From(Result)];

/* Since everything is lazily evaluated, we must join and split the result of the matomo call with the server, and spit back the server url for PowerBI to actually log the calls to Matomo */
Speckle.LogToMatomo = (server) =>
    let
        matomoUrl = "https://speckle.matomo.cloud/matomo.php",
        action = "receive/manual",
        appName = "Power BI",
        userId = "powerBIuser",

        params = [
            idsite = "2",
            rec = "1",
            apiv = "1",
            uid = userId,
            action_name = action,
            url = Text.Combine({"http://connectors/PowerBI/", action}),
            urlref = Text.Combine({"http://connectors/PowerBI/", action}),
            _cvar = Text.FromBinary(Json.FromValue([hostApplication = appName]))
        ],
        visitQuery = Uri.BuildQueryString(params),
        visitRes = Web.Contents(Text.Combine({matomoUrl, "?", visitQuery}),
        [
            Headers=[
                #"Method"="POST"
            ],
            Content=Text.ToBinary(server)
        ]),
        
        eventParams = [
            idsite = "2",
            rec = "1",
            apiv = "1",
            uid = userId,
            _cvar = Text.FromBinary(Json.FromValue([hostApplication = appName])),
            e_c = appName,
            e_a = action
        ],
        eventQuery = Uri.BuildQueryString(eventParams),
        eventRes = Web.Contents(Text.Combine({ matomoUrl, "?", eventQuery}),
        [
            Headers=[
                #"Method"="POST"
            ],
            Content=Text.ToBinary(server)
        ]),
        Result = Text.FromBinary(visitRes) & Text.FromBinary(eventRes),
        Combined = Text.Combine({server,Result},"___"),
        Split = Text.Split(Combined,"___"){0}
    in
        Split;

Speckle.GetObjectFromStream = (server, streamId) => Speckle.GetObjectFromBranch(server, streamId, "main");

Speckle.GetObjectFromBranch = (server, streamId, branchName) => 
    let
        decodedBranchName = Record.Field(Record.Field(Uri.Parts("http://www.dummy.com?A=" & branchName),"Query"),"A"), // Hacky way to decode base64 strings: Put them in a url query param and parse the URL
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $branchName: String!) { stream( id: $streamId ) { branch (name: $branchName ){ commits (limit: 1) { items { id referencedObject } } } } }",
		#"JSON" = Speckle.Api.Fetch(server, query, [streamId=streamId, branchName=decodedBranchName]),
        commit = #"JSON"[stream][branch][commits][items]{0},
        objectsTable = Speckle.GetObjectFromObject(server, streamId, commit[referencedObject], true),
        commitReceivedRes = Speckle.CommitReceived(server, streamId, commit[id])
    in
        if commitReceivedRes[data] = "true" then objectsTable else objectsTable;


shared Speckle.GetObjectFromCommit = (server, streamId, commitId) =>
    let
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $commitId: String!) { stream( id: $streamId ) { commit (id: $commitId){ referencedObject } } }",
        #"JSON" = Speckle.Api.Fetch(server, query, [streamId=streamId, commitId=commitId]),
        objectId = #"JSON"[stream][commit][referencedObject],
        objectsTable = Speckle.GetObjectFromObject(server, streamId, objectId, true),
        commitReceivedRes = Speckle.CommitReceived(server, streamId, commitId)
    in
        if commitReceivedRes[data] = "true" then objectsTable else objectsTable;

Speckle.GetObjectFromObject = (server, streamId, objectId, IsCommitObject) => 
    let
        query = "query($streamId: String!, $objectId: String!) { stream( id: $streamId ) { object (id: $objectId) { children { objects { data } } } } }",
		#"JSON" = Speckle.Api.Fetch(server, query, [streamId=streamId, objectId=objectId]),
        objects = #"JSON"[stream][object][children][objects],

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

Speckle.Api.Fetch = (server, query, optional variables) => 
    let
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,        
        Source = Web.Contents(
		Text.Combine({server, "graphql"}, "/"),
		[
			Headers=[
				#"Method"="POST",
				#"Content-Type"="application/json",
                #"Authorization"= if apiKey = null then "" else Text.Format("Bearer #{0}",{apiKey})
			],
            ManualStatusHandling = {400},
			Content=Json.FromValue([query=Text.From(query),variables=variables])
		]),
		#"JSON" = Json.Document(Source)
    in
        // Check if response contains errors, if so, return first error. 
        if Record.HasFields(#"JSON", {"errors"})
        then error Text.FromBinary(Json.FromValue(#"JSON"[errors]{0}[message]) )
        else #"JSON"[data];

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


