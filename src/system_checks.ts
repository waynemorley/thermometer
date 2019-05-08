import { DeviceApi, KelvinApi, StateEvent } from "@eight/practices";
import { Promises } from "@eight/promises";
import { DateTime, Duration } from "luxon";
import * as colors from "colors";
import { retry } from "./utilities";

interface SideTemps {
    leftTemp: number;
    rightTemp: number;
}

const twoMinutes = 2 * 60 * 1000;

function nl(count: number) {
    return "\n".repeat(count);
}

function isValidTemp(temp: number) {
    return temp !== -100 && temp !== 100;
}

function round(value: number, digits: number) {
    const exp = Math.pow(10, digits);
    return Math.round(value * exp) / exp;
}

export class HealthCheck {
    constructor(
        private readonly serialNumber: string,
        private readonly deviceId: string,
        private readonly deviceApi: DeviceApi,
        private readonly kelvinApi: KelvinApi
    ) {}

    private log(message: string) {
        console.log(`\n${colors.bgBlue.white(this.serialNumber)}:`, message);
    }

    private convertTemp(level: number) {
        const b = 27; // y-intercept
        if (level === 0) return b;
        if (level < 0) return level * 0.12 + b;
        if (level > 0) return level * 0.18 + b;

        throw new Error(`Invalid level ${level}`);
    }

    private async getTemps(): Promise<SideTemps> {
        return await retry(
            async () => {
                const state = await this.deviceApi.getState(this.deviceId);
                const leftT = (state["heatLevelL"] as any).value as number;
                const rightT = (state["heatLevelR"] as any).value as number;

                if (!isValidTemp(leftT) || !isValidTemp(rightT)) throw new Error("got invalid temp levels");

                return {
                    leftTemp: round(this.convertTemp(leftT), 2),
                    rightTemp: round(this.convertTemp(rightT), 2)
                };
            },
            { retries: 8, sleepMs: 10 * 1000 }
        );
    }

    private getTecTestEvents(startTime: DateTime) {
        startTime = startTime.plus({ seconds: 1 });
        const stateEvents: StateEvent[] = [
            {
                time: startTime.toJSDate(),
                type: "temperatureControl",
                operation: "on"
            },
            {
                time: startTime.toJSDate(),
                type: "temperatureControl",
                operation: "temperature",
                data: {
                    value: 100
                }
            },
            {
                time: startTime.plus({ seconds: 60 }).toJSDate(),
                type: "temperatureControl",
                operation: "off"
            },
            {
                time: startTime.plus({ seconds: 60 + 30 }).toJSDate(),
                type: "temperatureControl",
                operation: "on"
            },
            {
                time: startTime.plus({ seconds: 60 + 30 }).toJSDate(),
                type: "temperatureControl",
                operation: "temperature",
                data: {
                    value: -100
                }
            },
            {
                time: startTime.plus({ seconds: 60 + 30 + 60 }).toJSDate(),
                type: "temperatureControl",
                operation: "off"
            }
        ];
        return stateEvents;
    }

    private getPumpToggleEvents(startTime: DateTime) {
        startTime = startTime.plus({ seconds: 1 });
        const stateEvents: StateEvent[] = [
            {
                time: startTime.toJSDate(),
                type: "temperatureControl",
                operation: "on"
            },
            {
                time: startTime.toJSDate(),
                type: "temperatureControl",
                operation: "temperature",
                data: {
                    value: 0
                }
            },
            {
                time: startTime.plus({ seconds: 5 }).toJSDate(),
                type: "temperatureControl",
                operation: "off"
            },
            {
                time: startTime.plus({ seconds: 10 }).toJSDate(),
                type: "temperatureControl",
                operation: "on"
            },
            {
                time: startTime.plus({ seconds: 10 }).toJSDate(),
                type: "temperatureControl",
                operation: "temperature",
                data: {
                    value: 0
                }
            },
            {
                time: startTime.plus({ seconds: 15 }).toJSDate(),
                type: "temperatureControl",
                operation: "off"
            }
        ];
        return stateEvents;
    }

    private formatdT(delta: number) {
        if (delta < 2) {
            return colors.red(`${delta.toFixed(2)}`);
        } else {
            return colors.green(`${delta.toFixed(2)}`);
        }
    }

    private async assertReady() {
        const latestFw = "2.2.22.0";
        const state = await this.deviceApi.getState(this.deviceId);
        const lastHeard = DateTime.fromISO((state["lastHeard"] as any).value as string).toJSDate();
        const isOnline = DateTime.utc().diff(DateTime.fromJSDate(lastHeard), "minutes").minutes < 2;
        if (!isOnline) throw new Error("device offline");

        const fwVersion = (state["firmwareVersion"] as any).value as string;
        const isLatestFw = fwVersion === latestFw;
        if (!isLatestFw) throw new Error("device FW invalid");
    }

    public async waitReady() {
        await retry(() => this.assertReady(), { sleepMs: 5 * 1000, timeoutMs: 2 * twoMinutes });
    }

