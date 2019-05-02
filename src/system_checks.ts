import { DeviceApi, GarbageApi, TempControl, KelvinApi, StateEvent } from "@eight/practices";
import { Promises } from "@eight/promises";
import { DateTime, Duration } from "luxon";
import * as colors from "colors";

interface SideTemps {
    leftTemp: number;
    rightTemp: number;
}

export class HealthCheck {
    private devId: string;
    private deviceApi: DeviceApi;
    private garbageApi: GarbageApi;
    private kelvinApi: KelvinApi;

    constructor(devId: string, deviceApi: DeviceApi) {
        this.devId = devId;
        this.deviceApi = deviceApi;
        this.garbageApi = new GarbageApi();
        this.kelvinApi = new KelvinApi();
    }

    private convertTemp(level: number) {
        const b = 27; // y-intercept
        if (level === 0) return b;
        if (level < 0) return level * 0.12 + b;
        if (level > 0) return level * 0.18 + b;

        throw new Error(`Invalid level ${level}`);
    }
/*
    private async getTemps(): Promise<any> {
        try {
            const state = await this.deviceApi.getState(this.devId);
            const leftT = this.convertTemp((state["heatLevelL"] as any).value as number); // not tgHeatLevelL
            const rightT = this.convertTemp((state["heatLevelR"] as any).value as number);
            return {
                leftTemp: leftT.toFixed(2),
                rightTemp: rightT.toFixed(2)
            };
        } catch (error) {
            console.log(`Error getting temps: ${error}`);
        }
    }
*/
    private async getTemps(): Promise<any> {
        let leftT = -100;
        let rightT = -100;
        while (leftT === -100 || rightT === -100 || leftT === 100 || rightT === 100) {
            try {
                const state = await this.deviceApi.getState(this.devId);
                leftT = (state["heatLevelL"] as any).value as number;
                rightT = (state["heatLevelR"] as any).value as number;
                return {
                    leftTemp: this.convertTemp(leftT).toFixed(2),
                    rightTemp: this.convertTemp(rightT).toFixed(2)
                };
            } catch (error) {
                console.log(`Error getting temps: ${error}`);
            }
            await Promises.wait(5 * 1000);
        }
        return false;
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
                    value: -100
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
                    value: 100
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
        let online = false;
        while (online === false) {
            try {
                const state = await this.deviceApi.getState(this.devId);
                const lastHeard = DateTime.fromISO((state["lastHeard"] as any).value as string).toJSDate();
                online = DateTime.utc().diff(DateTime.fromJSDate(lastHeard), "minutes").minutes < 2;
                if (online) {
                    return true;
                }
            } catch (error) {
                console.log(`Error getting device state: ${error}`);
            }
            console.log(`Device offline, trying again in 5 seconds...`);
            await Promises.wait(5 * 1000);
        }
        return false;
    }

    public async primeSequence() {
        console.log("\nBeginning short prime sequence. Priming for 2 minutes...");
        try {
            await this.deviceApi.callFunction(this.devId, "prime", true);
            await Promises.wait(2 * 60 * 1000); // two min

            await this.deviceApi.callFunction(this.devId, "reset", true);
            await Promises.wait(2 * 1000);

            console.log("\nPrime sequence. Toggling pumps...");
            const stateEvents = await this.getPumpToggleEvents(DateTime.utc());
            await this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
            await this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

            await Promises.wait(20 * 1000);

            // TODO: check current and voltage of pumps in kibana
        } catch (error) {
            console.log(`\nPrime sequence stopped due to error ${error}`);
        }
    }

    private tecPass(...deltas: number[]) {
        for (const delta of deltas) {
            if (delta < 2) return false;
        }
        return true;
    }

    public async tecTest(initialTemps: SideTemps) {
        console.log(`\nTEC test with initial temps ${JSON.stringify(initialTemps)}. Cooling for 60s...`);

        const stateEvents = await this.getTecTestEvents(DateTime.utc());
        await this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
        await this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

        await Promises.wait(90 * 1000);

        const coolingTemps = await this.getTemps();
        console.log(`\nTEC performance test. End cooling. Left: ${initialTemps.leftTemp}->${coolingTemps.leftTemp} C and right: ${initialTemps.rightTemp}->${coolingTemps.rightTemp} C`
        );
        const coolingLeftdT = initialTemps.leftTemp - coolingTemps.leftTemp;
        const coolingRightdT = initialTemps.rightTemp - coolingTemps.rightTemp;
        console.log(`\nTEC performance test results. Left dT: ${this.formatdT(coolingLeftdT)} and right dT: ${this.formatdT(coolingRightdT)}`
        );

        console.log("\nTEC test. Heating for 60s...");
        await Promises.wait(90 * 1000);

        const heatingTemps = await this.getTemps();
        console.log(
            `\nTEC performance test. End heating. Left: ${coolingTemps.leftTemp}->${
                heatingTemps.leftTemp
            } C and right: ${coolingTemps.rightTemp}->${heatingTemps.rightTemp} C`
        );
        const heatingLeftdT = heatingTemps.leftTemp - coolingTemps.leftTemp;
        const heatingRightdT = heatingTemps.rightTemp - coolingTemps.rightTemp;
        console.log(
            `\nTEC performance test results. Left dT: ${this.formatdT(heatingLeftdT)} and right dT: ${this.formatdT(
                heatingRightdT
            )}`
        );
        return this.tecPass(coolingLeftdT, coolingRightdT, heatingLeftdT, heatingRightdT);
    }

    public async run() {
        console.log(`\nRunning health check (priming pumps & thermal performance) on dev ${this.devId}. Checking online...`);
        await this.online();
        const startTime = Math.floor(DateTime.local().valueOf() / 1000.0);
        const initialTemps = await this.getTemps();
        await this.primeSequence();

        await this.online();
        const tecPass = await this.tecTest(initialTemps);
        const endTime = Math.floor(DateTime.local().valueOf() / 1000.0);
        const runtime = Duration.fromObject({ seconds: endTime - startTime }).as("minutes");
        console.log(`\nFinished running tests in ${runtime.toFixed(2)} minutes`);
        if (tecPass) {
            console.log(colors.green("Test PASS. Next step: factory reset device"));
        } else {
            console.log(colors.red("Test FAIL. Please fill with water and try again"));
        }
    }
}
