// Use this file to write queries to test your data connector
let result = Speckle.Api.Fetch("https://latest.speckle.systems") in Record.ToTable(result)