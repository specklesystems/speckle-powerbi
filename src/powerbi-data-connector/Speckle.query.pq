// use this file to write queries to test your data connector

// NOTE! for tests, be make sure you put here a model that in private project to make sure all good.
let
    result = Speckle.GetByUrl(
        "https://latest.speckle.systems/projects/126cd4b7bb/models/85c44d39c6"
    )
in
    result
