// use this file to write queries to test your data connector

// NOTE! for tests, be make sure you put here a model that in private project to make sure all good.
let
    result = Speckle.GetByUrl(
        "https://app.speckle.systems/projects/fddfc547ee/models/57d9436086"
    )
in
    result
