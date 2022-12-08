[Version = "2.0.0"]
section Speckle;

// The data source definition, used when connecting to any speckle server
Speckle = [
    // This is used when running the connector on an on-premises data gateway
    TestConnection = (path) => {"Speckle.Api.GetUser", path},
    // This is the custom authentication strategy for our Connector
    Authentication = [
        OAuth = [
            Label = "Speckle Login",
            StartLogin = (clientApplication, dataSourcePath, state, display) =>
                [
                    LoginUri = Text.Combine({"https://latest.speckle.dev/authn/verify", "1ea917e25a", state}, "/"),
                    CallbackUri = "https://oauth.powerbi.com/views/oauthredirect.html",
                    WindowHeight = 800,
                    WindowWidth = 600,
                    Context = null
                ],
            FinishLogin = (clientApplication, dataSourcePath, context, callbackUri, state) =>
                let
                    Parts = Uri.Parts(callbackUri)[Query],
                    Source = Web.Contents(
                        Text.Combine({"https://latest.speckle.dev", "auth", "token"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue(
                                [
                                    accessCode = Parts[access_code],
                                    appId = "1ea917e25a",
                                    appSecret = "7d1cb26028",
                                    challenge = state
                                ]
                            )
                        ]
                    ),
                    json = Json.Document(Source)
                in
                    [
                        access_token = json[token],
                        scope = null,
                        token_type = "bearer",
                        refresh_token = json[refreshToken]
                    ],
            Refresh = (dataSourcePath, refreshToken) =>
                let
                    Source = Web.Contents(
                        Text.Combine({"https://latest.speckle.dev", "auth", "token"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue(
                                [
                                    refreshToken = refreshToken,
                                    appId = "1ea917e25a",
                                    appSecret = "7d1cb26028"
                                ]
                            )
                        ]
                    ),
                    json = Json.Document(Source)
                in
                    [
                        access_token = json[token],
                        scope = null,
                        token_type = "bearer",
                        refresh_token = json[refreshToken]
                    ],
            Logout = (clientApplication, dataSourcePath, accessToken) =>
                let
                    Source = Web.Contents(
                        Text.Combine({"https://latest.speckle.dev", "auth", "logout"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue([
                                token = accessToken
                            ])
                        ]
                    ),
                    json = Json.Document(Source)
                in
                    json
        ],
        Key = [
            KeyLabel = "Personal Access Token",
            Label = "Private stream"
        ],
        Implicit = [
            Label = "Public stream"
        ]
    ],
    Label = "Speckle"
];

// Gets the object referenced by a specific speckle URL
[DataSource.Kind = "Speckle", Publish = "Get.ByUrl.Publish"]
shared Speckle.Get.ByUrl = Value.ReplaceType(
    Speckle.LoadFunction("Get.ByUrl.pqm"),
    type function (
        url as (
            Uri.Type meta [
                Documentation.FieldCaption = "Gets a Speckle Object preserving it's structure",
                Documentation.FieldDescription = "The url of a stream in a Speckle server. You can copy it directly from your browser.",
                Documentation.SampleValues = {
                    "https://speckle.xyz/streams/23401adf",
                    "https://speckle.xyz/streams/23401adf/branches/main"
                }
            ]
        )
    ) as record meta [
        Documentation.Name = "Speckle - Get Structured Object by URL",
        Documentation.LongDescription = "Returns the Speckle object the URL points to, while also preserving it's structure.
            Supports all types of stream url:#(lf)
            - Stream: will get the latest commit on the 'main' branch (i.e. 'https://speckle.xyz/streams/STREAM_ID')#(lf)
            - Branch: will get the latest commit on the specified branch (i.e. 'https://speckle.xyz/streams/STREAM_ID/branches/BRANCH_NAME')#(lf)
            - Commit: will get a specific commit from the stream (i.e. 'https://speckle.xyz/streams/STREAM_ID/commits/COMMIT_ID')
        "
    ]
);

[DataSource.Kind = "Speckle", Publish = "NavTable.Publish"]
shared Speckle.GetObjectAsNavTable = Value.ReplaceType(
    NavigationTable.Simple, type function (url as Uri.Type) as table
);

// Get's a flat list of speckle objects from a URL
[DataSource.Kind = "Speckle", Publish = "GetByUrl.Publish"]
shared Speckle.GetByUrl = Value.ReplaceType(
    Speckle.LoadFunction("GetByUrl.pqm"),
    type function (
        url as (
            Uri.Type meta [
                Documentation.FieldCaption = "Stream URL",
                Documentation.FieldDescription = "The url of a stream in a Speckle server. You can copy it directly from your browser.",
                Documentation.SampleValues = {
                    "https://speckle.xyz/streams/23401adf",
                    "https://speckle.xyz/streams/23401adf/branches/main"
                }
            ]
        )
    ) as table meta [
        Documentation.Name = "Speckle - Get stream by URL",
        Documentation.LongDescription = "Returns a flat list of all objects contained in a specific Speckle stream/branch/commit/object.
            Supports all types of stream url:#(lf)
            - Stream: will get the latest commit on the 'main' branch (i.e. 'https://speckle.xyz/streams/STREAM_ID')#(lf)
            - Branch: will get the latest commit on the specified branch (i.e. 'https://speckle.xyz/streams/STREAM_ID/branches/BRANCH_NAME')#(lf)
            - Commit: will get a specific commit from the stream (i.e. 'https://speckle.xyz/streams/STREAM_ID/commits/COMMIT_ID')
        "
    ]
);

// Gets the current authenticated user, if any
[DataSource.Kind = "Speckle"]
shared Speckle.Api.GetUser = Value.ReplaceType(
    Speckle.LoadFunction("Api.GetUser.pqm"), type function (url as Uri.Type) as record
);

// Generic fetch function to our GraphQL endpoint
[DataSource.Kind = "Speckle"]
shared Speckle.Api.Fetch = Value.ReplaceType(
    Speckle.LoadFunction("Api.Fetch.pqm"),
    type function (url as Uri.Type, optional query as text, optional variables as record) as record
);

// Parses a stream url and returns a record with the type and values
shared Speckle.ParseUrl = Speckle.LoadFunction("ParseStreamUrl.pqm");

[DataSource.Kind = "Speckle"]
shared Speckle.Api.REST.GetObject = Value.ReplaceType(
    Speckle.LoadFunction("Api.REST.GetObject.pqm"),
    type function (url as Uri.Type, optional streamId as text, optional objectId as text) as list
);

Get.ByUrl.Publish = GetPublish("GetStream");

NavTable.Publish = GetPublish("GetObjectAsNavTable");

GetByUrl.Publish = GetPublish("GetByUrl");

GetPublish = Speckle.LoadFunction("GetPublish.pqm");

// Navigation table utility function
Table.ToNavigationTable = Speckle.LoadFunction("Table.ToNavigationTable.pqm");

// Function to load `pqm` files
shared Speckle.LoadFunction = (fileName as text) =>
    let
        binary = Extension.Contents(fileName), asText = Text.FromBinary(binary)
    in
        try
            Expression.Evaluate(asText, #shared) catch (e) =>
                error
                    [
                        Reason = "Speckle.LoadFunction Failure",
                        Message.Format = "Loading '#{0}' failed - '#{1}': '#{2}'",
                        Message.Parameters = {fileName, e[Reason], e[Message]},
                        Detail = [File = fileName, Error = e]
                    ];

//HACK: Test functions for nav table stuff
NavigationTable.Simple = (url as text) =>
    let
        objects = #table(
            {"Name", "Key", "Data", "ItemKind", "ItemName", "IsLeaf"},
            {
                {"Item1", "item1", #table({"Column1"}, {{"Item1"}}), "Table", "Table", true},
                {"Item2", "item2", #table({"Column1"}, {{"Item2"}}), "Table", "Table", true},
                {"Item3", "item3", FunctionCallThatReturnsATable(), "Table", "Table", true},
                {url, "myfunction", FunctionCallThatReturnsATable, "Function", "Function", true}
            }
        ),
        NavTable = Table.ToNavigationTable(objects, {"Key"}, "Name", "Data", "ItemKind", "ItemName", "IsLeaf")
    in
        NavTable;

FunctionCallThatReturnsATable = () => #table({"DynamicColumn"}, {{"Dynamic Value"}});
CreateNavTable = (message as text) as table =>
    let
        objects = #table(
            {"Name", "Key", "Data", "ItemKind", "ItemName", "IsLeaf"},
            {
                {"Item1", "item1", #table({"Column1"}, {{message}}), "Table", "Table", true},
                {"Item2", "item2", #table({"Column1"}, {{message}}), "Table", "Table", true}
            }
        ),
        NavTable = Table.ToNavigationTable(objects, {"Key"}, "Name", "Data", "ItemKind", "ItemName", "IsLeaf")
    in
        NavTable;
