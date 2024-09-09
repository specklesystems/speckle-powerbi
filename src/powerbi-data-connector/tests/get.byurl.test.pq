// Use this file to write queries to test your data connector
let result = Speckle.Get.ByUrl("https://latest.speckle.systems/streams/3d25474a18") in Record.ToTable(result)
