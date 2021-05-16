import { performance } from "perf_hooks";

import { ApiError, game, user } from "./api.js";
import { calcFuel, calcTime, distinct, groupBy, sleep, toMap, unixEpoch } from "./util.js";
import { broadcast } from "./frontend.js";
import { UserShip, MarketItem, UserData, Location } from "./types.js";
import { log, logError } from "./logger.js";

let info: UserData;
let systems: Map<string, Location[]> = null;
let locations: Map<string, Location> = null;

let lastOrder = new Map<string, { symbol: string, cost: number, startTime: number }>();

function selectShips(ships: UserShip[]) {
    return ships.filter(x => x.location !== undefined && x.type !== "JW-MK-I");
}

interface idk {
    l: Location;
    o: MarketItem;

    gain: number;
};

async function fetchMarkets(sys: Set<string>) {
    let markets = await Promise.all([...distinct(info.ships, x => x.location)].filter(x => sys.has(x?.substr(0, 2))).map(x => game.market(x)));

    broadcast({ type: "market", data: markets });

    systems = groupBy(markets, x => x.symbol.substr(0, 2));
    locations = toMap(markets, x => x.symbol);
}

function scoreRoute(ship: UserShip, start: Location, end: Location) {
    let best: MarketItem = null;
    let bestGain = 0;

    let buy = toMap(start.marketplace, x => x.symbol);
    let time = calcTime(ship.speed, start, end);
    let freeCargo = ship.maxCargo - calcFuel(ship, start, end);

    for (const item of end.marketplace) {
        if (item.symbol == "FUEL" && item.quantityAvailable < 1000) {
            // prevent ships from going to systems with low fuel
            return {
                best: null,
                gain: -Infinity
            }
        }

        const source = buy.get(item.symbol);
        if (!source) continue;

        // skip route if not enough cargo is available
        if (source.quantityAvailable * item.volumePerUnit < freeCargo) continue;

        // (buyAmount * gain) / time
        const gain = Math.floor(freeCargo / item.volumePerUnit) * (item.sellPricePerUnit - source.purchasePricePerUnit) / time;

        if (gain > bestGain) {
            best = item;
            bestGain = gain;
        }
    }

    return {
        best,
        gain: bestGain
    };
}

function bestRoutes(ship: UserShip, start: Location, depth = 2) {
    let best: idk = null;
    let bestGain = 0;

    for (const end of systems.get(ship.location.substr(0, 2))) {
        if (end == start) continue;

        let res = scoreRoute(ship, start, end);

        let totalGain = res.gain;
        if (depth > 1) {
            let sub = bestRoutes(ship, end, depth - 1);

            // no good return route found
            totalGain = (res.gain + (sub ? sub.gain : 0)) / 2;
        }

        if (totalGain > bestGain) {
            best = {
                l: end,
                o: res.best,
                gain: res.gain // only report local gain
            };
            bestGain = totalGain; // return the best route with future gain in mind
        }
    }

    return best;
}

