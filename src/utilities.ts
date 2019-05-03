import { Promises } from "@eight/promises";

export async function retry<T>(func: () => Promise<T>, retries: number, sleep: number = 1000): Promise<T> {
    while (true) {
        try {
            return await func();
        } catch (err) {
            if (retries-- <= 0) throw err;
            await Promises.wait(sleep);
        }
    }
}