    private async callFunction(name: string) {
        await retry(() => this.deviceApi.callFunction(this.deviceId, name, true), { timeoutMs: twoMinutes });
    }

    public async primeSequence() {
        this.log("Beginning short prime sequence. Priming for 2 minutes...");
        try {
            await this.callFunction("prime");
            await Promises.wait(twoMinutes);

            await this.callFunction("reset");
            await Promises.wait(10 * 1000);

            this.log("Prime sequence. Toggling pumps...");
            await retry(
                async () => {
                    const stateEvents = this.getPumpToggleEvents(DateTime.utc());
                    await Promise.all([
                        this.kelvinApi.putSideStateEvents(this.deviceId, "left", stateEvents),
                        this.kelvinApi.putSideStateEvents(this.deviceId, "right", stateEvents)
                    ]);
                },
                { timeoutMs: twoMinutes }
            );

            await Promises.wait(20 * 1000);

            // TODO: check current and voltage of pumps in kibana
        } catch (error) {
            this.log(`Prime sequence stopped due to error ${error}`);
        }
    }

    private tecPass(...deltas: number[]) {
        for (const delta of deltas) {
            if (delta < 2) return false;
        }
        return true;
    }

    public async tecTest() {
        const initialTemps = await this.getTemps();
        this.log(`TEC test with initial temps ${JSON.stringify(initialTemps)}. Heating for 60s...`);

        await retry(
            async () => {
                const stateEvents = this.getTecTestEvents(DateTime.utc());
                await this.kelvinApi.putSideStateEvents(this.deviceId, "left", stateEvents);
                await this.kelvinApi.putSideStateEvents(this.deviceId, "right", stateEvents);
            },
            { timeoutMs: twoMinutes }
        );

        await Promises.wait(90 * 1000);

        const heatingTemps = await this.getTemps();
        this.log(
            `TEC performance test. End heating. Left: ${initialTemps.leftTemp}->${heatingTemps.leftTemp} C and right: ${
                initialTemps.rightTemp
            }->${heatingTemps.rightTemp} C`
        );
        const heatingLeftdT = heatingTemps.leftTemp - initialTemps.leftTemp;
        const heatingRightdT = heatingTemps.rightTemp - initialTemps.rightTemp;
        this.log(
            `TEC performance test results. Left dT: ${this.formatdT(heatingLeftdT)} and right dT: ${this.formatdT(
                heatingRightdT
            )}`
        );

        if (!this.tecPass(heatingLeftdT, heatingRightdT)) return false;

        this.log("TEC test. Cooling for 60s...");
        await Promises.wait(90 * 1000);

        const coolingTemps = await this.getTemps();
        this.log(
            `TEC performance test. End cooling. Left: ${heatingTemps.leftTemp}->${coolingTemps.leftTemp} C and right: ${
                heatingTemps.rightTemp
            }->${coolingTemps.rightTemp} C`
        );
        const coolingLeftdT = heatingTemps.leftTemp - coolingTemps.leftTemp;
        const coolingRightdT = heatingTemps.rightTemp - coolingTemps.rightTemp;
        this.log(
            `TEC performance test results. Left dT: ${this.formatdT(coolingLeftdT)} and right dT: ${this.formatdT(
                coolingRightdT
            )}`
        );
        return this.tecPass(coolingLeftdT, coolingRightdT, heatingLeftdT, heatingRightdT);
    }

    private async runCheck(): Promise<boolean> {
        try {
            this.log(
                `Running health check (priming pumps & thermal performance) on dev ${this.deviceId}. Checking online...`
            );
            await this.waitReady();

            const startTime = Math.floor(DateTime.local().valueOf() / 1000.0);
            const initialTemps = await this.getTemps();
            this.log(`Initial temps: ${JSON.stringify(initialTemps)}`);
            await this.primeSequence();

            await this.waitReady();
            const tecPass = await this.tecTest();
            const endTime = Math.floor(DateTime.local().valueOf() / 1000.0);
            const runtime = Duration.fromObject({ seconds: endTime - startTime }).as("minutes");
            this.log(`Finished running tests in ${runtime.toFixed(2)} minutes`);
            if (tecPass) return true;
        } catch (err) {
            this.log("ERROR " + err);
        }

        return false;
    }

    public async run(): Promise<boolean> {
        let retries = 3;
        let testPass = false;
        while (retries > 0 && !testPass) {
            try {
                retries--;
                testPass = await this.runCheck();
            } catch (err) {
                this.log("ERROR " + err);
            }
            await Promises.wait(60 * 1000);
        }

        if (testPass) {
            this.log(
                colors.bgGreen.white("****Test PASS****") +
                    colors.yellow(`with ${retries} retries left. Next step: factory reset device`)
            );
            return true;
        } else {
            this.log(colors.bgRed.white("****Test FAIL**** after 3 retries"));
            return false;
        }
    }
}
