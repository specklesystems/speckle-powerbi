section Speckle;

Beta = true;
Category = "Other";
Icons = [
    Icon16 = { Extension.Contents("SpeckleLogo16.png"), Extension.Contents("SpeckleLogo20.png"), Extension.Contents("SpeckleLogo24.png"), Extension.Contents("SpeckleLogo32.png") },
    Icon32 = { Extension.Contents("SpeckleLogo32.png"), Extension.Contents("SpeckleLogo40.png"), Extension.Contents("SpeckleLogo48.png"), Extension.Contents("SpeckleLogo64.png") }
];

GetPublish = (key as text) as record => [
    Beta = Beta,
    Category = Category,
    ButtonText = { Extension.LoadString(Text.Format("#{0}.Title", {key})), Extension.LoadString(Text.Format("#{0}.Label",{key})) },
    LearnMoreUrl = "https://speckle.guide",
    SourceImage = Icons,
    SourceTypeImage = Icons
];

Speckle = [
    Authentication = [
        Key = [
            KeyLabel="Personal Access Token",
            Label = "Private stream"
        ],
        Implicit = [
            Label = "Public stream"
        ]
    ]
];

[DataSource.Kind="Speckle", Publish="GetByUrl.Publish"]
shared Speckle.GetByUrl = Value.ReplaceType(GetByUrl.Impl, GetByUrl.Type);