async function planShip(ship: UserShip) {
    let shipLoc = locations.get(ship.location);

    let route = bestRoutes(ship, shipLoc);
    if (!route) { // only happens if market is saturated
        log("info", "[main] Skipped route");
        return;
    }

    let destination: Location = route.l;
    let resource: MarketItem = route.o;

    let fuelCost = calcFuel(ship, shipLoc, destination);
    let fuelHave = 0;

    // sell cargo
    let sellCount = 0;
    for (const cargo of ship.cargo) {
        if (cargo.good == "FUEL") {
            let count = cargo.quantity - fuelCost;
            if (count < 0) {
                fuelHave = cargo.quantity;
                continue;
            }
        }
        sellCount += (await user.sell(ship, cargo.good, cargo.quantity)).order.total;
    }
    ship.cargo = [];

    info.credits += sellCount;

    if (lastOrder.has(ship.id)) { // log profits
        const last = lastOrder.get(ship.id);
        const time = (performance.now() - last.startTime) / 1000;
        const gain = sellCount - last.cost;
        log("info", `[main] Made ${gain} ${(gain / time).toFixed(1)}/s from ${last.symbol}`);

        lastOrder.delete(ship.id);
    }

    let buyCount = 0;
    if (resource) {
        buyCount = Math.floor((ship.maxCargo - fuelCost) / resource.volumePerUnit);
        buyCount = Math.min(buyCount, Math.floor(info.credits / resource.pricePerUnit),);

        // can't afford to buy cargo
        if (buyCount == 0) return;

        // route would loose mony so don't buy anything
        if (route.gain <= 0) {
            buyCount = 0;
        }
    }

    let order = await user.purchase(ship, "FUEL", fuelCost - fuelHave);
    info.credits = order.credits;

    if (buyCount != 0) {
        order = await user.purchase(ship, resource.symbol, buyCount);
        info.credits = order.credits;

        lastOrder.set(ship.id, { symbol: resource.symbol, cost: order.order.total, startTime: performance.now() });
        log("info", `[main] Trip ${shipLoc.symbol} -> ${destination.symbol} ${resource.symbol}`);
    } else {
        log("info", `[main] Trip ${shipLoc.symbol} -> ${destination.symbol}`);
    }

    // TODO: when too little fuel by extra
    let plan = await user.submitFlight(ship.id, destination.symbol);

    broadcast({
        type: "flight",
        data: {
            from: shipLoc,
            to: destination,
            plan,
            ship,
            gain: route.gain
        }
    });
}

async function planTrip() {
    info = await user.info();
    broadcast({ type: "info", data: info });

    let validShips = selectShips(info.ships);
    if (validShips.length == 0) return info;

    log("info", "[main] Fetching markets");
    await fetchMarkets(distinct(validShips, x => x.location.substr(0, 2)));

    for (const ship of validShips) {
        await planShip(ship).catch(logError);
    }

    return info;
}

async function setup() {
    await user.create();
    await user.requestLoan("STARTUP");

    {
        let ship = await user.buyShip("JW-MK-I", "OE-PM-TR");
        await user.purchase(ship, "FUEL", 1);
        await user.submitFlight(ship.id, "OE-PM");
    }

    let locations = toMap(await game.locations("OE"), x => x.name);

    async function doFlight(ship: UserShip, dest: Location) {
        let loc = locations.get(ship.location);
        if (loc == dest) return;

        let fuel = calcFuel(ship, loc, dest);

        await user.purchase(ship, "FUEL", fuel);
        let plan = await user.submitFlight(ship.id, dest.symbol);

        return plan.timeRemainingInSeconds * 1000;
    }

    async function waitCredits(n: number) {
        while (info.credits < n) {
            try {
                info = await planTrip();
            } catch (e) { }
        }
    }

    {
        let ship = await user.buyShip("JW-MK-I", "OE-PM-TR");
        await sleep(await doFlight(ship, locations.get("OE-NY")));
    }

    await user.buyShip("GR-MK-II", "OE-NY");

    let info = await user.info();

    await waitCredits(30000);
    await user.buyShip("JW-MK-I", "OE-PM-TR");

    await waitCredits(300000);
    await user.buyShip("GR-MK-III", "OE-NY");

    // play and buy scouts
    for (const [k, v] of locations) {
        if (k == "OE-PM" || k == "OE-NY" || k == "OE-PM-TR") continue;

        await waitCredits(30000);
        let ship = await user.buyShip("JW-MK-I", "OE-PM-TR");
        await doFlight(ship, v);
    }

    for (let i = 0; i < 5; i++) {
        await waitCredits(300000);
        await user.buyShip("GR-MK-III", "OE-NY");
    }
}

async function main() {
    let running = true;

    // stop main loop an enter
    process.stdin.once('data', data => {
        running = false;
    });

    let lastCredits = 0;

    while (running) {
        try {
            let info = await planTrip();

            let credits = info.credits;
            if (credits != lastCredits) {
                console.log(`Credits: ${credits}`);
                lastCredits = credits;
            }
        } catch (e) {
            if (e instanceof ApiError) {
                if (e.data.message == "Token was invalid or missing from the request. Did you confirm sending the token as a query parameter or authorization header?") {
                    await setup();
                }
            } else {
                logError(e);
            }
        }
    }

    if (!running) process.exit(0);
}

main().catch(logError);
