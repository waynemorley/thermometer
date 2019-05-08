import GoogleSheets, { Spreadsheet } from "./google_sheets";

class ResultsSpreadsheet {
    static sheetId: string = "1MIYaIyZX7Q_rk6MioPJYKX5wvQ1lSDfUEPSRa_RRxn4";
    constructor(private readonly spreadsheet: Spreadsheet) {}

    public async addTestResults(deviceSerial: string, testResult: string) {
        const body = {
            values: [
                [
                    deviceSerial,
                    // add spaces here...
                    testResult
                ]
            ]
        };
        console.log(body);
    }
}

export async function spreadsheetTest() {
    const googleSheets = await GoogleSheets.getFromCredentials();
    const resultsSheet = await googleSheets.getSpreadsheet(ResultsSpreadsheet.sheetId);
    const resultsSpreadsheet = new ResultsSpreadsheet(resultsSheet);

    await resultsSpreadsheet.addTestResults("hey", "test");
    await resultsSheet.getTabTitles();
}
