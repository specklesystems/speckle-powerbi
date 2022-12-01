section Speckle;

Speckle = [
    Authentication = [
        Key = [
            KeyLabel = "Personal Access Token",
            Label = "Private stream"
        ],
        Implicit = [
            Label = "Public stream"
        ]
    ]
];

// The GetByUrl publicly visible function
[DataSource.Kind = "Speckle", Publish = "GetByUrl.Publish"]
shared Speckle.GetByUrl = Value.ReplaceType(GetByUrl.Impl, GetByUrl.Type);

GetByUrl.Publish = GetPublish("GetByUrl");

GetByUrl.Type = type function (
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
        ",
    Documentation.Examples = {
        [
            Description = "Returns a table with 'Hello world' repeated 2 times",
            Code = "HelloWorldWithDocs.Contents(""Hello world"", 2)"
        ]
    }
];

GetByUrl.Impl = Extension.LoadFunction("GetByUrl.pqm");

// Utility function to create the publish record for a function. This will be shown in the PowerBI UI.
GetPublish = Extension.LoadFunction("GetPublish.pqm");

shared Extension.LoadFunction = (fileName as text) =>
    let
        binary = Extension.Contents(fileName), asText = Text.FromBinary(binary)
    in
        try
            Expression.Evaluate(asText, #shared) catch (e) =>
                error
                    [
                        Reason = "Extension.LoadFunction Failure",
                        Message.Format = "Loading '#{0}' failed - '#{1}': '#{2}'",
                        Message.Parameters = {fileName, e[Reason], e[Message]},
                        Detail = [File = fileName, Error = e]
                    ];
