import { Promises } from "@eight/promises";
import { ClientApi } from "@eight/practices";

const clientApi = new ClientApi({
    token: { token: "cf9371ebd99a44bfa8ce6c521045d7b2-99f976f3935fec39d5e1890e5eec12f6", type: "session" }
});

export async function getDeviceId(email: string): Promise<string> {
    try {
        const user = await clientApi.userGet(email);
        return user.devices[0];
    } catch (error) {
        console.log(`got error ${error}`);
        return "fail";
    }
}

export function isValid(str: string, r: string): boolean {
    const m = str.match(new RegExp(r));
    const valid = m ? true : false;
    if (!valid) throw new Error("invalid option");
    return valid;
}

export interface OptionsTimeout {
    readonly sleepMs?: number;
    readonly timeoutMs: number;
}

export interface OptionsRetries {
    readonly sleepMs?: number;
    readonly retries: number;
}

export type Options = OptionsRetries | OptionsTimeout;

function isRetries(options: Options): options is OptionsRetries {
    return (options as any).retries !== undefined;
}

export async function retry<T>(func: () => Promise<T>, options: Options): Promise<T> {
    const sleep = options.sleepMs || 1000;
    const startMillis = new Date().valueOf();
    let attempts = 0;

    const shouldContinue = isRetries(options)
        ? () => attempts <= options.retries
        : () => {
              const elapsed = new Date().valueOf() - startMillis;
              return elapsed <= options.timeoutMs;
          };

    while (true) {
        try {
            attempts++;
            return await func();
        } catch (err) {
            if (!shouldContinue()) throw err;
            await Promises.wait(sleep);
        }
    }
}
