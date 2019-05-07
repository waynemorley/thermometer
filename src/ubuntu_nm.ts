import { spawn } from "child_process";
import { Readable } from "stream";

interface CommandResult {
    readonly code: number;
    readonly stdOut: Buffer;
    readonly stdErr: Buffer;
}

function splitLines(text: string) {
    return text.split(/\r\n|\r|\n/);
}

function readStreamToEnd(readable: Readable) {
    return new Promise<Buffer>((resolve, reject) => {
        readable.on("error", err => reject(err));

        let buffer = Buffer.alloc(0);
        readable.on("close", () => resolve(buffer));
        readable.on("data", data => (buffer = Buffer.concat([buffer, data])));
    });
}

function runCommandToEnd(command: string, args: readonly string[]) {
    return new Promise<CommandResult>((resolve, reject) => {
        const process = spawn(command, args, { detached: false, stdio: "pipe" });

        const stdOutPromise = readStreamToEnd(process.stdout);
        const stdErrPromise = readStreamToEnd(process.stderr);

        process.on("error", err => reject(err));
        process.on("close", async code => {
            try {
                resolve({ code: code, stdErr: await stdErrPromise, stdOut: await stdOutPromise });
            } catch (err) {
                reject(err);
            }
        });
    });
}

export type CliObject = { [name: string]: string };

export interface Command {
    execute(args: readonly string[]): Promise<CommandResult>;
    get(args: readonly string[]): Promise<CliObject[]>;
}

class SimpleSubCommand implements Command {
    execute(args: readonly string[]): Promise<CommandResult> {
        return this.parent.execute([...this.args, ...args]);
    }

    get(args: readonly string[]): Promise<CliObject[]> {
        return this.parent.get([...this.args, ...args]);
    }

    public constructor(private readonly parent: Command, private readonly args: readonly string[]) {}
}

class Wifi extends SimpleSubCommand {
    public constructor(parent: Command) {
        super(parent, ["wifi"]);
    }

    public async rescan() {
        await this.execute(["rescan"]);
    }

    public async list() {
        return await this.get(["list"]);
    }

    public async connect(ssid: string, password?: string) {
        const pass = password ? ["password", password] : [];
        await this.execute(["connect", ssid, ...pass]);
    }
}

class Device extends SimpleSubCommand {
    public readonly wifi = new Wifi(this);
    public constructor(parent: Command) {
        super(parent, ["device"]);
    }
}

class CommandError extends Error {
    public readonly name = "CommandError";
    public constructor(public readonly result: CommandResult) {
        super(`command exited with code (${result.code})`);
    }

    public get code() {
        return this.result.code;
    }

    public get errText() {
        return this.result.stdErr.toString();
    }
}

export class UbuntuNM implements Command {
    public readonly device = new Device(this);

    private static parseField(line: string): [string, string] {
        const fieldRegex = /^([^:]*):(.*)$/;
        const match = fieldRegex.exec(line);
        if (!match) throw new Error(`could not parse field (${line})`);

        return [match[1], match[2]];
    }

    private static parseLines(lines: readonly string[]) {
        const ret = [];

        let current: CliObject | undefined = undefined;
        let firstFieldName: string | undefined;
        for (const line of lines.filter(l => l.length)) {
            const [name, value] = UbuntuNM.parseField(line);
            if (firstFieldName === undefined) firstFieldName = name;
            if (name === firstFieldName) {
                if (current !== undefined) ret.push(current);
                current = {};
            }
            if (current === undefined) throw new Error("invalid state");

            current[name] = value;
        }

        if (current !== undefined) ret.push(current);

        return ret;
    }

    private static parseResult(result: CommandResult): any[] {
        if (result.code !== 0) throw new CommandError(result);

        if (result.stdOut.length === 0) return [];

        const lines = splitLines(result.stdOut.toString());
        return UbuntuNM.parseLines(lines);
    }

    public async execute(args: readonly string[]) {
        const terse = ["--terse"];
        const timeout: string[] = []; // ["--wait", "30"];
        const colors = ["--colors", "no"];
        const mode = ["--mode", "multiline"];
        const completeArgs = [...terse, ...timeout, ...colors, ...mode, ...args];
        return await runCommandToEnd("nmcli", completeArgs);
    }

    public async get(args: readonly string[]): Promise<CliObject[]> {
        const result = await this.execute(args);
        return UbuntuNM.parseResult(result);
    }
}
