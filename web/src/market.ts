import { listenSocket } from "./reciever.js";
import { calcTime, groupBy } from "./util.js"
import { Location, MarketItem, MarketLocation } from "./types.js";

interface MarketEl {
    good: HTMLElement;
    from: HTMLElement;
    to: HTMLElement;
    gain: HTMLElement;
};

let marketItems = new Map<string, MarketEl[]>();
let marketData: MarketLocation[] = null;

let elements = {
    market: {
        OE: document.getElementById("OE-market"),
        XV: document.getElementById("XV-market")
    },
    speed: document.getElementById("speed") as HTMLInputElement
}

elements.speed.oninput = updateMarkets;

function updateMarket(locations: MarketLocation[], marketItems: MarketEl[], parent: HTMLElement) {
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

        if (map.get("FUEL").quantityAvailable < 1000) continue;

        for (const b of locations) {
            if (a === b) continue;

            if (b.marketplace.filter(x => x.symbol == "FUEL")[0].quantityAvailable < 1000) continue;
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

function updateMarkets() {
    let sub = groupBy(marketData, x => x.symbol.substr(0, 2));

    for (const [k, v] of sub) {
        let items = marketItems.get(k);
        if (!items) {
            items = [];
            marketItems.set(k, items);
        }

        updateMarket(v, items, elements.market[k]);
    }
}

listenSocket("market", (data) => {
    marketData = data;
    updateMarkets();
});
