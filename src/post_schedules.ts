import { KelvinApi, StateEvent } from "@eight/practices";
import { retry, getDeviceId } from "./utilities";
import { DateTime } from "luxon";

function getKelvinEvents(startTime: DateTime) {
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
            time: startTime.plus({ hours: 3 }).toJSDate(),
            type: "temperatureControl",
            operation: "on"
        },
        {
            time: startTime.plus({ hours: 3 }).toJSDate(),
            type: "temperatureControl",
            operation: "temperature",
            data: {
                value: 100
            }
        },
        {
            time: startTime.plus({ hours: 3 + 1.5 }).toJSDate(),
            type: "temperatureControl",
            operation: "off"
        }
    ];
    return stateEvents;
}

async function setSchedule(kelvinApi: KelvinApi, deviceId: string, startTime: DateTime) {
    await retry(
        async () => {
            const stateEvents = getKelvinEvents(startTime);
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

    console.log(devices);

    for (const deviceId of Object.values(devices)) {
        await setSchedule(kelvinApi, deviceId, startTime);
        console.log(`Just set schedule for ${deviceId}`);
    }
}
