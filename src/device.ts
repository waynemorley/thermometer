import { Socket } from "net";
import { Promises } from "@eight/promises";
import * as joi from "types-joi";
import { createPublicKey, publicEncrypt, KeyObject } from "crypto";
import { RSA_PKCS1_PADDING } from "constants";

function trimNullTerminatedBufferEnd(buffer: Buffer) {
    for (let i = buffer.length - 1; i >= 0; i--) if (buffer[i]) return buffer.slice(0, i + 1);

    return Buffer.alloc(0);
}

function parsePublicKey(keyString: string) {
    const untrimmedKey = Buffer.from(keyString, "hex");
    const key = trimNullTerminatedBufferEnd(untrimmedKey);

    return createPublicKey({
        key: key,
        format: "der",
        type: "spki"
    });
}

const deviceIdSchema = joi.object({ id: joi.string().required(), c: joi.string() });
const publicKeySchema = joi.object({
    r: joi
        .number()
        .valid(0 as const)
        .required(),
    b: joi.string().required()
});
const wifiNetworkSchema = joi.object({
    ssid: joi.string().required(),
    sec: joi.number().required(), // security type
    ch: joi.number().required(), // channel
    rssi: joi.number().required(), // signal strength
    mdr: joi.number().required()
});
const wifiNetworkListSchema = joi.object({
    scans: joi
        .array()
        .items(wifiNetworkSchema)
        .required()
});

type DeviceWifiNetwork = NonNullable<joi.InterfaceFrom<typeof wifiNetworkSchema>>;

const resultSchema = joi.object({ r: joi.number().required() });

interface WifiConfigMessage {
    idx: number;
    ssid: string;
    sec: number;
    ch: number;
    pwd: string;
}

class WifiNetwork {
    public constructor(private readonly deviceWifiNetwork: DeviceWifiNetwork) {}

    public get ssid() {
        return this.deviceWifiNetwork.ssid;
    }

    public get securityType() {
        return this.deviceWifiNetwork.sec;
    }

    public get channel() {
        return this.deviceWifiNetwork.ch;
    }

    public get rssi() {
        return this.deviceWifiNetwork.rssi;
    }

    public get maxDataRateKbs() {
        return this.deviceWifiNetwork.mdr;
    }

    private static encryptPassword(publicKey: KeyObject, password: string) {
        return publicEncrypt({ key: publicKey, padding: RSA_PKCS1_PADDING }, Buffer.from(password)).toString("hex");
    }

    public toConfigMessage(publicKey: KeyObject, password: string): WifiConfigMessage {
        return {
            idx: 0,
            ssid: this.ssid,
            ch: this.channel,
            sec: this.securityType,
            pwd: WifiNetwork.encryptPassword(publicKey, password)
        };
    }
}

async function socketConnect(host: string, port: number): Promise<Socket> {
    const socket = new Socket();
    try {
        socket.setTimeout(1000);
        socket.on("timeout", () => socket.destroy(timeout()));
        await new Promise<void>((res, rej) => {
            socket.on("error", err => rej(err));
            socket.connect(port, host, res);
        });


        return socket;
    } catch (err) {
        if (!socket.destroyed) socket.destroy();
        throw err;
    }
}

async function writeSocket(socket: Socket, data: Buffer) {
    await Promises.toPromise(cb => socket.write(data, cb));
}

function timeout() {
    const ret = new Error("timed out");
    ret.name = "Timeout";
    return ret;
}

function readToEnd(socket: Socket): Promise<Buffer> {
    return new Promise((res, rej) => {
        let buffer = Buffer.alloc(0);
        socket.on("error", err => rej(err));
        socket.on("close", () => res(buffer));
        socket.on("data", data => (buffer = Buffer.concat([buffer, data])));
    });
}

function encodeRequest({ name, content }: Request): Buffer {
    const encodedContent = content !== undefined ? JSON.stringify(content) : "";
    return Buffer.from(`${name}\n${encodedContent.length}\n\n${encodedContent}`, "ascii");
}

function decodeMessage<T>(data: Buffer, schema: joi.Schema<T>): NonNullable<T> {
    const text = data.toString("ascii");
    return joi.attempt(JSON.parse(text), schema.required());
}

interface Request {
    readonly name: string;
    readonly content?: any;
}

export class Device {
    public constructor(private readonly address: string = "192.168.0.1", private readonly port: number = 5609) {}

    private async get<T>(request: Request, responseSchema: joi.Schema<T>): Promise<T> {
        const socket = await socketConnect(this.address, this.port);
        try {
            await writeSocket(socket, encodeRequest(request));

            const response = await readToEnd(socket);
            return decodeMessage(response, responseSchema);
        } finally {
            if (!socket.destroyed) socket.destroy();
        }
    }

    private async sendRequest(request: Request): Promise<void> {
        const result = (await this.get(request, resultSchema.required())).r;
        if (result !== 0) throw new Error("request failed");
    }

    public async getDeviceId() {
        return (await this.get({ name: "device-id" }, deviceIdSchema.required())).id.toLowerCase();
    }

    public async getPublicKey() {
        const resp = await this.get({ name: "public-key" }, publicKeySchema.required());
        return parsePublicKey(resp.b);
    }

    public async scanAP() {
        const response = await this.get({ name: "scan-ap" }, wifiNetworkListSchema.required());
        return response.scans.map(w => new WifiNetwork(w));
    }

    public async sendCredentials(network: WifiNetwork, pubKey: KeyObject, password: string) {
        const message = network.toConfigMessage(pubKey, password);
        await this.sendRequest({ name: "configure-ap", content: message });
    }

    public async connectToNetwork() {
        await this.sendRequest({ name: "connect-ap", content: { idx: 0 } });
    }

    public async connectAndGetId(ssid: string, password: string) {
        const deviceId = await this.getDeviceId();
        const pubKey = await this.getPublicKey();
        const networks = await this.scanAP();
        const network = networks.find(n => n.ssid === ssid);
        if (network === undefined) throw new Error("ssid not found");

        await this.sendCredentials(network, pubKey, password);
        await this.connectToNetwork();

        return deviceId;
    }
}
