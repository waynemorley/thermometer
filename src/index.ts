process.env["SUPPRESS_NO_CONFIG_WARNING"] = "true";

import { DeviceApi, KelvinApi } from "@eight/practices";
import { HealthCheck } from "./system_checks";
import { Device } from "./device";
import { createInterface, Interface } from "readline";
import * as colors from "colors";
import GoogleSheets from "./google_sheets";
import ResultsSpreadsheet from "./results_spreadsheet";

const deviceApi = new DeviceApi();
const kelvinApi = new KelvinApi();

const device = new Device();

const passedSerials = new Map<string, boolean>();

async function testDevice(serialNumber: string, resultsSpreadsheet: ResultsSpreadsheet) {
    try {
        passedSerials.set(serialNumber, false);
        const deviceId = await device.connectAndGetId("Knotel", "hellohello");

        const healthCheck = new HealthCheck(serialNumber, deviceId, deviceApi, kelvinApi);
        const passed = await healthCheck.run();
        if (passed) {
            passedSerials.set(serialNumber, true);
            await resultsSpreadsheet.addTestResults(serialNumber, "PASS");
        } else {
            passedSerials.delete(serialNumber);
            await resultsSpreadsheet.addTestResults(serialNumber, "FAIL");
        }
    } catch (err) {
        console.log("FAIL", err);
        passedSerials.delete(serialNumber);
    }
}

function readLine(int: Interface): Promise<string> {
    return new Promise(res => int.once("line", line => res(line)));
}

function isValidSerial(text: string) {
    return text.length > 5;
}

async function run() {
    const int = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    const googleSheets = await GoogleSheets.getFromCredentials();
    const resultsSheet = await googleSheets.getSpreadsheet(ResultsSpreadsheet.sheetId);
    const resultsSpreadsheet = new ResultsSpreadsheet(resultsSheet);

    resultsSpreadsheet.addTestResults("aaa908", "pass");
    return;
    while (true) {
        const serialNumber = await readLine(int);
        if (!isValidSerial(serialNumber)) {
            console.log("invalid serial");
            continue;
        }

        const passed = passedSerials.get(serialNumber);
        if (passed !== undefined) {
            if (passed)
                console.log(colors.bgGreen.white(`\n\n\n\n     DEVICE ${serialNumber} PASSED THE TEST     \n\n\n`));
            else console.log(`DEVICE ${serialNumber} is being tested`);
            continue;
        }

        testDevice(serialNumber, resultsSpreadsheet);
    }
}

// yargs.demandOption(["dev"]).argv;

run();
