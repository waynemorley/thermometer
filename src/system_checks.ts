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
        private readonly devId: string,
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
                const state = await this.deviceApi.getState(this.devId);
                const leftT = (state["heatLevelL"] as any).value as number;
                const rightT = (state["heatLevelR"] as any).value as number;

                if (!isValidTemp(leftT) || !isValidTemp(rightT)) throw new Error("got invalid temp levels");

                return {
                    leftTemp: round(this.convertTemp(leftT), 2),
                    rightTemp: round(this.convertTemp(rightT), 2)
                };
            },
            8,
            10 * 1000
        );
    }

    private async getTecTestEvents(startTime: DateTime) {
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

    private async getPumpToggleEvents(startTime: DateTime) {
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

    public async online() {
        const startTime = new Date();
        let online = false;
        while (online === false) {
            try {
                const state = await this.deviceApi.getState(this.devId);
                const lastHeard = DateTime.fromISO((state["lastHeard"] as any).value as string).toJSDate();
                online = DateTime.utc().diff(DateTime.fromJSDate(lastHeard), "minutes").minutes < 2;
                if (online) {
                    await Promises.wait(1000);
                    return true;
                }
            } catch (error) {
                this.log(`Error getting device state: ${error}`);
            }

            const elapsedMs = new Date().valueOf() - startTime.valueOf();
            if (elapsedMs > twoMinutes) throw new Error("device never online");

            this.log(`Device offline, trying again in 5 seconds...`);
            await Promises.wait(5 * 1000);
        }

        return false;
    }

    public async isLatestFw(latestFw: string) {
        try {
            const state = await this.deviceApi.getState(this.devId);
            const fwVersion = (state["firmwareVersion"] as any).value as string;
            if (fwVersion === latestFw) return true;
        } catch (error) {
            this.log(`Error getting device state: ${error}`);
        }
        return false;
    }

    public async primeSequence() {
        this.log("Beginning short prime sequence. Priming for 2 minutes...");
        try {
            await this.deviceApi.callFunction(this.devId, "prime", true);
            await Promises.wait(twoMinutes);

            await this.deviceApi.callFunction(this.devId, "reset", true);
            await Promises.wait(10 * 1000);

            this.log("Prime sequence. Toggling pumps...");
            const stateEvents = await this.getPumpToggleEvents(DateTime.utc());
            await this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
            await this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

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

        const stateEvents = await this.getTecTestEvents(DateTime.utc());
        await this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
        await this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

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

    public async run(): Promise<boolean> {
        try {
            this.log(
                `Running health check (priming pumps & thermal performance) on dev ${this.devId}. Checking online...`
            );
            await this.online();
            const isLatestFw = await this.isLatestFw("2.2.22.0");
            if (!isLatestFw) { throw new Error("Device firmware out of date"); }
            const startTime = Math.floor(DateTime.local().valueOf() / 1000.0);
            const initialTemps = await this.getTemps();
            this.log(`Initial temps: ${JSON.stringify(initialTemps)}`);
            await this.primeSequence();

            await this.online();
            const tecPass = await this.tecTest();
            const endTime = Math.floor(DateTime.local().valueOf() / 1000.0);
            const runtime = Duration.fromObject({ seconds: endTime - startTime }).as("minutes");
            this.log(`Finished running tests in ${runtime.toFixed(2)} minutes`);
            if (tecPass) {
                this.log(
                    colors.bgGreen.white(nl(4) + "****Test PASS****") +
                        colors.yellow(" Next step: factory reset device") +
                        nl(4)
                );
                return true;
            }
        } catch (err) {
            this.log("ERROR " + err);
        }

        this.log(colors.bgRed.white(nl(4) + "****Test FAIL****. Please try again") + nl(4));
        return false;
    }
}
