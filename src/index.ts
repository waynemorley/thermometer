process.env["SUPPRESS_NO_CONFIG_WARNING"] = "true";

import { DeviceApi, ClientApi, Tokens } from "@eight/practices";
import * as yargs from "yargs";
import { HealthCheck } from "./system_checks";

const deviceApi = new DeviceApi();
const clientApi = new ClientApi(
    { token:
        { token: "cf9371ebd99a44bfa8ce6c521045d7b2-99f976f3935fec39d5e1890e5eec12f6",
        type: "session"}
    });

async function getId(devSn: string): Promise<string> {
    const endSn = devSn.substring(devSn.length - 3);
    const email = `mp${endSn}@eightsleep.com`;
    try {
        const user = await clientApi.userGet(email);
        return user.devices[0];
    } catch (error) {
        console.log(`got error ${error}`);
        return "fail";
    }
}

async function run(args: any) {
    // future: support multiple devices
    const devId = await getId(args.dev);
    const healthCheck = new HealthCheck(devId, deviceApi);
    await healthCheck.run();
}

yargs
    .demandOption(["dev"])
    .argv;

run(yargs.argv);