import GoogleSheets, { Spreadsheet, AppendArgs } from "./google_sheets";
import { DateTime } from "luxon";

export default class ResultsSpreadsheet {
    static sheetId: string = "1MIYaIyZX7Q_rk6MioPJYKX5wvQ1lSDfUEPSRa_RRxn4";
    private readonly tabTitle: string = "Mercer_Floats";
    constructor(private readonly spreadsheet: Spreadsheet) {}

    public async addTestResults(deviceSerial: string, testResult: string) {
        const now = DateTime.local();

        const values = [
            [
                now.toLocaleString(), // date
                now.toFormat("HH:mm:ss"), // time
                "",
                deviceSerial,
                "",
                "",
                "",
                "",
                testResult,
                "2.2.22.0",
                "China"
            ]
        ];
        const args: AppendArgs = {
            spreadsheetId: ResultsSpreadsheet.sheetId,
            range: `${this.tabTitle}!A:A`,
            valueInputOption: "USER_ENTERED",
            resource: { values }
        };

        await this.spreadsheet.appendValues(args);
    }
}