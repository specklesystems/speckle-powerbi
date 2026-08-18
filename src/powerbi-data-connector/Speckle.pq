[Version = "4.0.0"]
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
        hash = Crypto.CreateHash(CryptoAlgorithm.SHA256, Text.ToBinary(verifier, TextEncoding.Utf8)),
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

// LEGACY PATH exports — 3.x public interfaces preserved (ENG-9165). The impl
// files accept an optional pre-exchanged token for internal reuse; the exports
// keep the 3.x single-parameter arity existing reports were built against.
GetStructuredData.Impl = Speckle.LoadFunction("GetStructuredData.pqm");

[DataSource.Kind = "Speckle"]
shared Speckle.GetStructuredData = Value.ReplaceType(
    (url as text) as table => GetStructuredData.Impl(url),
    type function (url as Uri.Type) as table meta [
        Documentation.LongDescription = "3.x compatibility: returns the flat objects table built from the version's JSON representation. Versions published as 4.0 artifact-only have no JSON representation — load those with Speckle.GetTables instead."
    ]
);

SendToServer.Impl = Speckle.LoadFunction("SendToServer.pqm");

// 3.x exported this as `as table` although the runtime value is the raw object
// list — kept verbatim so existing queries observe the identical contract
[DataSource.Kind = "Speckle"]
shared Speckle.SendToServer = Value.ReplaceType(
    (url as text) => SendToServer.Impl(url),
    type function (url as Uri.Type) as table meta [
        Documentation.LongDescription = "3.x compatibility: downloads the version's raw JSON object tree. Versions published as 4.0 artifact-only have no JSON representation — load those with Speckle.GetTables instead."
    ]
);

// 3.x compatibility: reports the connector version parsed from Speckle.pq
shared Speckle.GetVersion = Value.ReplaceType(
    Speckle.LoadFunction("GetVersion.pqm"),
    type function () as text meta [
        Documentation.LongDescription = "Returns the Speckle connector version string."
    ]
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

// 3.x compatibility data-shaping helpers (ENG-9165). They expect the flat
// table/record shapes returned by Speckle.GetByUrl and do NOT operate on the
// Speckle.GetTables star-schema tables.
LegacyHelperScope = "3.x compatibility helper: expects the flat shapes returned by Speckle.GetByUrl. It does not operate on Speckle.GetTables star-schema tables.";

shared Speckle.Objects.Collections = Value.ReplaceType(
    Speckle.LoadFunction("Objects.Collections.pqm"),
    type function (inputData as table) as table meta [
        Documentation.LongDescription = "Extracts the collection structure from a Speckle objects table. " & LegacyHelperScope
    ]
);

shared Speckle.Objects.CompositeStructure = Value.ReplaceType(
    Speckle.LoadFunction("Objects.CompositeStructure.pqm"),
    type function (objectRecord as record, optional outputAsList as nullable logical) as any meta [
        Documentation.LongDescription = "Extracts the composite structure of a Speckle object record. " & LegacyHelperScope
    ]
);

shared Speckle.Objects.MaterialQuantities = Value.ReplaceType(
    Speckle.LoadFunction("Objects.MaterialQuantities.pqm"),
    type function (objectRecord as record, optional outputAsList as logical) as any meta [
        Documentation.LongDescription = "Extracts material quantities from a Speckle object record. " & LegacyHelperScope
    ]
);

shared Speckle.Models.Federate = Value.ReplaceType(
    Speckle.LoadFunction("Models.Federate.pqm"),
    type function (tables as list, optional excludeData as logical) as table meta [
        Documentation.LongDescription = "Combines multiple Speckle model tables into one federated table. " & LegacyHelperScope
    ]
);

shared Speckle.Models.MaterialQuantities = Value.ReplaceType(
    Speckle.LoadFunction("Models.MaterialQuantities.pqm"),
    type function (inputTable as table, optional addPrefix as logical) as table meta [
        Documentation.LongDescription = "Extracts material quantities from a Speckle model table. " & LegacyHelperScope
    ]
);

[DataSource.Kind = "Speckle"]
shared Speckle.Project.Issues = Value.ReplaceType(
    Speckle.LoadFunction("Project.Issues.pqm"),
    type function (url as Uri.Type, optional getReplies as logical) as table meta [
        Documentation.LongDescription = "Returns the discussion threads of a Speckle project (3.x compatibility). Independent of both the Speckle.GetByUrl and Speckle.GetTables data paths."
    ]
);

shared Speckle.Revit.Parameters.ToNameValueRecord = Value.ReplaceType(
    (r as record, optional exclude as list) as record =>
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
            result,
    type function (r as record, optional exclude as list) as record meta [
        Documentation.LongDescription = "Flattens a Revit parameters record into name/value pairs. " & LegacyHelperScope
    ]
);

// LEGACY entry point (ENG-9165): Speckle.GetByUrl keeps its full 3.x contract —
// signature, flat objects table, nested data/properties records, real object
// hashes and Model Info blob — reading the version's JSON representation only.
// Deliberately NOT published: it must keep evaluating inside existing reports,
// but new reports should find only Speckle.GetTables in the Get Data search.
GetByUrl.Impl = Speckle.LoadFunction("GetByUrl.pqm");

[DataSource.Kind = "Speckle"]
shared Speckle.GetByUrl = Value.ReplaceType(
    GetByUrl.Impl,
    type function (
        url as (
            Uri.Type meta [
                Documentation.FieldCaption = "Speckle Model URL",
                Documentation.FieldDescription = "The URL of a model in a Speckle server project. You can copy it directly from your browser.",
                Documentation.SampleValues = {"https://app.speckle.systems/projects/7902de1f57/models/7f890a65df"}
            ]
        ),
        optional ExpandProperties as (
            type logical meta [
                Documentation.FieldCaption = "Expand Properties (may slow query)",
                Documentation.FieldDescription = "Expand the properties column into individual columns for easier analysis. When checked, each property from the 'properties' record column will have its own column. This can slow down the query if you have a lot of properties.",
                Documentation.AllowedValues = {true, false}
            ]
        )
    ) as table meta [
        Documentation.Name = "Speckle - Get Data by URL",
        Documentation.DisplayName = "Speckle - Get Data by URL",
        Documentation.LongDescription = "Returns structured data from a Speckle model URL.#(lf)
            Reads the version's JSON representation (the 3.x contract used by existing reports and the legacy 3D visual).#(lf)
            Versions published as 4.0 artifact-only have no JSON representation — load those with Speckle.GetTables.#(lf)
            Supports the following URL formats:#(lf)
            - Model URL: Gets the latest version of the specified model#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID')#(lf)
            - Version URL: Gets a specific version from the project#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID@VERSION_ID')#(lf)
            - Federated Model URL: Gets multiple models from the project#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID1,MODEL_ID2')#(lf)
            - Project-Wide Model Load URL: Resolves the project's flat model collection during refresh#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/all')"
    ]
);

