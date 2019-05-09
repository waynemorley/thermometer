import GoogleSheets, { Spreadsheet, WriteArgs, ReadArgs } from "./google_sheets";
import { DateTime } from "luxon";

export default class ResultsSpreadsheet {
    static sheetId: string = "1MIYaIyZX7Q_rk6MioPJYKX5wvQ1lSDfUEPSRa_RRxn4";
    // private readonly tabTitle: string = "HUB QC TRACKING";
    private readonly tabTitle: string = "mercer";
    constructor(private readonly spreadsheet: Spreadsheet) {}

    private async getRowOfDevice(deviceSerial: string) {
        // checks if this device is already in the spreadsheet by getting the row
        // await this.spreadsheet.searchByKey(deviceSerial);
        const args: ReadArgs = {
            spreadsheetId: ResultsSpreadsheet.sheetId,
            range: `${this.tabTitle}!D:D`
        };
        const values = await this.spreadsheet.getValues(args);
        if (values === undefined) throw new Error("undefined values in sheet");
        return await this.spreadsheet.findRowByValue(values, deviceSerial);
    }

    private getRowValues(endSn: string, testResult: string) {
        const now = DateTime.local();
        const values = [
            [
                now.toLocaleString(), // date
                now.toFormat("HH:mm:ss"), // time
                "", // expected end of test (old)
                endSn,
                "", // SKU
                "", // dev ID
                "", // pair ID
                "", // todo: pass in "retriesLeft" here
                testResult,
                "", // notes
                "2.2.22.0",
                "China"
            ]
        ];
        return values;
    }

    public async addTestResults(deviceSerial: string, testResult: string) {
        const endSn = deviceSerial.substring(deviceSerial.length, deviceSerial.length - 3);
        const values = this.getRowValues(endSn, testResult);

        const args: WriteArgs = {
            spreadsheetId: ResultsSpreadsheet.sheetId,
            range: `${this.tabTitle}!A:A`,
            valueInputOption: "USER_ENTERED",
            resource: { values }
        };

        // todo: check if it is there first w/ endSn
        const deviceRow = await this.getRowOfDevice(endSn);
        console.log(`device row of SN ${endSn} is ${deviceRow}`);

        if (deviceRow > -1) {
            // existing device; update test result only
            args.resource.values = [[testResult]];
            args.range = `${this.tabTitle}!I${deviceRow}:I${deviceRow}`;
            await this.spreadsheet.updateRow(args);
        } else {
            // new device
            await this.spreadsheet.appendValues(args);
        }
    }
}
