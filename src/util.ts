import { UserShip, Location } from "./types.js";

export function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

export function groupBy<T, U>(list: Iterable<T>, keyGetter: (x: T) => U) {
    const map = new Map<U, T[]>();

    for (const item of list) {
        const key = keyGetter(item);

        const collection = map.get(key);
        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    }

    return map;
}

export function toMap<T, U>(list: T[], keyGetter: (x: T) => U) {
    const map = new Map<U, T>();

    list.forEach((item) => {
        const key = keyGetter(item);

        if (map.has(key)) throw new Error("Set not unique");
        map.set(key, item);
    });

    return map;
}

export function distinct<T, U>(list: T[], keyGetter: (x: T) => U) {
    return new Set(list.map(keyGetter));
}

export function dist(a: Location, b: Location) {
    return Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

export function calcTime(speed: number, from: Location, to: Location) {
    return Math.round(dist(from, to) * (3 / speed)) + 30;
}

export function calcFuel(ship: UserShip, from: Location, to: Location) {
    const isPlanet = from.type == "PLANET";
    let penalty = 0;
    let divider = 7.5;

    switch (ship.type) {
        case "HM-MK-III":
            divider = 10; // slightly too high
            penalty = isPlanet ? 1 : 0;
            break;
        case "GR-MK-III":
            penalty = isPlanet ? 4 : 0;
            break;
        case "GR-MK-II":
            penalty = isPlanet ? 3 : 0;
            break;
        default:
            penalty = isPlanet ? 2 : 0;
            break;
    }

    return Math.round(dist(from, to) / divider) + penalty + 1;
}

export function unixEpoch() {
    return Math.floor(new Date().getTime() / 1000);
}