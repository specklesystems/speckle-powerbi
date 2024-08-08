// Use this file to write queries to test your data connector
let
    result = Speckle.Api.REST.GetObject(
        "https://latest.speckle.systems", "5f284e5c70", "85e5f250fe591ea74d8d5dc1137a9341"
    )
in
    result
