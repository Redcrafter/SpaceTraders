import fetch from "node-fetch";
import { readFileSync, writeFileSync } from "fs";

import { UserData, FlightPlan, UserShip, MarketOrder, Location, System } from "./types.js";
import { log } from "./logger.js";

let settings: {
    token: string;
    username: string;
} = JSON.parse(readFileSync("./src/settings.json").toString());

const baseUrl = "https://api.spacetraders.io";

interface ErrorData {
    message: string;
    code: number;
    data?: any;
}
export class ApiError extends Error {
    data: ErrorData;

    constructor(data: ErrorData) {
        super(`[API] ${JSON.stringify(data)}`);
        this.name = "Api Error";
        this.data = data;
    }

    toString() {
        return `[API] ${this.message}`;
    }
}

function checkError(res) {
    if (res.error) {
        log("error", `[API] ${res.error.code} ${res.error.message}`);
        throw new ApiError(res.error);
    }
}

let reqQueue = Promise.resolve();

async function rateLimit() {
    let localWait = reqQueue;
    let next;
    reqQueue = new Promise(res => next = res);
    await localWait;
    setTimeout(next, 510);
}

async function _fetch(url: string, method: "get" | "post" | "delete" = "get") {
    await rateLimit();

    let res = await (await fetch(url, { method })).json();
    log("trace", `[API] ${method.toUpperCase()} ${url}`);
    checkError(res);
    return res;
}

async function fetchAuth(url: string, method: "get" | "post" | "put" | "delete" = "get") {
    await rateLimit();

    let res = await (await fetch(url, {
        headers: {
            Authorization: `Bearer ${settings.token}`
        },
        method: method
    })).json();
    log("trace", `[API] ${method.toUpperCase()} ${url}`);
    checkError(res);
    return res;
}

interface LoanDetails {
    amount: number;
    collateralRequired: boolean;
    rate: number;
    termInDays: number;
    type: "STARTUP";
}

interface LoanResponse {
    credits: number;
    loan: {
        due: string;
        id: string;
        repaymentAmount: number;
        status: string;
        type: string;
    }
}

interface LeaderboardEntry {
    username: string;
    netWorth: number;
    rank: number;
}

interface Leaderboard {
    netWorth: LeaderboardEntry[];
    userNetWorth: [LeaderboardEntry];
}

namespace game {
    const gameUrl = `${baseUrl}/game`;

    export function status() {
        return _fetch(`${gameUrl}/status`);
    }
    export function loans(): Promise<LoanDetails> {
        return fetchAuth(`${gameUrl}/loans`);
    }
    export function ships() {
        return fetchAuth(`${gameUrl}/ships`);
    }
    export async function systems(): Promise<System[]> {
        return (await fetchAuth(`${gameUrl}/systems`)).systems;
    }
    export async function locations(system: string): Promise<Location[]> {
        return (await fetchAuth(`https://api.spacetraders.io/game/systems/${system}/locations`)).locations
    }
    export async function market(location: string): Promise<Location> {
        return (await fetchAuth(`${gameUrl}/locations/${location}/marketplace`)).location;
    }
    export function leaderboard(): Promise<Leaderboard> {
        return fetchAuth(`${gameUrl}/leaderboard/net-worth`);
    }
}

namespace user {
    const userUrl = `${baseUrl}/users/${settings.username}`;

    export async function create() {
        let temp = await _fetch(`${userUrl}/token`, "post");

        settings.token = temp.token;
        writeFileSync("./src/settings.json", JSON.stringify(settings));

        return temp;
    }
    export async function info(): Promise<UserData> {
        return (await fetchAuth(`${userUrl}`)).user;
    }
    export async function submitFlight(shipId: string, destination: string): Promise<FlightPlan> {
        return (await fetchAuth(`${userUrl}/flight-plans?shipId=${shipId}&destination=${destination}`, "post")).flightPlan;
    }

    export function transferCargo(from: string, to: string, good: string, quantity: number) {
        return fetchAuth(`${userUrl}/ships/${from}/transfer?toShipId=${to}&good=${good}&quantity=${quantity}`, "put");
    }

    const buyLimit = 500;

    export async function purchase(ship: UserShip, good: string, quantity: number): Promise<MarketOrder> {
        // TODO: check storage?
        // ship.cargo.push({ good, quantity, totalVolume: ?? });
        if (quantity == 0) return;

        if (quantity > buyLimit) {
            let a = await purchase(ship, good, buyLimit);
            let b = await purchase(ship, good, quantity - buyLimit);

            return {
                credits: b.credits,
                order: {
                    good,
                    pricePerUnit: (a.order.pricePerUnit + b.order.pricePerUnit) / 2,
                    quantity,
                    total: a.order.total + b.order.total
                },
                ship: b.ship
            };
        }

        return fetchAuth(`${userUrl}/purchase-orders?shipId=${ship.id}&good=${good}&quantity=${quantity}`, "post");
    }

    export async function sell(ship: UserShip, good: string, quantity: number): Promise<MarketOrder> {
        if (quantity == 0) return;

        if (quantity > buyLimit) {
            let a = await sell(ship, good, buyLimit);
            let b = await sell(ship, good, quantity - buyLimit);

            return {
                credits: b.credits,
                order: {
                    good,
                    pricePerUnit: (a.order.pricePerUnit + b.order.pricePerUnit) / 2,
                    quantity,
                    total: a.order.total + b.order.total
                },
                ship: b.ship
            };
        }

        return fetchAuth(`${userUrl}/sell-orders?shipId=${ship.id}&good=${good}&quantity=${quantity}`, "post");
    }

    export function scrapShip(shipId: string) {
        return fetchAuth(`${userUrl}/ships/${shipId}`, "delete");
    }

    export function requestLoan(type: string): Promise<LoanResponse> {
        return fetchAuth(`${userUrl}/loans?type=${type}`, "post");
    }

    export async function buyShip(type: string, location: string): Promise<UserShip> {
        return (await fetchAuth(`${userUrl}/loans?type=${type}&location=${location}`, "post")).ship;
    }
}

export {
    game,
    user
}