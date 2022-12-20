// Use this file to write queries to test your data connector
let result = Speckle.Api.Fetch("https://speckle.xyz") in Record.ToTable(result)