GetByUrl.Publish = GetPublish("GetByUrl");
GetByUrl.Type = type function (
    url as (Uri.Type meta [
        Documentation.FieldCaption = "Stream URL",
        Documentation.FieldDescription = "The url of a stream in a Speckle server. You can copy it directly from your browser.",
        Documentation.SampleValues = {"https://speckle.xyz/streams/23401adf", "https://speckle.xyz/streams/23401adf/branches/main"}
    ])) 
    as table meta [
        Documentation.Name = "Speckle - Get stream by URL",
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
GetByUrl.Impl = (url as text) as table => 
    let
        // Get server and streamId, and branchName / commitId / objectid from the input url
        server = Text.Combine({"https://", Uri.Parts(url)[Host]}),
        segments = Text.Split(Text.AfterDelimiter(Uri.Parts(url)[Path], "/", 0), "/"),
        streamId = segments{1},
        branchName = if( List.Count(segments) = 4 and segments{2} = "branches" ) then segments{3} else null,
        commitId = if (List.Count(segments) = 4 and segments{2} = "commits" ) then segments{3} else null,
        objectId = if (List.Count(segments) = 4 and segments{2} = "objects" ) then segments{3} else null,
        
        urlType = 
            if (commitId <> null) 
                then "Commit"
            else if (objectId <> null) 
                then "Object"
            else if (branchName <> null) 
                then "Branch"
            else 
                "Stream",

        commitObjectsTable = 
            if (commitId <> null) 
                then Speckle.GetObjectFromCommit(server, streamId, commitId)
            else if (objectId <> null) 
                then Speckle.GetObjectFromObject(server, streamId, objectId)
            else if (branchName <> null) 
                then Speckle.GetObjectFromBranch(server,streamId,branchName)
            else 
                Speckle.GetObjectFromStream(server, streamId),

        addStreamUrl = Table.AddColumn(commitObjectsTable, "Stream URL", each server & "/streams/" & streamId),
        addUrlType = Table.AddColumn(addStreamUrl, "URL Type", each urlType),
        addObjectIdCol = Table.AddColumn(addUrlType, "Object ID", each [data][id]),
        addSpeckleTypeCol = Table.AddColumn(addObjectIdCol, "speckle_type", each [data][speckle_type]),
        final = Table.ReorderColumns(addSpeckleTypeCol,{"Stream URL", "URL Type", "Object ID", "speckle_type", "data" })
    in
        Table.RemoveLastN(final, 1);

Speckle.GetObjectFromStream = Value.ReplaceType(GetObjFromStream.Impl, GetObjFromStream.Type);

GetObjFromStream.Publish = [
    Beta = true,
    Category = "Other",
    ButtonText = { Extension.LoadString("GetStream.Title"), Extension.LoadString("GetStream.Label") },
    LearnMoreUrl = "https://speckle.guide",
    SourceImage = Icons,
    SourceTypeImage = Icons
];
GetObjFromStream.Type = type function (
    server as (Text.Type meta [
        Documentation.FieldCaption = "Speckle Server",
        Documentation.FieldDescription = "The Speckle Server to fetch data from",
        Documentation.SampleValues = {"https://speckle.xyz"}
    ]), 
    streamId as (Text.Type meta [
        Documentation.FieldCaption = "Stream ID",
        Documentation.FieldDescription = "The unique ID of the Stream to fetch data from.",
        Documentation.SampleValues = {"8325294b8f"}
    ])) 
    as table meta [
        Documentation.Name = "Speckle - Get stream objects",
        Documentation.LongDescription = "Returns a table of objects contained in the Stream's main branch latest commit.",
        Documentation.Examples = {[
            Description = "Returns all objects in the latest commit of stream https://speckle.xyz",
            Code = "Speckle.GetObjectFromStream(""https://speckle.xyz"", ""8325294b8f"")"
        ]}
    ];
GetObjFromStream.Impl = (server as text, streamId as text) as table => Speckle.GetObjectFromBranch(server, streamId, "main");

Speckle.GetObjectFromBranch = Value.ReplaceType(GetObjFromBranch.Impl, GetObjFromBranch.Type);

GetObjFromBranch.Publish = GetPublish("GetObjFromBranch");
GetObjFromBranch.Type = type function (
    server as (Text.Type meta [
        Documentation.FieldCaption = "Speckle Server",
        Documentation.FieldDescription = "The Speckle Server to fetch data from",
        Documentation.SampleValues = {"https://speckle.xyz"}
    ]), 
    streamId as (Text.Type meta [
        Documentation.FieldCaption = "Stream ID",
        Documentation.FieldDescription = "The unique ID of the Stream to fetch data from.",
        Documentation.SampleValues = {"8325294b8f"}
    ]),
    branchName as (Text.Type meta [
        Documentation.FieldCaption = "Branch name",
        Documentation.FieldDescription = "The name of the branch inside that stream.",
        Documentation.SampleValues = {"main", "some other branch", "branch/with/emoji🚀"}
    ])) 
    as table meta [
        Documentation.Name = "Speckle - Get stream branch objects",
        Documentation.LongDescription = "Returns a table of objects contained in the Stream's specified branch latest commit.",
        Documentation.Examples = {[
            Description = "Returns all objects in the latest commit of the specified branch in stream https://speckle.xyz",
            Code = "Speckle.GetObjectFromStream(""https://speckle.xyz"", ""8325294b8f"")"
        ]}
    ];
GetObjFromBranch.Impl = (server as text, streamId as text, branchName as text) as table => 
    let
        decodedBranchName = Record.Field(Record.Field(Uri.Parts("http://www.dummy.com?" & Uri.BuildQueryString([A=branchName])),"Query"),"A"), // Hacky way to decode base64 strings: Put them in a url query param and parse the URL
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $branchName: String!) { 
            stream( id: $streamId ) { 
                branch (name: $branchName ){
                    commits (limit: 1) {
                        items {
                            id
                            referencedObject
                            sourceApplication
                        }
                    }
                }
            }
        }",
		res = Speckle.Api.Fetch(server, query, [streamId=streamId, branchName=decodedBranchName]),
        branch=res[stream][branch],
        commit = branch[commits][items]{0},
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, commit[referencedObject]),
        rr = Speckle.CommitReceived( server, streamId, commit )
    in
        if branch = null then error Text.Format("The branch '#{0}' does not exist in stream '#{1}'",{decodedBranchName, streamId})
        else if List.Count(branch[commits][items]) = 0 then error Text.Format("The branch '#{0}' in stream #{1} has no commits", { decodedBranchName, streamId })
        else
            // Force evaluation of read receipt (ideally it should happen after fetching, but can't find a way)
            if rr then objectsTable else error "Failed to log receive";