// ARTIFACT entry point (ENG-9165): the 4.0 star schema, reading artifact
// bundles only — Speckle.GetTables exposes the navigation table
GetTables.Impl = Speckle.LoadFunction("GetTables.pqm");

[DataSource.Kind = "Speckle", Publish="GetTables.Publish"]
shared Speckle.GetTables = Value.ReplaceType(
    (url as text) as table => GetTables.Impl(url),
    type function (
        url as (
            Uri.Type meta [
                Documentation.FieldCaption = "Speckle Model URL",
                Documentation.FieldDescription = "The URL of a model in a Speckle server project. You can copy it directly from your browser.",
                Documentation.SampleValues = {"https://app.speckle.systems/projects/7902de1f57/models/7f890a65df"}
            ]
        )
    ) as table meta [
        Documentation.Name = "Speckle - Get Tables",
        Documentation.DisplayName = "Speckle - Get Tables",
        Documentation.LongDescription = "Returns the model data from the version's 4.0 artifact bundle. The Navigator lists four entries:#(lf)
            - Objects (object_key, Application ID, model_key) — the object identifiers for the Speckle 4.0 3D visual#(lf)
            - Models (Model Info, model_key) — a single row carrying the model payload; relate Objects[model_key] many-to-one to Models[model_key] (usually autodetected) and bind Models[Model Info] to the visual's Model Info field#(lf)
            - Property Paths (path_key, Property) — the catalog of dotted property paths available on the model#(lf)
            - ExpandProperties (function) — returns a new copy of Objects with the selected property values appended#(lf)
            Invoke ExpandProperties into its own query and load that result; keep Property Paths and ExpandProperties connection-only.#(lf)
            Selecting all properties can significantly increase refresh time and table width.#(lf)
            Property values are split by source: instance values in unprefixed columns, type values in Type_-prefixed columns.#(lf)
            Speckle.AddProperties(Source, propertyPaths) and Speckle.AddAllProperties(Source) remain available for M code.#(lf)
            The source also carries three hidden internal tables (Properties, Object Types, Type Properties) that the function and helpers consume.#(lf)
            Versions published with a pre-4.0 connector have no artifact bundle — load those with Speckle.GetByUrl.#(lf)
            Supports the following URL formats:#(lf)
            - Model URL: Gets the latest version of the specified model#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID')#(lf)
            - Version URL: Gets a specific version from the project#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID@VERSION_ID')#(lf)
            - Federated Model URL: Gets multiple models from the project#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/MODEL_ID1,MODEL_ID2')#(lf)
            - Project-Wide Model Load URL: Resolves the project's flat model collection during refresh#(lf)
              (e.g., 'https://app.speckle.systems/projects/PROJECT_ID/models/all')"
    ]
);

