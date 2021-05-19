import { FlightData, Location, UserShip } from "./types.js";
import { groupBy } from "./util.js";
import { listenSocket } from "./reciever.js";

let scale = 1;

interface Stationed {
    state: "stationed";
    ship: UserShip;
};
interface Transit {
    state: "transit";
    ship: UserShip;
    data: FlightData;
}
type ShipStuff = Stationed | Transit;

let ships = new Map<string, ShipStuff>();
let planets = new Map<string, Location>();

let canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
resize();

let context = canvas.getContext("2d");

window.addEventListener("resize", resize);

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 30;
};

listenSocket("info", (info) => {
    for (const ship of info.ships) {
        if (!ship.location) continue;

        ships.set(ship.id, {
            state: "stationed",
            ship
        });
    }
});

listenSocket("market", (data) => {
    for (const l of data) {
        planets.set(l.symbol, l);
    }
});

listenSocket("flight", (data) => {
    ships.set(data.ship.id, {
        state: "transit",
        ship: data.ship,
        data
    });
});

function circle(x: number, y: number, r: number) {
    context.beginPath();
    context.ellipse(x * scale, y * scale, r * scale, r * scale, 0, 0, Math.PI * 2);
    context.closePath();
}

function drawSystem(system: Iterable<Location>, ships: ShipStuff[]) {
    let maxDist = 0;
    for (const planet of system) {
        let dist = Math.sqrt(planet.x * planet.x + planet.y * planet.y);
        if (dist > maxDist) maxDist = dist;
    }
    scale = (Math.min(canvas.width, canvas.height) / 2 - 25) / maxDist;

    context.fillStyle = "#fff";
    context.strokeStyle = "#888";
    context.textAlign = "center";

    for (const planet of system) {
        let nameSplit = planet.symbol.split("-");

        if (nameSplit.length == 3) {
            let parent = planets.get(`${nameSplit[0]}-${nameSplit[1]}`);
            if (!parent) continue;

            circle(parent.x, parent.y, Math.sqrt((planet.x - parent.x) ** 2 + (planet.y - parent.y) ** 2));
            context.stroke();
        } else {
            circle(0, 0, Math.sqrt(planet.x * planet.x + planet.y * planet.y));
            context.stroke();
        }

        circle(planet.x, planet.y, planet.type == "PLANET" ? 1 : 0.5);
        context.fill();

        context.fillText(planet.name, planet.x * scale, (planet.y + 5) * scale);
    }

    let lines = new Map<string, [Location, Location]>();

    for (const ship of ships) {
        if (ship.state !== "transit") continue;

        let dat: FlightData = ship.data;
        lines.set(`${dat.from.symbol}+${dat.to.symbol}`, [dat.from, dat.to]);
    }

    context.strokeStyle = "#008";
    context.beginPath();
    for (const [k, v] of lines) {
        context.moveTo(v[0].x * scale, v[0].y * scale);
        context.lineTo(v[1].x * scale, v[1].y * scale);
    }
    context.closePath();
    context.stroke();

    for (const ship of ships) {
        if (ship.state == "transit") {
            let dat: FlightData = ship.data;

            let start = new Date(dat.plan.createdAt);
            let end = new Date(dat.plan.arrivesAt);
            let now = new Date();

            // @ts-ignore
            let prog = (now - start) / (end - start);
            // context.fillText(prog.toString())

            if (prog >= 1) {
                // @ts-ignore
                ship.state = "stationed";
                ship.ship.location = ship.data.to.symbol;
            } else {
                let x = dat.from.x * (1 - prog) + dat.to.x * prog;
                let y = dat.from.y * (1 - prog) + dat.to.y * prog;

                context.fillStyle = "#f00";
                circle(x, y, 0.25);
                context.fill();
            }
        }

        if (ship.state == "stationed") {
            context.fillStyle = "#0f0";
            circle(ship.ship.x, ship.ship.y, 0.5);
            context.fill();
        }
    }
}

function draw() {
    context.resetTransform();
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);

    let systems = groupBy(planets.values(), x => x.symbol.substr(0, 2));
    let asdf = groupBy(ships.values(), x => x.ship.location.substr(0, 2));

    let sub = canvas.width / systems.size;
    context.translate(sub / 2, canvas.height / 2);

    for (const [k, v] of systems) {
        drawSystem(v, asdf.get(k) ?? []);

        context.translate(sub, 0);
    }

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
