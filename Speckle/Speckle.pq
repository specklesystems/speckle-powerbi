section Speckle;

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

[DataSource.Kind="Speckle",  Publish="Speckle.Publish"]
shared Speckle.Contents = Value.ReplaceType(CommitTable, type function (StreamUrl as Uri.Type) as any);

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
        else if (objectId <> null) then Speckle.GetObjectFromObject(server, streamId, objectId)
        else if (branchName <> null) then Speckle.GetObjectFromBranch(server,streamId,branchName)
        else Speckle.GetObjectFromStream(server, streamId)
    in
        commitTable;

shared Speckle.GetObjectFromStream = (server, streamId) => Speckle.GetObjectFromBranch(server, streamId, "main");

shared Speckle.GetObjectFromBranch = (server, streamId, branchName) => 
    let
        decodedBranchName = Record.Field(Record.Field(Uri.Parts("http://www.dummy.com?A=" & branchName),"Query"),"A"), // Hacky way to decode base64 strings: Put them in a url query param and parse the URL
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $branchName: String!) { 
            stream( id: $streamId ) { 
                branch (name: $branchName ){
                    commits (limit: 1) {
                        items {
                            id
                            referencedObject
                        }
                    }
                }
            }
        }",
		#"JSON" = Speckle.Api.Fetch(server, query, [streamId=streamId, branchName=decodedBranchName]),
        commit = #"JSON"[stream][branch][commits][items]{0},
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, commit[referencedObject]),
        commitReceivedRes = Speckle.CommitReceived(server, streamId, commit[id])
    in
        if commitReceivedRes[data] = "true" then objectsTable else objectsTable;

shared Speckle.GetObjectFromCommit = (server, streamId, commitId) =>
    let
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $commitId: String!) {
            stream( id: $streamId ) {
                commit (id: $commitId) {
                    referencedObject
                }
            }
        }",
        variables = [streamId=streamId, commitId=commitId],
        #"JSON" = Speckle.Api.Fetch(server, query, variables),
        objectId = #"JSON"[stream][commit][referencedObject],
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, objectId),
        commitReceivedRes = Speckle.CommitReceived(server, streamId, commitId)
    in
        if commitReceivedRes[data] = "true" then objectsTable else objectsTable;

shared Speckle.GetObjectFromObject = (server, streamId, objectId, optional limit, optional cursor) => 
    Speckle.Api.GetAllObjectChildren(server, streamId, objectId, limit, cursor);

Speckle.CleanUpObjects = (objects) =>
    let
        // remove closures from records, and remove DataChunk records
        removeClosureField = List.Transform(objects, each Record.RemoveFields(_, "__closure", MissingField.Ignore)),
        removeDatachunkRecords = List.RemoveItems(removeClosureField, List.FindText(removeClosureField, "Speckle.Core.Models.DataChunk"))
    in
        removeDatachunkRecords;

shared Speckle.Api.Fetch = (server, query, optional variables) => 
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

// Read all pages of data.
// After every page, we check the "NextLink" record on the metadata of the previous request.
// Table.GenerateByPage will keep asking for more pages until we return null.
Speckle.Api.GetAllObjectChildren = (server as text, streamId as text, objectId as text, optional cursor as text) as table =>
    Table.GenerateByPage((previous) => 
        let
            // if previous is null, then this is our first page of data
            nextCursor = if (previous = null) then cursor else Value.Metadata(previous)[Cursor]?,
            // if the cursor is null but the prevous page is not, we've reached the end
            page = if (previous <> null and nextCursor = null) then  null else Speckle.Api.GetObjectChildren(server, streamId, objectId, 50, nextCursor)
        in
            page
    );

Speckle.Api.GetObjectChildren = (server as text, streamId as text, objectId as text, optional limit as number, optional cursor as text) => 
    let
        query = "query($streamId: String!, $objectId: String!, $limit: Int, $cursor: String) { 
            stream( id: $streamId ) { 
                object (id: $objectId) { 
                    children(limit: $limit, cursor: $cursor) { 
                        cursor
                        objects { 
                            data 
                        } 
                    } 
                } 
            } 
        }",
		#"JSON" = Speckle.Api.Fetch(server, query, [streamId=streamId, objectId=objectId, limit=limit, cursor=cursor]),
        children = #"JSON"[stream][object][children],
        objects = children[objects],
        nextCursor=children[cursor],
        clean=Speckle.CleanUpObjects(objects)
    in
       Table.FromRecords(clean) meta [Cursor=nextCursor];

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

// The getNextPage function takes a single argument and is expected to return a nullable table
Table.GenerateByPage = (getNextPage as function) as table =>
    let        
        listOfPages = List.Generate(
            () => getNextPage(null),            // get the first page of data
            (lastPage) => lastPage <> null,     // stop when the function returns null
            (lastPage) => getNextPage(lastPage) // pass the previous page to the next function call
        ),
        // concatenate the pages together
        tableOfPages = Table.FromList(listOfPages, Splitter.SplitByNothing(), {"Column1"}),
        firstRow = tableOfPages{0}?
    in
        // if we didn't get back any pages of data, return an empty table
        // otherwise set the table type based on the columns of the first page
        if (firstRow = null) then
            Table.FromRows({})
        else        
            Value.ReplaceType(
                Table.ExpandTableColumn(tableOfPages, "Column1", Table.ColumnNames(firstRow[Column1])),
                Value.Type(firstRow[Column1])
            );