shared Speckle.AddProperties = Value.ReplaceType(
    Speckle.LoadFunction("AddProperties.pqm"),
    type function (
        source as table,
        propertyPaths as list
    ) as table meta [
        Documentation.Name = "Speckle - Add Properties",
        Documentation.DisplayName = "Speckle - Add Properties",
        Documentation.LongDescription =
            "Returns the Objects table from Speckle.GetTables with the requested property values appended. "
            & "Pass exact dotted paths from the Property Paths table. Values are split by source: instance values "
            & "land in unprefixed columns and type values in Type_-prefixed columns (Area / Type_Area)."
    ]
);

shared Speckle.AddAllProperties = Value.ReplaceType(
    Speckle.LoadFunction("AddAllProperties.pqm"),
    type function (
        source as table
    ) as table meta [
        Documentation.Name = "Speckle - Add All Properties",
        Documentation.DisplayName = "Speckle - Add All Properties",
        Documentation.LongDescription =
            "Returns the Objects table from Speckle.GetTables with every property path appended. "
            & "Values are split by source: instance values land in unprefixed columns and type values in "
            & "Type_-prefixed columns. Intended as a convenience for property-light models; "
            & "models with hundreds or thousands of property paths can produce very wide, slow-to-refresh tables."
    ]
);

// here we register the GetTables function to power bi ui — the single Get Data
// entry; the legacy Speckle.GetByUrl stays unpublished but exported
GetTables.Publish = [
    Category = "Other",
    ButtonText = {"Connect to Speckle"},
    LearnMoreUrl = "https://speckle.guide/user/powerbi/introduction.html",
    SourceImage = Speckle.Icons,
    SourceTypeImage = Speckle.Icons
];

Speckle.Icons = [
    Icon16 = { Extension.Contents("SpeckleLogo16.png"), Extension.Contents("SpeckleLogo20.png"), Extension.Contents("SpeckleLogo24.png"), Extension.Contents("SpeckleLogo32.png") },
    Icon32 = { Extension.Contents("SpeckleLogo32.png"), Extension.Contents("SpeckleLogo40.png"), Extension.Contents("SpeckleLogo48.png"), Extension.Contents("SpeckleLogo64.png") }
];


// The data source definition
Speckle = [
    // This is used when running the connector on an on-premises data gateway
    TestConnection = (path) => {"Speckle.GetUser", path},
    // Authentication strategy - OAuth only
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
                    // Detect if server supports /oauth/token
                    oauthCheck = try Web.Contents(
                        Text.Combine({server, "oauth", "token"}, "/"),
                        [ManualStatusHandling = {400, 401, 403, 404, 405, 500}]
                    ) otherwise null,
                    useNewOAuth = oauthCheck <> null and Value.Metadata(oauthCheck)[Response.Status] = 200,
                    // Build auth URL based on server capabilities
                    authUrl = if useNewOAuth then
                        Text.Combine({server, "authn", "verify", AuthAppId, codeChallenge}, "/") &
                            "?code_challenge_method=S256" &
                            "&pbiNew=true"
                    else
                        // Legacy
                        Text.Combine({server, "authn", "verify", AuthAppId, codeVerifier}, "/")
                in
                    [
                        LoginUri = authUrl,
                        CallbackUri = "https://oauth.powerbi.com/views/oauthredirect.html",
                        WindowHeight = 800,
                        WindowWidth = 600,
                        Context = [code_verifier = codeVerifier, use_new_oauth = useNewOAuth]
                    ],
            FinishLogin = (clientApplication, dataSourcePath, context, callbackUri, state) =>
                let
                    server = Text.Combine(
                        {Uri.Parts(dataSourcePath)[Scheme], "://", Uri.Parts(dataSourcePath)[Host]}
                    ),
                    Parts = Uri.Parts(callbackUri)[Query],
                    codeVerifier = if context <> null then context[code_verifier] else null,
                    useNewOAuth = if context <> null and Record.HasFields(context, "use_new_oauth") then context[use_new_oauth] else false,
                    // Single token exchange call based on server capability
                    Source = if useNewOAuth then
                        Web.Contents(
                            Text.Combine({server, "oauth", "token"}, "/"),
                            [
                                Headers = [#"Content-Type" = "application/json"],
                                Content = Json.FromValue([
                                    appId = AuthAppId,
                                    accessCode = Parts[access_code],
                                    codeVerifier = codeVerifier
                                ])
                            ]
                        )
                    else
                        // Legacy
                        Web.Contents(
                            Text.Combine({server, "auth", "token"}, "/"),
                            [
                                Headers = [#"Content-Type" = "application/json"],
                                Content = Json.FromValue([
                                    appId = AuthAppId,
                                    appSecret = AuthAppSecret,
                                    accessCode = Parts[access_code],
                                    challenge = codeVerifier
                                ])
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
        ]
    ],
    Label = "Speckle"
];
