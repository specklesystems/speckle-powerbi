// use this file to write queries to test your data connector

// NOTE! for tests, be make sure you put here a model that in private project to make sure all good.
let
    result = Speckle.GetByUrl(
        "https://app.speckle.systems/projects/b61ab234b0/models/a8166255b5"
    )
in
    result
