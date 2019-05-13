process.env["SUPPRESS_NO_CONFIG_WARNING"] = "true";

import { DeviceApi, KelvinApi } from "@eight/practices";
import { HealthCheck } from "./system_checks";
import { Device } from "./device";
import { createInterface, Interface } from "readline";
import * as colors from "colors";
import GoogleSheets from "./google_sheets";
import ResultsSpreadsheet from "./results_spreadsheet";
import { UbuntuNM } from "./ubuntu_nm";
import { Promises } from "@eight/promises";
import { retry, getId } from "./utilities";
import yargs = require("yargs");

const device = new Device();

const passedSerials = new Map<string, boolean>();

let wifi: Wifi | undefined = undefined;

class Wifi {
    public constructor(private readonly nm: UbuntuNM) {}

    public async waitForConnection(ssid: string) {
        await retry(
            async () => {
                const status = await this.nm.device.status();
                const wifiStatus = status.find(d => d.TYPE === "wifi");
                if (!wifiStatus) throw new Error("wifi device not found");

                if (wifiStatus.STATE !== "connected" || !wifiStatus.CONNECTION.includes(ssid))
                    throw new Error("not yet connected");
            },
            { timeoutMs: 60 * 1000 }
        );
    }

    public async tryWifiConnect() {
        console.log("listing networks...");
        const scanResult = await this.nm.device.wifi.list();
        const targetNetwork = scanResult.find(r => r.SSID.startsWith("Eight-"));
        if (!targetNetwork) throw new Error("not found");

        const ssid = targetNetwork.SSID;
        console.log(`network found ${ssid}, connecting...`);
        await this.nm.device.wifi.connect(ssid);
        await this.waitForConnection(ssid);
        console.log(`connected to network ${ssid}`);
    }

    public async tryWifiRevert() {
        console.log("reverting to Knotel...");
        await this.nm.device.wifi.connect("Knotel", "hellohello");
        await this.waitForConnection("Knotel");
        console.log("reverted to Knotel");
    }
}

async function pairAndGetDeviceId() {
    try {
        if (wifi) await wifi.tryWifiConnect();

        await Promises.wait(2000);

        console.log("connecting to device...");
        return await retry(
            async () => {
                console.log("attempting...");
                return await device.connectAndGetId("Knotel", "hellohello");
            },
            {
                retries: 5,
                sleepMs: 1000
            }
        );
    } finally {
        if (wifi) await wifi.tryWifiRevert();
    }
}

async function testDevice(deviceId: string, serialNumber: string, resultsSpreadsheet: ResultsSpreadsheet) {
    try {
        passedSerials.set(serialNumber, false);

        const deviceApi = new DeviceApi({ timeout: 5 * 1000 });
        const kelvinApi = new KelvinApi({ timeout: 5 * 1000 });
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

async function testRemoteDevice(deviceId: string) {
    try {
        const deviceApi = new DeviceApi({ timeout: 5 * 1000 });
        const kelvinApi = new KelvinApi({ timeout: 5 * 1000 });
        const healthCheck = new HealthCheck(deviceId, deviceId, deviceApi, kelvinApi);
        const passed = await healthCheck.run();
        console.log(`Device ${deviceId}: ${passed ? "passed" : "failed"}`);
    } catch (err) {
        console.log("FAIL", err);
    }
}

function readLine(int: Interface): Promise<string> {
    return new Promise(res => int.once("line", line => res(line)));
}

function isValidSerial(text: string) {
    return text.length > 5;
}

async function runRemote(id: string, email: boolean) {
    let deviceId = "";
    if (email) {
        deviceId = await getId(id);
    } else {
        deviceId = id;
    }
    await testRemoteDevice(deviceId);
}

async function run(autoWifi: boolean) {
    const int = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    const googleSheets = await GoogleSheets.getFromCredentials();
    const resultsSheet = await googleSheets.getSpreadsheet(ResultsSpreadsheet.sheetId);
    const resultsSpreadsheet = new ResultsSpreadsheet(resultsSheet);
    if (autoWifi) wifi = new Wifi(new UbuntuNM());

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
        const deviceId = await pairAndGetDeviceId();
        testDevice(deviceId, serialNumber, resultsSpreadsheet);
    }
}

const args = yargs
    .option("wifi", {
        boolean: true,
        alias: "w",
        default: false
    })
    .option("deviceId", {
        string: true,
        alias: "d"
    })
    .option("userEmail", {
        string: true,
        alias: "u"
    })
    .conflicts({ wifi: "deviceId", deviceId: "userEmail" }).argv;

run(args.wifi);
