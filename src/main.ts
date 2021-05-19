import { performance } from "perf_hooks";

import { ApiError, credits, game, location, my, system, user } from "./api.js";
import { calcFuel, calcTime, distinct, groupBy, sleep, toMap, unixEpoch } from "./util.js";
import { broadcast } from "./frontend.js";
import { UserShip, MarketItem, UserData, Location, MarketLocation } from "./types.js";
import { log, logError } from "./logger.js";

let ships: UserShip[];

let systems: Map<string, MarketLocation[]> = null;
let locations: Map<string, MarketLocation> = null;
let rawLocs = new Map<string, Location>();

let lastOrder = new Map<string, { symbol: string, cost: number, startTime: number }>();

function selectShips(ships: UserShip[]) {
    return ships.filter(x => x.location !== undefined && x.type !== "JW-MK-I");
}

interface idk {
    l: Location;
    o: MarketItem;

    gain: number;
};

async function fetchMarkets(requestSystems: Set<string>) {
    let markets: MarketLocation[] = [];

    for (const locSymbol of distinct(ships, x => x.location)) {
        let sys = locSymbol?.substr(0, 2);

        if (!requestSystems.has(sys)) continue;

        if (!rawLocs.has(locSymbol)) {
            for (const item of await system.locations(sys)) {
                rawLocs.set(item.symbol, item);
            }
        }
        let loc = rawLocs.get(locSymbol);
        if (!loc) throw new Error("location does not exist");

        markets.push(Object.assign({
            marketplace: await location.market(locSymbol)
        }, loc));
    }

    broadcast({ type: "market", data: markets });

    systems = groupBy(markets, x => x.symbol.substr(0, 2));
    locations = toMap(markets, x => x.symbol);
}

function scoreRoute(ship: UserShip, start: MarketLocation, end: MarketLocation) {
    let best: MarketItem = null;
    let bestGain = 0;

    let buy = toMap(start.marketplace, x => x.symbol);
    let time = calcTime(ship.speed, start, end);

    let fuel = calcFuel(ship, start, end);
    let fuelCost = fuel * buy.get("FUEL").pricePerUnit;
    let freeCargo = ship.maxCargo - fuel;

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
        const gain = (Math.floor(freeCargo / item.volumePerUnit) * (item.sellPricePerUnit - source.purchasePricePerUnit) - fuelCost) / time;

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

function bestRoutes(ship: UserShip, start: MarketLocation, depth = 2) {
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

        sellCount += (await my.sell(ship.id, cargo.good, cargo.quantity)).total;
    }
    ship.cargo = [];

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
        buyCount = Math.min(buyCount, Math.floor(credits / resource.pricePerUnit),);

        // can't afford to buy cargo
        if (buyCount == 0) return;

        // route would loose mony so don't buy anything
        if (route.gain <= 0) {
            buyCount = 0;
        }
    }

    await my.purchase(ship.id, "FUEL", fuelCost - fuelHave);

    if (buyCount != 0) {
        let order = await my.purchase(ship.id, resource.symbol, buyCount);

        lastOrder.set(ship.id, { symbol: resource.symbol, cost: order.total, startTime: performance.now() });
        log("info", `[main] Trip ${shipLoc.symbol} -> ${destination.symbol} ${resource.symbol}`);
    } else {
        log("info", `[main] Trip ${shipLoc.symbol} -> ${destination.symbol}`);
    }

    // TODO: when too little fuel by extra
    let plan = await my.submitFlight(ship.id, destination.symbol);

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
    ships = await my.Ship.get();
    broadcast({
        type: "info", data: {
            credits,
            ships
        }
    });

    let validShips = selectShips(ships);
    if (validShips.length == 0) return;

    log("info", "[main] Fetching markets");
    await fetchMarkets(distinct(validShips, x => x.location.substr(0, 2)));

    for (const ship of validShips) {
        await planShip(ship).catch(logError);
    }
}

async function setup() {
    async function doFlight(ship: UserShip, dest: Location | string) {
        if(typeof dest == "string") {
            dest = locations.get(dest);
        }

        let loc = locations.get(ship.location);
        if (loc == dest) return;

        let fuel = calcFuel(ship, loc, dest);

        await my.purchase(ship.id, "FUEL", fuel);
        let plan = await my.submitFlight(ship.id, dest.symbol);

        return plan.timeRemainingInSeconds * 1000;
    }

    async function waitCredits(n: number) {
        while (credits < n) {
            try {
                await planTrip();
            } catch (e) { }
        }
    }

    function buyJw() { return my.Ship.buy("JW-MK-I", "OE-PM-TR"); }

    await user.create();
    await my.Loan.request("STARTUP");

    let scouts = [
        (await buyJw()),
        (await buyJw()),
        (await buyJw())
    ];

    let locations = toMap(await system.locations("OE"), x => x.name);

    await doFlight(scouts[0], "OE-PM");
    await sleep(await doFlight(scouts[1], "OE-NY"));

    await my.Ship.buy("GR-MK-II", "OE-NY");

    await waitCredits(300000);
    await my.Ship.buy("GR-MK-III", "OE-NY");

    // play and buy scouts
    for (const [k, v] of locations) {
        if (k == "OE-PM" || k == "OE-NY" || k == "OE-PM-TR") continue;

        await waitCredits(30000);
        let ship = await buyJw();
        await doFlight(ship, v);
    }

    for (let i = 0; i < 5; i++) {
        await waitCredits(300000);
        await my.Ship.buy("GR-MK-III", "OE-NY");
    }
}

async function main() {
    let running = true;

    // stop main loop an enter
    process.stdin.once('data', data => {
        running = false;
    });

    // fetch initial credit count
    await my.info();

    let lastCredits = 0;

    while (running) {
        try {
            await planTrip();

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
