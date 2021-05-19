import { FlightData, Message, Location, LogData, InfoMessage, LeaderboardMessage, MarketMessage } from "./types.js";

let socket = new WebSocket(`ws://${window.location.host}/`);
// let socket = new WebSocket(`ws://192.168.0.5:8081/`);
let listeners = new Map<string, any[]>();

socket.onmessage = (event) => {
    let data: Message = JSON.parse(event.data);

    let funcs = listeners.get(data.type);
    if (!funcs) return;

    for (const f of funcs) {
        try {
            f(data.data);
        } catch (e) {
            console.error(e);
        }
    }
}

export function listenSocket(type: "leaderboard", cb: (data: LeaderboardMessage["data"]) => any);
export function listenSocket(type: "info", cb: (data: InfoMessage["data"]) => any);
export function listenSocket(type: "flight", cb: (data: FlightData) => any);
export function listenSocket(type: "log", cb: (data: LogData) => any);
export function listenSocket(type: "market", cb: (data: MarketMessage["data"]) => any);

export function listenSocket(type: string, cb: (data: any) => any) {
    if (!listeners.has(type)) {
        listeners.set(type, [cb]);
    } else {
        listeners.get(type).push(cb);
    }
}
