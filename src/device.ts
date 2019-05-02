import { Socket } from "net";
import { Promises } from "@eight/promises";
import * as joi from "types-joi";

const deviceIdSchema = joi.object({ id: joi.string().required(), c: joi.string() });
const publicKeySchema = joi.object({ r: joi.number().valid(0 as const).required(), b: joi.string().required() });

async function socketConnect(host: string, port: number): Promise<Socket> {
    const socket = new Socket();
    await Promises.toPromise(cb => socket.connect(port, host, () => cb(undefined)));

    return socket;
}

async function writeSocket(socket: Socket, data: Buffer) {
    await Promises.toPromise(cb => socket.write(data, cb));
}

async function readSocketOnce(socket: Socket) {
    const ret = await Promises.toPromise<Buffer>(cb => {
        socket.once("data", data => {
            socket.pause();
            cb(undefined, data);
        });
        socket.resume();
    });

    return ret;
}

function encodeRequest({ name, content }: Request): Buffer {
    const encodedContent = content !== undefined ? JSON.stringify(content) : "";
    return Buffer.from(`${name}\n${encodedContent.length}\n\n${encodedContent}`, "ascii");
}

function decodeMessage<T>(data: Buffer, schema: joi.Schema<T>): T {
    const text = data.toString("ascii");
    console.log("text", text);

    return joi.attempt(JSON.parse(text), schema);
}

interface Request {
    readonly name: string;
    readonly content?: any;
}

class Device {
    public constructor(private readonly address: string, private readonly port: number) {}

    private async connect(): Promise<Socket> {
        return await socketConnect(this.address, this.port);
    }

    private async get<T>(request: Request, responseSchema: joi.Schema<T>): Promise<T> {
        const socket = await this.connect();
        try {
            const responsePromise = readSocketOnce(socket);
            await writeSocket(socket, encodeRequest(request));

            return decodeMessage(await responsePromise, responseSchema);
        } finally {
            socket.destroy();
        }
    }

    public async getDeviceId() {
        return (await this.get({ name: "device-id" }, deviceIdSchema.required())).id.toLowerCase();
    }

    public async getPublicKey() {
        const resp = await this.get({ name: "public-key" }, publicKeySchema.required());
        return resp.b;
    }
}

(async () => {
    try {
        const device = new Device("192.168.0.1", 5609);
        const deviceId = await device.getDeviceId();

        const pubKey = await device.getPublicKey();

        console.log("PUB KEY", pubKey);

        console.log("connected");
    } catch (err) {
        console.log("fail", err);
    }
})();