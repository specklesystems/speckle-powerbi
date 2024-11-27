// Use this file to write queries to test your data connector
let
    result = Speckle.GetByUrl(
        "https://app.speckle.systems/projects/e2988234fb/models/60b2300470@b1f31a351a"
        // removed the model overlay because query returns "Multi-model URLs are not supported."
        // do we need a ToDo for that??
    )
in
    result
