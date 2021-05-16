import { calcTime, groupBy } from "./util.js"
import { Location, MarketItem } from "./types.js";
import { listenSocket } from "./reciever.js";

let logLevels = {
    trace: false,
    info: true,
    warning: true,
    error: true
};

function sleep(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
}

let elements = {
    root: document.querySelector(":root") as HTMLElement,
    username: document.getElementById("username"),
    credits: document.getElementById("credits"),
    ships: document.getElementById("ships"),
    log: {
        base: document.getElementById("log"),
        trace: document.getElementById("trace") as HTMLInputElement,
        info: document.getElementById("info") as HTMLInputElement,
        warn: document.getElementById("warn") as HTMLInputElement,
        error: document.getElementById("error") as HTMLInputElement,
    },
    market: {
        OE: document.getElementById("OE-market"),
        XV: document.getElementById("XV-market")
    },
    speed: document.getElementById("speed") as HTMLInputElement
}

let shipMap = new Map<string, TableEl>();

interface TableEl {
    row: HTMLTableRowElement;
    name: HTMLTableDataCellElement;
    location: HTMLTableDataCellElement;
    time: HTMLTableDataCellElement;
    gain: HTMLTableDataCellElement;
}

function dist(a: Location, b: Location) {
    return Math.round(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

function sortShips() {
    let els = Array.from(elements.ships.children);
    els.sort((a, b) => {
        let name = a.children[0].textContent.localeCompare(b.children[0].textContent);
        if (name != 0) return name;
        return a.children[1].textContent.localeCompare(b.children[1].textContent);
    });
    for (const item of els) {
        elements.ships.appendChild(item);
    }
}

elements.speed.oninput = updateMarkets;

elements.log.trace.oninput = () => {
    elements.root.style.setProperty("--trace", elements.log.trace.checked ? "block" : "none");
    logLevels.trace = elements.log.trace.checked;
}
elements.log.info.oninput = () => {
    elements.root.style.setProperty("--info", elements.log.info.checked ? "block" : "none");
    logLevels.info = elements.log.info.checked;

}
elements.log.warn.oninput = () => {
    elements.root.style.setProperty("--warning", elements.log.warn.checked ? "block" : "none");
    logLevels.warning = elements.log.warn.checked;

}
elements.log.error.oninput = () => {
    elements.root.style.setProperty("--error", elements.log.error.checked ? "block" : "none");
    logLevels.error = elements.log.error.checked;
}

listenSocket("info", (info) => {
    elements.username.innerText = info.username;

    elements.credits.innerText = info.credits.toLocaleString();

    for (const ship of info.ships) {
        let row = shipMap.get(ship.id);

        if (!row) {
            row = {
                row: document.createElement("tr"),
                name: document.createElement("td"),
                location: document.createElement("td"),
                time: document.createElement("td"),
                gain: document.createElement("td")
            };

            row.row.append(row.name, row.location, row.time, row.gain);
            elements.ships.append(row.row);

            shipMap.set(ship.id, row);
        }

        row.name.innerText = ship.type;
        if (ship.location) {
            row.location.innerText = ship.location;
        } else if (row.location.innerText == "") {
            row.location.innerText = "In transit";
        }
    }

    sortShips();
});

listenSocket("flight", async (flight) => {
    let el = shipMap.get(flight.ship.id);
    if (!el) return;
    el.location.innerText = `${flight.from.symbol} ➔ ${flight.to.symbol}`;
    el.gain.innerText = flight.gain.toFixed(2);

    sortShips();

    let arrive = new Date(flight.plan.arrivesAt);
    while (true) {
        let now = new Date();

        if (now > arrive) {
            el.time.innerText = "";
            el.gain.innerText = "";
            el.location.innerText = flight.to.symbol;
            break;
        }
        // @ts-ignore
        el.time.innerText = ((arrive - now) / 1000).toFixed(0);

        await sleep(500);
    }
});

listenSocket("log", (data) => {
    let log = elements.log.base;

    while (log.children.length > 500) {
        log.removeChild(log.firstChild);
    }

    if (!logLevels[data.level]) {
        return;
    }

    let el = document.createElement("div");
    el.innerText = data.message;
    el.classList.add(data.level);

    let atBottom = log.scrollTop + log.clientHeight == log.scrollHeight;
    log.append(el);

    if (atBottom) {
        log.scrollTo(0, log.scrollTop + log.scrollHeight);
    }
});


interface MarketEl {
    good: HTMLElement;
    from: HTMLElement;
    to: HTMLElement;
    gain: HTMLElement;
};

function updateMarkets() {
    function func(locations: Location[], marketItems: MarketEl[], parent: HTMLElement) {
        let res = new Map<string, {
            buy: Location;
            sell: Location;

            symbol: string;
            gain: number;
        }>();

        const speed = elements.speed.valueAsNumber;

        for (const a of locations) {
            let map = new Map<string, MarketItem>();
            a.marketplace.forEach(x => map.set(x.symbol, x));

            if(map.get("FUEL").quantityAvailable < 1000) continue;

            for (const b of locations) {
                if (a === b) continue;

                if(b.marketplace.filter(x => x.symbol == "FUEL")[0].quantityAvailable < 1000) continue;
                let len = calcTime(speed, a, b);

                for (const bm of b.marketplace) {
                    const am = map.get(bm.symbol);
                    if (!am) continue;

                    let gain = (bm.sellPricePerUnit - am.purchasePricePerUnit) / am.volumePerUnit / len;

                    let sub = res.get(am.symbol);
                    if (!sub || sub.gain < gain) {
                        res.set(am.symbol, {
                            buy: a,
                            sell: b,
                            symbol: am.symbol,
                            gain
                        });
                    }
                }
            }
        }

        let items = [...res.values()].sort((a, b) => b.gain - a.gain);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            let el = marketItems[i];
            if (!el) {
                let row = document.createElement("tr");
                el = {
                    good: document.createElement("td"),
                    from: document.createElement("td"),
                    to: document.createElement("td"),
                    gain: document.createElement("td")
                };

                row.append(el.good, el.from, el.to, el.gain);
                parent.append(row);
                marketItems[i] = el;
            }

            el.good.innerText = item.symbol;
            el.from.innerText = item.buy.symbol;
            el.to.innerText = item.sell.symbol;
            el.gain.innerText = (item.gain * 400).toFixed(2);
        }
    }

    let sub = groupBy(marketData, x => x.symbol.substr(0, 2));

    for (const [k, v] of sub) {
        let items = marketItems.get(k);
        if (!items) {
            items = [];
            marketItems.set(k, items);
        }

        func(v, items, elements.market[k]);
    }
}

let marketItems = new Map<string, MarketEl[]>();
let marketData: Location[] = null;

listenSocket("market", (data) => {
    marketData = data;
    updateMarkets();
});
