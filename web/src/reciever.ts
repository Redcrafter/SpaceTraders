import { FlightData, Message, UserData, Location, LogData } from "./types.js";

let socket = new WebSocket(`ws://${window.location.host}/`);
let listeners = new Map<string, any[]>();

socket.onmessage = (event) => {
    let data: Message = JSON.parse(event.data);

    let funcs = listeners.get(data.type);
    if (!funcs) return;

    for (const f of funcs) {
        f(data.data);
    }
}

export function listenSocket(type: "info", cb: (data: UserData) => any);
export function listenSocket(type: "flight", cb: (data: FlightData) => any);
export function listenSocket(type: "log", cb: (data: LogData) => any);
export function listenSocket(type: "market", cb: (data: Location[]) => any);

export function listenSocket(type: string, cb: (data: any) => any) {
    if (!listeners.has(type)) {
        listeners.set(type, [cb]);
    } else {
        listeners.get(type).push(cb);
    }
}
