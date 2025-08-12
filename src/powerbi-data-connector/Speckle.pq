[Version = "3.0.0"]
section Speckle;

AuthAppId = "spklpwerbi";
AuthAppSecret = "spklpwerbi";

// PKCE helper functions for enhanced OAuth2 security
Base64UrlEncode = (binaryData as binary) =>
    let
        // Convert binary to base64
        base64 = Binary.ToText(binaryData, BinaryEncoding.Base64),
        // Convert to base64url by replacing characters and removing padding
        base64url = Text.Replace(Text.Replace(Text.Replace(base64, "+", "-"), "/", "_"), "=", "")
    in
        base64url;

GeneratePKCEVerifier = () =>
    let
        // Generate cryptographically secure random string using allowed characters
        // RFC 7636: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
        allowedChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~",
        
        // Generate multiple GUIDs to create entropy
        guid1 = Text.Replace(Text.Replace(Text.NewGuid(), "-", ""), "{", ""),
        guid2 = Text.Replace(Text.Replace(Text.NewGuid(), "-", ""), "}", ""),
        guid3 = Text.Replace(Text.Replace(Text.NewGuid(), "-", ""), "{", ""),
        guid4 = Text.Replace(Text.Replace(Text.NewGuid(), "-", ""), "}", ""),
        
        // Combine and convert to allowed characters
        combined = guid1 & guid2 & guid3 & guid4,
        
        // Map hex characters to allowed PKCE characters
        mapped = Text.Replace(
            Text.Replace(
                Text.Replace(
                    Text.Replace(
                        Text.Replace(
                            Text.Replace(combined, "0", "A"),
                            "1", "B"),
                        "2", "C"),
                    "3", "D"),
                "4", "E"),
            "5", "F"),
        
        // Continue mapping remaining hex chars to allowed chars
        verifier = Text.Replace(
            Text.Replace(
                Text.Replace(
                    Text.Replace(
                        Text.Replace(
                            Text.Replace(
                                Text.Replace(
                                    Text.Replace(
                                        Text.Replace(
                                            Text.Replace(mapped, "6", "G"),
                                            "7", "H"),
                                        "8", "I"),
                                    "9", "J"),
                                "a", "K"),
                            "b", "L"),
                        "c", "M"),
                    "d", "N"),
                "e", "O"),
            "f", "P"),
        
        // Ensure length is between 43-128 characters as per RFC 7636
        finalVerifier = Text.Start(verifier, 43)
    in
        finalVerifier;

GeneratePKCEChallenge = (verifier as text) =>
    let
        // Create SHA256 hash of the verifier as required by RFC 7636
        hash = Crypto.CreateHash(CryptoAlgorithm.SHA256, Text.ToBinary(verifier, TextEncoding.Ascii)),
        // Convert to base64url encoding
        challenge = Base64UrlEncode(hash)
    in
        challenge;

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

shared Speckle.GetVersion = Value.ReplaceType(
    Speckle.LoadFunction("GetVersion.pqm"),
    type function () as text
);

[DataSource.Kind = "Speckle"]
shared Speckle.SendToServer = Value.ReplaceType(
    Speckle.LoadFunction("SendToServer.pqm"),
    type function (url as Uri.Type) as table
);

[DataSource.Kind = "Speckle"]
shared Speckle.GetWorkspace = Value.ReplaceType(
    Speckle.LoadFunction("GetWorkspace.pqm"),
    type function (url as Uri.Type) as record
);

shared Speckle.Objects.Properties = Value.ReplaceType(
    Speckle.LoadFunction("Objects.Properties.pqm"),
    type function (inputRecord as any, optional filterKeys as list, optional parentPath as text, optional existingFields as list) as record
);


shared Speckle.Utils.ExpandRecord = Value.ReplaceType(
    Speckle.LoadFunction("Utils.ExpandRecord.pqm"),
    type function (
        table as table,
        columnName as text,
        optional FieldNames as list,
        optional UseCombinedNames as logical
    ) as table
);

shared Speckle.Objects.Collections = Value.ReplaceType(
    Speckle.LoadFunction("Objects.Collections.pqm"),
    type function (inputData as table) as table
);

shared Speckle.Objects.CompositeStructure = Value.ReplaceType(
    Speckle.LoadFunction("Objects.CompositeStructure.pqm"),
    type function (objectRecord as record, optional outputAsList as nullable logical) as any
);

shared Speckle.Objects.MaterialQuantities = Value.ReplaceType(
    Speckle.LoadFunction("Objects.MaterialQuantities.pqm"),
    type function (objectRecord as record, optional outputAsList as logical) as any
);

shared Speckle.Models.Federate = Value.ReplaceType(
    Speckle.LoadFunction("Models.Federate.pqm"),
    type function (tables as list, optional excludeData as logical) as table
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
                    ),
                    // Generate PKCE parameters for enhanced security
                    codeVerifier = GeneratePKCEVerifier(),
                    codeChallenge = GeneratePKCEChallenge(codeVerifier),
                    // Build authorization URL with PKCE parameters
                    authUrl = Text.Combine({server, "authn", "verify", AuthAppId, state}, "/") &
                        "?code_challenge=" & codeChallenge &
                        "&code_challenge_method=S256"
                in
                    [
                        LoginUri = authUrl,
                        CallbackUri = "https://oauth.powerbi.com/views/oauthredirect.html",
                        WindowHeight = 800,
                        WindowWidth = 600,
                        Context = [code_verifier = codeVerifier]
                    ],
            FinishLogin = (clientApplication, dataSourcePath, context, callbackUri, state) =>
                let
                    server = Text.Combine(
                        {Uri.Parts(dataSourcePath)[Scheme], "://", Uri.Parts(dataSourcePath)[Host]}
                    ),
                    Parts = Uri.Parts(callbackUri)[Query],
                    // Extract code verifier from context for PKCE
                    codeVerifier = if context <> null then context[code_verifier] else null,
                    // Build token request with PKCE parameters
                    tokenRequest = [
                        accessCode = Parts[access_code],
                        appId = AuthAppId,
                        appSecret = AuthAppSecret,
                        challenge = state
                    ] & (if codeVerifier <> null then [code_verifier = codeVerifier] else []),
                    Source = Web.Contents(
                        Text.Combine({server, "auth", "token"}, "/"),
                        [
                            Headers = [
                                #"Content-Type" = "application/json"
                            ],
                            Content = Json.FromValue(tokenRequest)
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
                    // Enhanced refresh with error handling for gateway compatibility
                    Source = try Web.Contents(
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
                            ),
                            ManualStatusHandling = {400, 401, 403, 500, 502, 503, 504}
                        ]
                    ) otherwise null,
                    
                    // Check if request was successful
                    IsSuccess = Source <> null,
                    
                    // If successful, parse the response
                    json = if IsSuccess then
                        try Json.Document(Source) otherwise null
                    else
                        null,
                    
                    // Validate the response contains expected fields
                    IsValidResponse = json <> null and Record.HasFields(json, {"token"}),
                    
                    // Return result with enhanced error handling
                    result = if IsValidResponse then
                        [
                            access_token = json[token],
                            scope = null,
                            token_type = "bearer",
                            refresh_token = json[refreshToken]
                        ]
                    else
                        error [
                            Reason = "TokenRefreshFailed",
                            Message = "Failed to refresh OAuth token - please re-authenticate",
                            Detail = [
                                Server = server,
                                RefreshToken = if refreshToken = null then "null" else "present"
                            ]
                        ]
                in
                    result
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
