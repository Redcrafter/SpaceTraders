import { listenSocket } from "./reciever.js";
import { MarketItem } from "./types.js";
import { calcTime } from "./util.js";

let canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = 800;
canvas.height = 800;
let context = canvas.getContext("2d");

let scale = 350;

listenSocket("market", (data) => {
    function calcPos(i: number) {
        let rad = i / planets.length * 2 * Math.PI;

        return {
            x: Math.sin(rad) * scale + canvas.width / 2,
            y: Math.cos(rad) * scale + canvas.height / 2
        }
    }

    const speed = 4;
    // const cargo = 300;

    let max = 0;
    let temp = [];

    let planets = data.filter(x => x.symbol.startsWith("OE"));

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "#000";
    context.textAlign = "center";

    for (let i = 0; i < planets.length; i++) {
        const a = planets[i];

        let aPos = calcPos(i);

        context.beginPath();
        context.ellipse(aPos.x, aPos.y, 8, 8, 0, 0, Math.PI * 20);
        context.closePath();
        context.stroke();

        context.fillText(a.symbol, aPos.x, aPos.y - 10);

        let map = new Map<string, MarketItem>();
        a.marketplace.forEach(x => map.set(x.symbol, x));

        for (let j = 0; j < planets.length; j++) {
            const b = planets[j];

            let bPos = calcPos(j);

            let time = calcTime(speed, a, b);

            let bestGain = 0;
            for (const bm of b.marketplace) {
                const am = map.get(bm.symbol);
                if (!am) continue;

                let gain = (bm.sellPricePerUnit - am.purchasePricePerUnit) / am.volumePerUnit / time;
                bestGain = Math.max(gain, bestGain);
            }

            max = Math.max(max, bestGain);
            temp.push({ a: aPos, b: bPos, gain: bestGain });
        }
    }

    for (const item of temp) {
        context.strokeStyle = `rgba(0, 0, 0, ${item.gain / max})`;

        let dx = item.b.x - item.a.x;
        let dy = item.b.y - item.a.y;
        let len = Math.sqrt(dx ** 2 + dy ** 2);
        dx = dx / len * 100;
        dy = dy / len * 100;

        context.beginPath();

        context.moveTo(item.a.x, item.a.y);
        context.bezierCurveTo(item.a.x - dy, item.a.y + dx, item.b.x - dy, item.b.y + dx, item.b.x, item.b.y);
        context.stroke();
    }
});
