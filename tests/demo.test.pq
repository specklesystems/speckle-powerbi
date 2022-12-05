section UnitTestingUnitTests;

UT = Speckle.LoadFunction("Facts.pqm");
Fact = UT[Fact];

Facts.Summarize = UT[SummarizeFacts];

shared Speckle.UnitTest = [
    // Put any common variables here if you only want them to be evaluated once
    // Fact(<Name of the Test>, <Expected Value>, <Actual Value>)
    // <Expected Value> and <Actual Value> can be a literal or let statement
    facts = {
        Fact(
            "Check that this function returns 'ABC'",
            // name of the test
            "ABC",
            // expected value
            UnitTesting.ReturnsABC()
            // expression to evaluate (let or single statement)
        ),
        Fact("Check that this function returns '123'", "123", UnitTesting.Returns123()),
        Fact("Result should contain 5 rows", 5, Table.RowCount(UnitTesting.ReturnsTableWithFiveRows())),
        Fact("Values should be equal (using a let statement)", "Hello World", let a = "Hello World" in a)
    },
    report = Facts.Summarize(facts)
][report];

shared UnitTesting.ReturnsABC = () => "ABC";
shared UnitTesting.Returns123 = () => "123";
shared UnitTesting.ReturnsTableWithFiveRows = () => Table.Repeat(#table({"a"}, {{1}}), 5);
