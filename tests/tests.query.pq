let
    UnitTest = Extension.LoadFunction("Facts.pqm"), Fact = UnitTest[Fact], Facts.Summarize = UnitTest[SummarizeFacts]
in
    [
        facts = {
            Fact(
                "Can receive from stream",
                true,
                let
                    result = Speckle.GetByUrl("https://latest.speckle.dev/streams/0c1e0c0266")
                in
                    result <> null
            )
        },
        report = Facts.Summarize(facts)
    ][report]
