process.env["SUPPRESS_NO_CONFIG_WARNING"] = "true";

import { DeviceApi, KelvinApi } from "@eight/practices";
import { HealthCheck } from "./system_checks";
import { Device } from "./device";
import { createInterface, Interface } from "readline";
import * as colors from "colors";
import { UbuntuNM } from "./ubuntu_nm";
import { Promises } from "@eight/promises";
import { retry } from "./utilities";
import yargs = require("yargs");

const deviceApi = new DeviceApi();
const kelvinApi = new KelvinApi();

const device = new Device();

const passedSerials = new Map<string, boolean>();

let networkManager: UbuntuNM | undefined = undefined;

async function tryWifiConnect() {
    if (networkManager === undefined) return;

    console.log("listing networks...");
    const scanResult = await networkManager.device.wifi.list();
    const targetNetwork = scanResult.find(r => r.SSID.startsWith("Eight-"));
    if (!targetNetwork) throw new Error("not found");

    const ssid = targetNetwork.SSID;
    console.log(`network found ${ssid}, connecting...`);
    await networkManager.device.wifi.connect(ssid);
    console.log(`connecting to network ${ssid}`);
}

async function tryWifiRevert() {
    if (networkManager === undefined) return;

    console.log("reverting to Knotel...");
    await networkManager.device.wifi.connect("Knotel", "hellohello");
    console.log("reverted to Knotel");
}

async function pairAndGetDeviceId() {
    try {
        await tryWifiConnect();

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
        await tryWifiRevert();
    }
}

async function testDevice(serialNumber: string) {
    try {
        passedSerials.set(serialNumber, false);
        const deviceId = await pairAndGetDeviceId();

        const healthCheck = new HealthCheck(serialNumber, deviceId, deviceApi, kelvinApi);
        const passed = await healthCheck.run();
        if (passed) passedSerials.set(serialNumber, true);
        else passedSerials.delete(serialNumber);
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

async function run(autoWifi: boolean) {
    console.log("auto-wifi:", autoWifi);
    const int = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    if (autoWifi) networkManager = new UbuntuNM();

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

        testDevice(serialNumber);
    }
}

const args = yargs.option("wifi", {
    boolean: true,
    alias: "w",
    default: false
}).argv;

run(args.wifi);
