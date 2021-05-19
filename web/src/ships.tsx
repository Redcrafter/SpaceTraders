import { listenSocket } from "./reciever.js";
import { UserShip } from "./types.js";
import { sleep } from "./util.js";

let ships = document.getElementById("ships");

let shipMap = new Map<string, Shit>();

/*function sortShips() {
    let els = Array.from(ships.children);
    els.sort((a, b) => {
        let name = a.children[0].textContent.localeCompare(b.children[0].textContent);
        if (name != 0) return name;
        return a.children[1].textContent.localeCompare(b.children[1].textContent);
    });
    for (const item of els) {
        ships.appendChild(item);
    }
}*/

class Shit {
    root: HTMLElement;

    constructor(ship: UserShip) {
        this.root = <div>
            <div>{ship.type}</div>
            <div class="shipStuff">
                <div></div>
                <div>
                    <div>{""}</div>
                    <div>{ship.location ?? "In transit"}</div>
                    <div>{""}</div>
                </div>
            </div>
        </div>;
    }

    stuff(id: number, val: string) {
        this.root.children[1].children[1].children[id].textContent = val;
    }

    set color(val: string) {
        // this.root.children[1].firstChild
    }

    set time(val: number) {
        let el = this.root.children[1].children[0] as HTMLElement;
        el.style.width = `${val * 100}%`;
    }
}

function test(tag: string, props, ...children: (string | HTMLElement)[]): HTMLElement {
    let el = document.createElement(tag);

    if (props?.class) {
        el.className = props.class;
    }

    for (const item of children) {
        el.append(item);
    }

    return el;
}

listenSocket("info", (info) => {
    info.ships.sort((a, b) => b.type.localeCompare(a.type));

    for (const ship of info.ships) {
        let row = shipMap.get(ship.id);

        if (!row) {
            row = new Shit(ship);
            ships.append(row.root);
            shipMap.set(ship.id, row);
        } else if (ship.location) {
            row.stuff(0, "");
            row.stuff(1, ship.location);
            row.stuff(2, "");
        }
    }
    // sortShips();
});

listenSocket("flight", async (flight) => {
    let el = shipMap.get(flight.ship.id);
    if (!el) return;

    el.stuff(0, flight.from.symbol);
    el.stuff(1, "");
    el.stuff(2, flight.to.symbol);

    let depart = new Date(flight.plan.createdAt);
    let arrive = new Date(flight.plan.arrivesAt);

    while (true) {
        let now = new Date();

        if (now > arrive) {
            el.time = 0;

            el.stuff(0, "");
            el.stuff(1, flight.to.symbol);
            el.stuff(2, "");
            break;
        }

        // @ts-ignore
        el.time = (now - depart) / (arrive - depart);

        await sleep(100);
    }
});
