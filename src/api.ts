import fetch from "node-fetch";
import { readFileSync, writeFileSync } from "fs";

import { UserData, FlightPlan, UserShip, Location, System, MarketItem, ShipData, Leaderboard } from "./types.js";
import { log } from "./logger.js";

let settings: {
    token: string;
    username: string;
} = JSON.parse(readFileSync("./src/settings.json").toString());

if (!settings.username) {
    console.log("Error: missing username in settings.json");
    process.exit(0);
}

export let credits = 0;

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

function checkError(res: any) {
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

async function _fetch<T>(url: string, method: "get" | "post" | "delete" = "get") {
    await rateLimit();

    let res: T = await (await fetch(url, { method })).json();
    log("trace", `[API] ${method.toUpperCase()} ${url}`);
    checkError(res);
    return res;
}

async function fetchAuth<T>(url: string, method: "get" | "post" | "put" | "delete" = "get") {
    await rateLimit();

    let res: T = await (await fetch(url, {
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

interface UserLoan {
    due: string;
    id: string;
    repaymentAmount: number;
    status: "CURRENT" | "PAID";
    type: string;
}

interface MarketOrder {
    credits: number;
    order: {
        good: string;
        quantity: number;
        pricePerUnit: number;
        total: number;
    }
    ship: UserShip;
}

interface ListingShip extends ShipData {
    purchaseLocations: {
        location: string;
        price: string;
        system: string;
    };
}

export namespace game {
    export function status() {
        return _fetch<{ status: string }>(`${baseUrl}/game/status`);
    }
    export function leaderboard() {
        return fetchAuth<Leaderboard>(`${baseUrl}/game/leaderboard/net-worth`);
    }
}

export namespace location {
    export async function info(location: string) {
        return (await fetchAuth<{ location: Location }>(`${baseUrl}/locations/${location}`)).location;
    }
    export async function market(location: string) {
        return (await fetchAuth<{ marketplace: MarketItem[] }>(`${baseUrl}/locations/${location}/marketplace`)).marketplace;
    }
    export async function ships(location: string) {
        return (await fetchAuth<{
            ships: {
                shipId: string;
                shipType: string;
                username: string;
            }
        }>(`${baseUrl}/locations/${location}/ships`)).ships;
    }
}

export namespace user {
    export async function create() {
        let temp = await _fetch<{ token: string }>(`${baseUrl}/users/${settings.username}/claim`, "post");

        settings.token = temp.token;
        writeFileSync("./src/settings.json", JSON.stringify(settings));

        return temp;
    }
}

export namespace my {
    const myUrl = `${baseUrl}/my`;

    export async function info() {
        let dat = (await fetchAuth<{ user: UserData }>(`${myUrl}/account`)).user;
        credits = dat.credits;

        return dat;
    }

    export namespace Loan {
        export async function get() {
            return (await fetchAuth<{ loans: UserLoan[] }>(`${myUrl}/loans`)).loans;
        }
        export function pay(id: string) {
            return fetchAuth(`${myUrl}/loans/${id}`, "put");
        }
        export async function request(type: string) {
            let dat = await fetchAuth<{
                credits: number;
                loan: UserLoan;
                ship: UserShip
            }>(`${myUrl}/loans?type=${type}`, "post");
            credits = dat.credits;
            return dat.loan;
        }
    }

    export namespace Ship {
        export async function get() {
            return (await fetchAuth<{ ships: UserShip[] }>(`${myUrl}/ships`)).ships;
        }

        export async function buy(type: string, location: string) {
            let dat = await fetchAuth<{
                credits: number;
                ship: UserShip;
            }>(`${myUrl}/ships?type=${type}&location=${location}`, "post")
            credits = dat.credits;
            return dat.ship;
        }

        export function scrap(shipId: string) {
            return fetchAuth(`${myUrl}/ships/${shipId}`, "delete");
        }

        export function transfer(from: string, to: string, good: string, quantity: number) {
            return fetchAuth(`${myUrl}/ships/${from}/transfer?toShipId=${to}&good=${good}&quantity=${quantity}`, "put");
        }
    }

    export async function submitFlight(shipId: string, destination: string) {
        return (await fetchAuth<{ flightPlan: FlightPlan }>(`${myUrl}/flight-plans?shipId=${shipId}&destination=${destination}`, "post")).flightPlan;
    }

    export async function purchase(ship: UserShip, good: string, quantity: number) {
        if (quantity == 0) return;

        if (quantity > ship.loadingSpeed) {
            await purchase(ship, good, ship.loadingSpeed);
            return await purchase(ship, good, quantity - ship.loadingSpeed);
        }

        let dat = await fetchAuth<MarketOrder>(`${myUrl}/purchase-orders?shipId=${ship.id}&good=${good}&quantity=${quantity}`, "post");
        credits = dat.credits;

        return dat.order;
    }

    export async function sell(ship: UserShip, good: string, quantity: number) {
        if (quantity == 0) return;

        if (quantity > ship.loadingSpeed) {
            await sell(ship, good, ship.loadingSpeed);
            return await sell(ship, good, quantity - ship.loadingSpeed);
        }

        let dat = await fetchAuth<MarketOrder>(`${myUrl}/sell-orders?shipId=${ship.id}&good=${good}&quantity=${quantity}`, "post");
        credits = dat.credits;

        return dat.order;
    }

    export async function warp(shipId: string) {
        return (await fetchAuth<{ flightPlan: FlightPlan }>(`https://api.spacetraders.io/my/warp-jumps?shipId=${shipId}`, "post")).flightPlan;
    }
}

export namespace system {
    const systemUrl = `${baseUrl}/systems`;

    export async function shipListings(system: string) {
        return (await fetchAuth<{
            shipListings: ListingShip[]
        }>(`${systemUrl}/${system}/ship-listings`)).shipListings;
    }
    export async function flightPlans(system: string) {
        return (await fetchAuth<{
            flightPlans: {
                arrivesAt: string;
                createdAt: string;
                departure: string;
                destination: string;
                id: string;
                shipId: string;
                shipType: string;
                username: string;
            }[]
        }>(`${systemUrl}/${system}/flight-plans`)).flightPlans;
    }
    export async function ships(system: string) {
        return (await fetchAuth<{
            ships: {
                shipId: string;
                shipType: string;
                username: string;
            }
        }>(`${systemUrl}/${system}/ships`)).ships;
    }
    export async function locations(system: string) {
        return (await fetchAuth<{
            locations: Location[]
        }>(`${systemUrl}/${system}/locations`)).locations;
    }
    export async function info(system: string) {
        return (await fetchAuth<{
            system: System;
        }>(`${systemUrl}/${system}`)).system;
    }
}

export namespace types {
    const typeUrl = `${baseUrl}/types`;

    export function goods() {
        return fetchAuth(`${typeUrl}/goods`);
    }
    export function loans(): Promise<LoanDetails> {
        return fetchAuth(`${typeUrl}/loans`);
    }
    export function structures() {
        return fetchAuth(`${typeUrl}/structures`);
    }
    export function ships() {
        return fetchAuth(`${typeUrl}/ships`);
    }
}
