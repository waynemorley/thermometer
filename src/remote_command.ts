import { CommandModule, Argv } from "yargs";

export class RemoteCommand implements CommandModule<{}, any> {
    public readonly aliases = ["r"];
    public readonly command = "remote";
    public readonly describe = "runs remote healthcheck on [deviceId|email]";

    public builder(args: Argv) {
        return args
            .option("deviceId", {
                type: "string",
                describe: "deviceId to test"
            })
            .option("email", {
                type: "string",
                describe: "user email to test"
            })
            .conflicts("deviceId", "email");
    }

    public async handler(args: any) {}
}
