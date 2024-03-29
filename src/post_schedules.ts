import { KelvinApi, StateEvent } from "@eight/practices";
import { retry, getDeviceId } from "./utilities";
import { DateTime } from "luxon";

function getFullThermalEvents(startTime: DateTime) {
    // 3 hours of max cooling + 1.5 hours max heating
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
            time: startTime.plus({ minutes: 30 }).toJSDate(),
            type: "temperatureControl",
            operation: "on"
        },
        {
            time: startTime.plus({ minutes: 30 }).toJSDate(),
            type: "temperatureControl",
            operation: "temperature",
            data: {
                value: 100
            }
        },
        {
            time: startTime.plus({ minutes: 30 + 30 }).toJSDate(),
            type: "temperatureControl",
            operation: "off"
        }
    ];
    return stateEvents;
}

function getMaxCoolEvents(startTime: DateTime) {
    // 1 hour max cooling
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
            time: startTime.plus({ hours: 1 }).toJSDate(),
            type: "temperatureControl",
            operation: "off"
        }
    ];
    return stateEvents;
}

function getMaxHeatEvents(startTime: DateTime) {
    // 3 hours of max cooling + 1.5 hours max heating
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
            time: startTime.plus({ hours: 1 }).toJSDate(),
            type: "temperatureControl",
            operation: "off"
        }
    ];
    return stateEvents;
}

async function setSchedule(kelvinApi: KelvinApi, deviceId: string, startTime: DateTime) {
    await retry(
        async () => {
            const stateEvents = getFullThermalEvents(startTime);
            await kelvinApi.putSideStateEvents(deviceId, "left", stateEvents);
            await kelvinApi.putSideStateEvents(deviceId, "right", stateEvents);
        },
        { timeoutMs: 2 * 60 * 1000 }
    );
}

export async function postSchedules(SNs: string[], startTime: DateTime) {
    const kelvinApi = new KelvinApi({ timeout: 5 * 1000 });

    const devices: { [serial: string]: string } = {};

    for (const SN of SNs) {
        const email = `mp${SN}@eightsleep.com`;
        const deviceId = await getDeviceId(email);
        devices[SN] = deviceId;
    }

    let deviceIds = Object.values(devices);
    deviceIds = ["1e001d001847373531373933"];

    for (const deviceId of deviceIds) {
        await setSchedule(kelvinApi, deviceId, startTime);
        console.log(`Just set schedule for ${deviceId}`);
    }
}
