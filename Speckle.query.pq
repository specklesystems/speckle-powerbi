// Use this file to write queries to test your data connector
let result = Speckle.GetByUrl.Structured("https://speckle.xyz/streams/ceecc65de7") in Record.ToTable(result)
