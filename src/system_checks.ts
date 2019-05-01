import { DeviceApi, ClientApi, TempControl } from "@eight/practices";
import { Promises } from "@eight/promises";

interface SideTemps {
    leftTemp: number;
    rightTemp: number;
}

export class HealthCheck {
    private devId: string;
    private deviceApi: DeviceApi;

    constructor(devId: string, deviceApi: DeviceApi) {
        this.devId = devId;
        this.deviceApi = deviceApi;
    }

    private convertTemp(level: number) {
        const b = 27; // y-intercept
        if (level === 0) return b;
        if (level < 0)
            return level * 0.12 + b;
        if (level > 0)
            return level * 0.18 + b;

        throw new Error(`Invalid level ${level}`);
    }

    private async getTemps(): Promise<SideTemps> {
        const state = await this.deviceApi.getState(this.devId);
        const leftT = this.convertTemp((state["heatLevelL"] as any).value as number);
        const rightT = this.convertTemp((state["heatLevelR"] as any).value as number);

        return {
            leftTemp: leftT,
            rightTemp: rightT
        };
    }

    private async setTemps(lev: number, dur: number) {
        const leftSetting: TempControl = {
            side: "left",
            level: lev,
            duration: dur
        };
        await this.deviceApi.setTemp(this.devId, leftSetting);
        const rightSetting: TempControl = {
            side: "right",
            level: lev,
            duration: dur
        };
        await this.deviceApi.setTemp(this.devId, rightSetting);
    }

    public async primeSequence() {
        console.log("\nBeginning short prime sequence. Priming for 2 minutes...");
        await this.deviceApi.callFunction(this.devId, "prime", true);
        await Promises.wait(2 * 60 * 1000); // two min

        console.log("\nPrime sequence. Resetting device...");
        await this.deviceApi.callFunction(this.devId, "reset", true);
        await Promises.wait(200);

        console.log("\nPrime sequence. Toggling pumps...");
        await this.setTemps(0, 10); // ambient for 10 seconds
        await Promises.wait(10 * 1000);

        console.log("\nPrime sequence. Resetting device...");
        await this.deviceApi.callFunction(this.devId, "reset", true);
        await Promises.wait(200);
    }

    public async pumpTest() {
        // todo: check voltages and currents in kibana
        this.primeSequence();

        console.log("\nPump test. 5s at ambient...");
        await this.setTemps(0, 5); // ambient for 5 seconds

        await Promises.wait(5 * 1000);
    }

    public async tecTest() {
        await this.deviceApi.callFunction(this.devId, "reset", true);
        await Promises.wait(200);
        const initialTemps = await this.getTemps();

        console.log("\nTEC test. Cooling for 60s...");
        await this.setTemps(-100, 60);
        await Promises.wait(60 * 1000);

        const coolingTemps = await this.getTemps();
        console.log(`\nTEC performance test. End cooling. Left dT: ${initialTemps.leftTemp}->${coolingTemps.leftTemp} C and right dT: ${initialTemps.rightTemp}->${coolingTemps.rightTemp} C`);
        const coolingLeftdT = initialTemps.leftTemp - coolingTemps.leftTemp;
        const coolingRightdT = initialTemps.rightTemp - coolingTemps.rightTemp;

        console.log("\nTEC test. Heating for 30s...");
        await this.setTemps(100, 30);
        await Promises.wait(30 * 1000);

        const heatingTemps = await this.getTemps();
        console.log(`\nTEC performance test. End heating. Left dT: ${coolingTemps.leftTemp}->${heatingTemps.leftTemp} C and right dT: ${coolingTemps.rightTemp}->${heatingTemps.rightTemp} C`);
        const heatingLeftdT = coolingTemps.leftTemp - heatingTemps.leftTemp;
        const heatingRightdT = coolingTemps.rightTemp - heatingTemps.rightTemp;

        console.log(`\nTEC results. Cooling dTs L:${coolingLeftdT} and R:${coolingRightdT} (acceptable: [-1,-5]) and heating dTs L:${heatingLeftdT} and R:${heatingRightdT} (acceptable: [1,5])`);
    }

    public async run() {
        console.log(`\nRunning health check (priming, pump test, and TECs) on dev ${this.devId}...`);
        await this.pumpTest();
        await this.tecTest();
    }
}