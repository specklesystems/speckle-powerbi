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
shared Speckle.GetByUrl = Value.ReplaceType(GetByUrlImpl, GetByUrlType);

GetByUrlType = type function (
    url as (Uri.Type meta [
        Documentation.FieldCaption = "Stream URL",
        Documentation.FieldDescription = "The url of a stream in a Speckle server. You can copy it directly from your browser.",
        Documentation.SampleValues = {"https://speckle.xyz/streams/23401adf", "https://speckle.xyz/streams/23401adf/branches/main"}
    ])) 
    as table meta [
        Documentation.Name = "Get Stream by URL",
        Documentation.LongDescription = "Returns a flat list of all objects contained in a specific Speckle stream/branch/commit/object.
            Supports all types of stream url:#(lf)
            - Stream: will get the latest commit on the 'main' branch (i.e. 'https://speckle.xyz/streams/STREAM_ID')#(lf)
            - Branch: will get the latest commit on the specified branch (i.e. 'https://speckle.xyz/streams/STREAM_ID/branches/BRANCH_NAME')#(lf)
            - Commit: will get a specific commit from the stream (i.e. 'https://speckle.xyz/streams/STREAM_ID/commits/COMMIT_ID')
        ",
        Documentation.Examples = {[
            Description = "Returns a table with 'Hello world' repeated 2 times",
            Code = "HelloWorldWithDocs.Contents(""Hello world"", 2)"
        ]}
    ];

GetByUrlImpl = (url as text) as table => 
    let
        // Get server and streamId, and branchName / commitId / objectid from the input url
        s = Text.Combine({"https://", Uri.Parts(url)[Host]}),
        server = Speckle.LogToMatomo(s),

        segments = Text.Split(Text.AfterDelimiter(Uri.Parts(url)[Path], "/", 0), "/"),
        streamId = segments{1},
        branchName = if( List.Count(segments) = 4 and segments{2} = "branches" ) then segments{3} else null,
        commitId = if (List.Count(segments) = 4 and segments{2} = "commits" ) then segments{3} else null,
        objectId = if (List.Count(segments) = 4 and segments{2} = "objects" ) then segments{3} else null,
        
        commitTable = 
            if (commitId <> null) 
                then Speckle.GetObjectFromCommit(server, streamId, commitId)
            else if (objectId <> null) 
                then Speckle.GetObjectFromObject(server, streamId, objectId)
            else if (branchName <> null) 
                then Speckle.GetObjectFromBranch(server,streamId,branchName)
            else 
                Speckle.GetObjectFromStream(server, streamId)
    in
        commitTable;


shared Speckle.GetObjectFromStream = (server as text, streamId as text) as table => Speckle.GetObjectFromBranch(server, streamId, "main");

shared Speckle.GetObjectFromBranch = (server as text, streamId as text, branchName as text) as table => 
    let
        x = Speckle.GetByUrl(""),
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
		res = Speckle.Api.Fetch(server, query, [streamId=streamId, branchName=decodedBranchName]),
        branch=res[stream][branch],
        commit = branch[commits][items]{0},
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, commit[referencedObject]),
        rr = Speckle.CommitReceived( server, streamId, commit[id] )
    in
        if branch = null then error Text.Format("The branch #{0} does not exist in stream #{1}",{decodedBranchName, streamId})
        else
            // Force evaluation of read receipt (ideally it should happen after fetching, but can't find a way)
            if rr then objectsTable else objectsTable
        ;

shared Speckle.GetObjectFromCommit = (server as text, streamId as text, commitId as text) as table =>
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
        commit = #"JSON"[stream][commit],
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, commit[referencedObject]),
        rr = Speckle.CommitReceived(server, streamId, commitId)
    in
        if commit = null then error "The commit did not exist on this stream"
        else
            if rr then objectsTable else objectsTable;

shared Speckle.GetObjectFromObject = (server as text, streamId as text, objectId as text, optional limit as number, optional cursor as text) => 
    Speckle.Api.GetAllObjectChildren(server, streamId, objectId, limit, cursor);

Speckle.CleanUpObjects = (objects as list) as list  =>
    let
        // remove closures from records, and remove DataChunk records
        removeClosureField = List.Transform(objects, each Record.RemoveFields(_, "__closure", MissingField.Ignore)),
        removeDatachunkRecords = List.RemoveItems(removeClosureField, List.FindText(removeClosureField, "Speckle.Core.Models.DataChunk"))
    in
        removeDatachunkRecords;

shared Speckle.Api.Fetch = (server as text, query as text, optional variables as record) as record => 
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
        then error #"JSON"[errors]{0}[message]
        else #"JSON"[data];

// Read all pages of data.
// After every page, we check the "nextCursor" record on the metadata of the previous request.
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
    ) meta [server=server, streamId=streamId, objectId=objectId];

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
        query = "mutation($input: CommitReceivedInput!) { 
            commitReceive(input: $input) 
        }",
        variables = [
            input = [
                streamId=streamId,
                commitId=commitId,
                sourceApplication="PowerBI"
            ]
        ] 
    in
        // Read receipts should fail gracefully no matter what
        try Speckle.Api.Fetch(server, query, variables)[commitReceive] otherwise false;

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

