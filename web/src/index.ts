import { listenSocket } from "./reciever.js";

let tabs: {
    name: string;
    id: string;

    headerEl?: HTMLElement;
    el?: HTMLElement;
}[] = [
        {
            name: "Ships",
            id: "shipTab"
        },
        {
            name: "Market",
            id: "marketTab",
        },
        {
            name: "Log",
            id: "logTab"
        },
        {
            name: "Map",
            id: "mapTab"
        },
        {
            name: "Leaderboard",
            id: "leaderboardTab"
        }
    ];

let header = document.querySelector("header");

for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];

    let headerEl = document.createElement("div");
    headerEl.textContent = tab.name;

    headerEl.addEventListener("click", () => changeTab(i));

    header.appendChild(headerEl);

    tab.headerEl = headerEl;
    tab.el = document.getElementById(tab.id);
}

function changeTab(id: number) {
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];

        if (i == id) {
            tab.el.setAttribute("active", "");
        } else {
            tab.el.removeAttribute("active");
        }
    }
}


let username = document.getElementById("username");
let credits = document.getElementById("credits");

listenSocket("info", (info) => {
    username.innerText = "Redcrafter";
    credits.innerText = info.credits.toLocaleString();
});
