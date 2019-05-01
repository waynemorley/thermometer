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

    private async getTemps(): Promise<any> {
        try {
            const state = await this.deviceApi.getState(this.devId);
            const leftT = this.convertTemp((state["heatLevelL"] as any).value as number);
            const rightT = this.convertTemp((state["heatLevelR"] as any).value as number);
            return {
                leftTemp: leftT.toFixed(2),
                rightTemp: rightT.toFixed(2)
            };
        } catch (error) {
            console.log(`Error getting temps: ${error}`);
        }
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
                    value: -100
                }
            },
            {
                time: startTime.plus({ seconds: 60 }).toJSDate(),
                type: "temperatureControl",
                operation: "temperature",
                data: {
                    value: 100
                }
            },
            {
                time: startTime.plus({ seconds: 60 + 30 }).toJSDate(),
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
        delta = Math.abs(delta);
        if (delta < 1 || delta > 5) {
            return colors.red(`${delta.toFixed(2)}`);
        } else {
            return colors.green(`${delta.toFixed(2)}`);
        }
    }

    public async online(retries: number) {
        while (retries > 0) {
            try {
                const status = await this.garbageApi.getDevice(this.devId);
                console.log(status);
                if (status.online) {
                    return true;
                } else {
                    retries = retries - 1;
                }
            } catch (error) {
                console.log(`Error getting device state: ${error}`);
                retries = retries - 1;
            }
        }
        return false;
    }

    public async primeSequence() {
        console.log("\nBeginning short prime sequence. Priming for 2 minutes...");
        try {
            await this.deviceApi.callFunction(this.devId, "prime", true);
            await Promises.wait(2 * 60 * 1000); // two min

            console.log("\nPrime sequence. Resetting device...");
            await this.deviceApi.callFunction(this.devId, "reset", true);
            await Promises.wait(400);

            console.log("\nPrime sequence. Toggling pumps...");
            const stateEvents = this.getPumpToggleEvents(DateTime.utc());
            this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
            this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

            // TODO: check current and voltage of pumps in kibana
        } catch (error) {
            console.log(`\nPrime sequence stopped due to error ${error}`);
        }
    }

    private tecPass(...deltas: number[]) {
        for (const delta of deltas) {
            if (Math.abs(delta) < 1 || Math.abs(delta) > 5) return false;
        }
        return true;
    }

    public async tecTest() {
        const initialTemps = await this.getTemps();

        console.log(`\nTEC test with initial temps ${JSON.stringify(initialTemps)}. Cooling for 60s...`);

        const stateEvents = this.getTecTestEvents(DateTime.utc());
        this.kelvinApi.putSideStateEvents(this.devId, "left", stateEvents);
        this.kelvinApi.putSideStateEvents(this.devId, "right", stateEvents);

        await Promises.wait(60 * 1000);

        const coolingTemps = await this.getTemps();
        console.log(`\nTEC performance test. End cooling. Left: ${initialTemps.leftTemp}->${coolingTemps.leftTemp} C and right: ${initialTemps.rightTemp}->${coolingTemps.rightTemp} C`
        );
        const coolingLeftdT = initialTemps.leftTemp - coolingTemps.leftTemp;
        const coolingRightdT = initialTemps.rightTemp - coolingTemps.rightTemp;
        console.log(`\nTEC performance test results. Left dT: ${this.formatdT(coolingLeftdT)} and right dT: ${this.formatdT(coolingRightdT)}`
        );

        console.log("\nTEC test. Heating for 30s...");
        await Promises.wait(30 * 1000);

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
        console.log(`\nRunning health check (priming pumps & thermal performance) on dev ${this.devId}...`);
        // let online = await this.online(5);
        // if (!online) {
        //     console.log(`Device ${this.devId} appears to be offline, quitting...`);
        //     return;
        // }
        const startTime = Math.floor(DateTime.local().valueOf() / 1000.0);
        await this.primeSequence();
        // online = await this.online(5);
        // if (!online) {
        //     console.log(`Device ${this.devId} appears to be offline, quitting...`);
        //     return;
        // }
        const tecPass = await this.tecTest();
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