Speckle.GetObjectFromCommit = Value.ReplaceType(GetObjFromCommit.Impl, GetObjFromCommit.Type);

GetObjFromCommit.Publish = GetPublish("GetObjFromCommit");
GetObjFromCommit.Type = type function (
    server as (Text.Type meta [
        Documentation.FieldCaption = "Speckle Server",
        Documentation.FieldDescription = "The Speckle Server to fetch data from",
        Documentation.SampleValues = {"https://speckle.xyz"}
    ]), 
    streamId as (Text.Type meta [
        Documentation.FieldCaption = "Stream ID",
        Documentation.FieldDescription = "The unique ID of the Stream to fetch data from.",
        Documentation.SampleValues = {"8325294b8f"}
    ]),
    commitId as (Text.Type meta [
        Documentation.FieldCaption = "Commit ID",
        Documentation.FieldDescription = "The unique ID of the commit to fetch.",
        Documentation.SampleValues = {"main", "some other branch", "branch/with/emoji🚀"}
    ])) 
    as table meta [
        Documentation.Name = "Speckle - Get stream commit objects",
        Documentation.LongDescription = "Returns a table of objects contained in the Stream's specified commit.",
        Documentation.Examples = {[
            Description = "Returns all objects in the specified commit in stream https://speckle.xyz",
            Code = "Speckle.GetObjectFromCommit(""https://speckle.xyz"", ""8325294b8f"", ""asdfw456a"")"
        ]}
    ];
GetObjFromCommit.Impl = (server as text, streamId as text, commitId as text) as table =>
    let
        apiKey = try Extension.CurrentCredential()[Key] otherwise null,
        query = "query($streamId: String!, $commitId: String!) {
            stream( id: $streamId ) {
                commit (id: $commitId) {
                    id
                    sourceApplication
                    referencedObject
                }
            }
        }",
        variables = [streamId=streamId, commitId=commitId],
        #"JSON" = Speckle.Api.Fetch(server, query, variables),
        commit = #"JSON"[stream][commit],
        objectsTable = Speckle.Api.GetAllObjectChildren(server, streamId, commit[referencedObject]),
        rr = Speckle.CommitReceived(server, streamId, commit)
    in
        if commit = null then error "The commit did not exist on this stream"
        else
            if rr then objectsTable else objectsTable;

Speckle.GetObjectFromObject = (server as text, streamId as text, objectId as text, optional limit as number, optional cursor as text) => 
    Speckle.Api.GetAllObjectChildren(server, streamId, objectId, cursor);

Speckle.CleanUpObjects = (objects as list) as list  =>
    let
        // remove closures from records, and remove DataChunk records 
        removeClosureField = List.Transform(objects, each [data=Record.RemoveFields(_[data],"__closure", MissingField.Ignore)]),
        removeTotals = List.Transform(removeClosureField, each [data=try Record.RemoveFields(_[data], "totalChildrenCount", MissingField.Ignore) otherwise _[data]]),
        removeDatachunkRecords = List.RemoveItems(removeTotals, List.FindText(removeTotals, "Speckle.Core.Models.DataChunk"))
    in
        removeDatachunkRecords;

Speckle.Api.Fetch = (server as text, query as text, optional variables as record) as record => 
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
        nextCursor=children[cursor],
        clean=Speckle.CleanUpObjects(children[objects])
    in
       Table.FromRecords(clean) meta [Cursor=nextCursor];

Speckle.CommitReceived = (server, streamId, commit) =>
    let
        query = "mutation($input: CommitReceivedInput!) {
            commitReceive(input: $input) 
        }",
        variables = [
            input = [
                streamId=streamId,
                commitId=commit[id],
                sourceApplication="PowerBI"
            ]
        ],
        s = Speckle.LogEvent(server, commit)
    in
        // Read receipts should fail gracefully no matter what
        try Speckle.Api.Fetch(s, query, variables)[commitReceive] otherwise false;

