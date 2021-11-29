// Use this file to write queries to test your data connector
let
    result = Speckle.GetByUrl("https://speckle.xyz/streams/6ead215ec5/branches/main"){0}
in
    result[data]