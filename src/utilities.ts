import { Promises } from "@eight/promises";

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
            if (!shouldContinue) throw err;
            await Promises.wait(sleep);
        }
    }
}