shared Speckle.Api.GetUser = (server) =>
    let
        query = "query {
            user { email }
        }",
        res = Speckle.Api.Fetch(server, query)
    in
        // Read receipts should fail gracefully no matter what
        try res[user][email] otherwise "hey";


shared Hash = (Value as text) =>
    let
      Solution = Binary.ToText(
        Binary.FromList(
          Binary.ToList(
            Binary.Compress( Text.ToBinary(Value, BinaryEncoding.Base64), Compression.GZip))))
    in
      if Value = null then null else Solution;

Speckle.GetApplicationSlug = (appName as text) =>
  let
    replaced = Text.Replace(appName, " ", ""),
    name = Text.Lower(replaced)
  in
    if Text.Contains(name, "dynamo") then "dynamo" else
    if Text.Contains(name, "revit") then "revit" else
    if Text.Contains(name, "autocad") then "autocad" else
    if Text.Contains(name, "civil") then "civil" else
    if Text.Contains(name, "rhino") then "rhino" else
    if Text.Contains(name, "grasshopper") then "grasshopper" else
    if Text.Contains(name, "unity") then "unity" else
    if Text.Contains(name, "gsa") then "gsa" else
    if Text.Contains(name, "microstation") then "microstation" else
    if Text.Contains(name, "openroads") then "openroads" else
    if Text.Contains(name, "openrail") then "openrail" else
    if Text.Contains(name, "openbuildings") then "openbuildings" else
    if Text.Contains(name, "etabs") then "etabs" else
    if Text.Contains(name, "sap") then "sap" else
    if Text.Contains(name, "csibridge") then "csibridge" else
    if Text.Contains(name, "safe") then "safe" else
    if Text.Contains(name, "teklastructures") then "teklastructures" else
    if Text.Contains(name, "dxf") then "dxf" else
    if Text.Contains(name, "excel") then "excel" else
    if Text.Contains(name, "unreal") then "unreal" else
    if Text.Contains(name, "powerbi") then "powerbi" else
    if Text.Contains(name, "blender") then "blender" else
    if Text.Contains(name, "qgis") then "qgis" else
    if Text.Contains(name, "arcgis") then "arcgis" else
    if Text.Contains(name, "sketchup") then "sketchup" else
    if Text.Contains(name, "archicad") then "archicad" else
    if Text.Contains(name, "topsolid") then "topsolid" else
    if Text.Contains(name, "python") then "python" else
    if Text.Contains(name, "net") then "net" else "other";

/* Since everything is lazily evaluated, we must join and split the result of the matomo call with the server, and spit back the server url for PowerBI to actually log the calls to Matomo */
shared Speckle.LogEvent = (server as text, commit as any) =>
    let
        trackUrl = "https://analytics.speckle.systems/track?ip=1",
        user = Speckle.Api.GetUser(server),
        body = [
          event = "Receive",
          properties = [
            server_id = Hash(server),
            token = "acd87c5a50b56df91a795e999812a3a4",
            hostApp = "powerbi",
            sourceHostApp = Speckle.GetApplicationSlug(commit[sourceApplication]),
            sourceHostAppVersion = commit[sourceApplication]
          ]
        ],
        Result = Web.Contents(trackUrl,
        [
            Headers=[
                #"Method"="POST",
                #"Accept"="text/plain",
                #"Content-Type" = "application/json"
            ],
            Content=Text.ToBinary(Text.Combine({"data=", Text.FromBinary(Json.FromValue(body))}))
        ]),

        // Hack to force execution
        Join = Text.Combine({ server, Text.From(Json.Document(Result))}, "_____"),
        Disjoin = Text.Split(Join,"_____"){0}
    in
        Disjoin; // Skip when no user is found (i.e. no credentials)

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

