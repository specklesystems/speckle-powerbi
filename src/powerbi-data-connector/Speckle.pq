[Version = "3.0.0"]
section Speckle;

AuthAppId = "spklpwerbi";
AuthAppSecret = "spklpwerbi";

// function to load `pqm` files - this is essential and must be kept
shared Speckle.LoadFunction = (fileName as text) =>
    let
        binary = Extension.Contents(fileName),
        asText = Text.FromBinary(binary)
    in
        try
            Expression.Evaluate(asText, #shared)
        catch (e) =>
            error
                [
                    Reason = "Speckle.LoadFunction Failure",
                    Message.Format = "Loading '#{0}' failed - '#{1}': '#{2}'",
                    Message.Parameters = {fileName, e[Reason], e[Message]},
                    Detail = [File = fileName, Error = e]
                ];

// here we register the functions to expose them globally
[DataSource.Kind = "Speckle"]
shared Speckle.Parser = Value.ReplaceType(
    Speckle.LoadFunction("Parser.pqm"), 
    type function (url as Uri.Type) as record
);

[DataSource.Kind = "Speckle"]
shared Speckle.Api.Fetch = Value.ReplaceType(
    Speckle.LoadFunction("Api.Fetch.pqm"), 
    type function (url as Uri.Type, optional query as text, optional variables as record) as record
);

[DataSource.Kind = "Speckle"]
shared Speckle.CheckPermissions = Value.ReplaceType(
    Speckle.LoadFunction("CheckPermissions.pqm"),
    type function (url as Uri.Type) as record
);

[DataSource.Kind = "Speckle"]
shared Speckle.GetUser = Value.ReplaceType(
    Speckle.LoadFunction("GetUser.pqm"), 
    type function (url as Uri.Type) as record
);

[DataSource.Kind = "Speckle"]
shared Speckle.GetModel = Value.ReplaceType(
    Speckle.LoadFunction("GetModel.pqm"),
    type function (url as Uri.Type) as record
);

[DataSource.Kind = "Speckle"]
shared Speckle.GetStructuredData = Value.ReplaceType(
    Speckle.LoadFunction("GetStructuredData.pqm"),
    type function (url as Uri.Type) as table
);

[DataSource.Kind = "Speckle"]
shared Speckle.SendToServer = Value.ReplaceType(
    Speckle.LoadFunction("SendToServer.pqm"),
    type function (url as Uri.Type) as table
);

[DataSource.Kind = "Speckle", Publish="GetByUrl.Publish"]
shared Speckle.GetByUrl = Value.ReplaceType(
    Speckle.LoadFunction("GetByUrl.pqm"),
    type function (
        url as (
            Uri.Type meta [
                Documentation.FieldCaption = "Speckle Model URL",
                Documentation.FieldDescription = "The URL of a model in a Speckle server project. You can copy it directly from your browser.",
                Documentation.SampleValues = {"https://app.speckle.systems/projects/7902de1f57/models/7f890a65df"}
            ]
        )
    ) as table meta [
        Documentation.Name = "Speckle - Get Data by URL",
        Documentation.DisplayName = "Speckle - Get Data by URL",
        Documentation.LongDescription = "Returns structured data from a Speckle model URL.#(lf)
            Supports the following URL formats:#(lf)
            - Model URL: Gets the latest version of the specified model#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID')#(lf)
            - Version URL: Gets a specific version from the project#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID@VERSION_ID')"
    ]
);

shared Speckle.Revit.Parameters.ToNameValueRecord = (r as record, optional exclude as list) as record =>
    let
        defaultExclude = {"id", "speckle_type", "applicationId", "totalChildrenCount"},
        fullExclusion = if exclude = null then defaultExclude else List.Union(defaultExclude, exclude),
        clean = Record.RemoveFields(r, fullExclusion, MissingField.Ignore),
        recTable = Record.ToTable(clean),
        cleanTable = Table.RemoveColumns(recTable, "Name"),
        expanded = Table.ExpandRecordColumn(
            cleanTable, "Value", {"name", "value", "applicationInternalName"}, {"Name", "Value", "UID"}
        ),
        joined = Table.AddColumn(expanded, "Combo", each [Name] & " [" & [UID] & "]"),
        renamed = Table.RenameColumns(joined, {{"Name", "x"}, {"Combo", "Name"}}),
        result = Record.FromTable(renamed)
    in
        result;

// here we register the GetByUrl function to power bi ui
GetByUrl.Publish = [
    Cateogry = "Other",
    ButtonText = {"Connect to Speckle"},
    LearnMoreUrl = "https://speckle.guide/user/powerbi/introduction.html",
    SourceImage = GetByUrl.Icons,
    SourceTypeImage = GetByUrl.Icons
];

GetByUrl.Icons = [
    Icon16 = { Extension.Contents("SpeckleLogo16.png"), Extension.Contents("SpeckleLogo20.png"), Extension.Contents("SpeckleLogo24.png"), Extension.Contents("SpeckleLogo32.png") },
    Icon32 = { Extension.Contents("SpeckleLogo32.png"), Extension.Contents("SpeckleLogo40.png"), Extension.Contents("SpeckleLogo48.png"), Extension.Contents("SpeckleLogo64.png") }
];


// The data source definition
Speckle = [
    // This is used when running the connector on an on-premises data gateway
    TestConnection = (path) => {"Speckle.GetUser", path},
    // Authentication strategy
    Authentication = [
        OAuth = [
            Label = "Speckle Account",
            StartLogin = (clientApplication, dataSourcePath, state, display) =>
                let
                    server = Text.Combine(
                        {Uri.Parts(dataSourcePath)[Scheme], "://", Uri.Parts(dataSourcePath)[Host]}
                    )
                in
                    [
                        LoginUri = Text.Combine({server, "authn", "verify", AuthAppId, state}, "/"),
                        CallbackUri = "https://oauth.powerbi.com/views/oauthredirect.html",
                        WindowHeight = 800,
                        WindowWidth = 600,
                        Context = null
                    ],
            FinishLogin = (clientApplication, dataSourcePath, context, callbackUri, state) =>
                let
                    server = Text.Combine(
                        {Uri.Parts(dataSourcePath)[Scheme], "://", Uri.Parts(dataSourcePath)[Host]}
                    ),
                    Parts = Uri.Parts(callbackUri)[Query],
                    Source = Web.Contents(
                        Text.Combine({server, "auth", "token"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue(
                                [
                                    accessCode = Parts[access_code],
                                    appId = AuthAppId,
                                    appSecret = AuthAppSecret,
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
                    server = Text.Combine(
                        {Uri.Parts(dataSourcePath)[Scheme], "://", Uri.Parts(dataSourcePath)[Host]}
                    ),
                    Source = Web.Contents(
                        Text.Combine({server, "auth", "token"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue(
                                [
                                    refreshToken = refreshToken,
                                    appId = AuthAppId,
                                    appSecret = AuthAppSecret
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
                    ]
        ],
        Key = [
            KeyLabel = "Personal Access Token",
            Label = "Private Project"
        ],
        Implicit = [
            Label = "Public Project"
        ]
    ],
    Label = "Speckle"
];
