import { listenSocket } from "./reciever.js";
import { LeaderboardMessage } from "./types.js";

// display settings
const rect = {
    left: 0,
    top: 10,
    right: 0,
    bottom: 0,

    width: 0,
    height: 0
};

let maxCredits = 0;
let max = 0;

let total = true;

let smoothing = 0;

let selectRegion = {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1
};

// data
let data: number[] = [];

let userData = new Map<string, {
    points: number[];
    color: string;

    lastY: number;
    path: Path2D;
}>();

// mouse handling
let mouseDown = false;
let dragStart = {
    x: 0,
    y: 0
};
let mousePos = {
    x: 0,
    y: 0
};

// elements
let elements = {
    smoothing: document.getElementById("smoothing") as HTMLInputElement,
    total: document.getElementById("total") as HTMLInputElement
};

let canvas = document.getElementById("leaderboardCanvas") as HTMLCanvasElement;
let context = canvas.getContext("2d");
resize();

fetch("/data.json").then(x => x.json()).then(x => {
    for (let i = 0; i < x.length; i++) {
        pushData(x[i]);
    }

    updateColors();
    updatePaths();
});

function pushData(item: LeaderboardMessage["data"]) {
    let index = data.length;

    data.push(item.time);

    for (const user of item.data) {
        maxCredits = Math.max(maxCredits, user.netWorth);

        let dat = userData.get(user.username);
        if (!dat) {
            dat = {
                points: new Array(),
                color: "#000",
                lastY: 0,
                path: null
            };
            userData.set(user.username, dat);
        }
        dat.points[index] = user.netWorth;
    }
}

function updateColors() {
    let i = 0;
    for (const [k, v] of userData) {
        v.color = rgbToHex(hslToRgb((i * Math.PI) % 1, 0.7, 0.5));
        i++;
    }
}

listenSocket("leaderboard", (data) => {
    pushData(data);

    updateColors();
    updatePaths();
});

elements.smoothing.addEventListener("input", () => {
    smoothing = elements.smoothing.valueAsNumber;
    updatePaths();
});
elements.total.addEventListener("input", () => {
    total = elements.total.checked;

    if (total) {
        elements.smoothing.min = "0";
        elements.smoothing.value = "0";
        smoothing = 0;
    } else {
        elements.smoothing.min = "1";
        elements.smoothing.value = "20";
        smoothing = 20;
    }

    updatePaths();
});

window.addEventListener("resize", resize);

canvas.addEventListener("dblclick", () => {
    selectRegion.left = 0;
    selectRegion.right = 1;

    selectRegion.top = 0;
    selectRegion.bottom = 1;

    updatePaths();
})
canvas.addEventListener("mousedown", (e) => {
    mouseDown = true;
    dragStart.x = mousePos.x;
    dragStart.y = mousePos.y;
});
document.addEventListener("mouseup", (e) => {
    if (mouseDown) {
        mouseDown = false;

        let dx = Math.abs(mousePos.x - dragStart.x);
        let dy = Math.abs(mousePos.y - dragStart.y);

        if (dx >= dy && dx >= 10) {
            let left = Math.min(mousePos.x, dragStart.x) / rect.width;
            let right = Math.max(mousePos.x, dragStart.x) / rect.width;
            left = Math.max(0, left);
            right = Math.min(1, right);

            let scale = selectRegion.right - selectRegion.left;

            selectRegion.left += left * scale;
            selectRegion.right -= (1 - right) * scale;
        }
        if (dx < dy && dy >= 10) {
            let top = Math.min(mousePos.y, dragStart.y) / rect.height;
            let bottom = Math.max(mousePos.y, dragStart.y) / rect.height;
            top = Math.max(0, top);
            bottom = Math.min(1, bottom);

            let scale = selectRegion.bottom - selectRegion.top;

            selectRegion.top += top * scale;
            selectRegion.bottom -= (1 - bottom) * scale;
        }

        updatePaths();
    }
});
document.addEventListener("mousemove", (e) => {
    let rect = canvas.getBoundingClientRect();

    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;

    if (mouseDown) {
        draw();
    }
});

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 30;

    rect.right = canvas.width - 70;
    rect.bottom = canvas.height - 30;

    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;

    if (data) updatePaths();
}

function hslToRgb(h: number, s: number, l: number) {
    let r, g, b;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        let hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        let p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(v: number[]) {
    return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
}

function line(x1: number, y1: number, x2: number, y2: number) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.closePath();
}

function calcY(credits: number) {
    let val = (credits / max - (1 - selectRegion.bottom)) / (selectRegion.bottom - selectRegion.top);

    return -val * rect.height + rect.bottom;
}

function updatePaths() {
    const startI = Math.floor(selectRegion.left * (data.length - 1));
    const endI = Math.ceil(selectRegion.right * (data.length - 1));

    let left = data[startI];
    let right = data[endI];

    if (total) {
        max = maxCredits;
    } else {
        max = 0;

        for (const [userName, user] of userData) {
            function getVal(pos: number) {
                if (total) {
                    return user.points[pos];
                } else {
                    let start = Math.max(pos - smoothing, 0);
                    let end = Math.min(pos + smoothing, data.length - 1);

                    return (user.points[end] - user.points[start]) / (data[end] - data[start]);
                }
            }

            function smooth(pos: number) {
                let start = Math.max(pos - smoothing, 0);
                let end = Math.min(pos + smoothing, data.length - 1);

                let val = 0;
                for (let i = start; i <= end; i++) {
                    val += getVal(i);
                }
                return val / (end - start + 1);
            }

            for (let i = startI; i <= endI; i++) {
                let current = smooth(i);
                if (!isNaN(current)) max = Math.max(max, current);
            }
        }
    }

    for (const [userName, user] of userData) {
        function getVal(pos: number) {
            if (total) {
                return user.points[pos];
            } else {
                let start = Math.max(pos - smoothing, 0);
                let end = Math.min(pos + smoothing, data.length - 1);

                return (user.points[end] - user.points[start]) / (data[end] - data[start]);
            }
        }

        function smooth(pos: number) {
            let start = Math.max(pos - smoothing, 0);
            let end = Math.min(pos + smoothing, data.length - 1);

            let val = 0;
            for (let i = start; i <= end; i++) {
                val += getVal(i);
            }
            return val / (end - start + 1);
        }

        let path = new Path2D();

        let last = smooth(startI);
        path.moveTo(0, calcY(last));

        for (let i = startI + 1; i <= endI; i++) {
            let x = (data[i] - left) / (right - left); // relative time
            x = x * rect.width + rect.left; // relative canvas

            let current = smooth(i);

            if (current != 0) {
                if (last == 0) {
                    path.moveTo(x, calcY(current));
                } else {
                    path.lineTo(x, calcY(current));
                }
            }

            last = current;
        }

        user.lastY = last;
        user.path = path;
    }

    draw();
}

function draw() {
    requestAnimationFrame(plot);
}

function plot() {
    context.resetTransform();
    // context.clearRect(0, 0, canvas.width, canvas.height);

    context.lineWidth = 2;
    context.fillStyle = "#1e1e1e";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (mouseDown) {
        context.fillStyle = "#0008";

        let dx = mousePos.x - dragStart.x;
        let dy = mousePos.y - dragStart.y;

        if (Math.abs(dx) > Math.abs(dy)) {
            context.fillRect(dragStart.x, 0, dx, canvas.height);
        } else {
            context.fillRect(0, dragStart.y, canvas.width, dy);
        }
    }

    context.font = "14px sans-serif";
    context.strokeStyle = "#444";
    context.fillStyle = "#fff";

    {
        context.textBaseline = "middle";
        context.textAlign = "left";

        let count = Math.floor(canvas.height / 50);
        for (let i = 0; i < count; i++) {
            let val = ((i / (count - 1)) * (selectRegion.bottom - selectRegion.top) + (1 - selectRegion.bottom)) * max;
            let y = calcY(val);

            context.fillText(val.toExponential(2), rect.right + 10, y);
            line(rect.left, y, rect.right, y);
        }
    }


    {
        context.textBaseline = "top";
        context.textAlign = "center";

        const startI = Math.floor(selectRegion.left * (data.length - 1));
        const endI = Math.ceil(selectRegion.right * (data.length - 1));

        let left = data[startI];
        let right = data[endI];

        let count = Math.floor(canvas.width / 100);

        function pad(n: number) {
            return n.toString().padStart(2, "0");
        }

        for (let i = 0.5; i < count - 1; i++) {
            let val = i / (count - 1) * (right - left) + left;
            let time = new Date();
            time.setTime(val * 1000);

            context.fillText(`${time.getDate()}/${time.getMonth() + 1} ${pad(time.getHours())}:${pad(time.getMinutes())}`, i / (count - 1) * rect.width + rect.left, rect.bottom + 10);
        }
    }

    context.strokeRect(rect.left, rect.top, rect.width, rect.height);

    context.save();

    context.beginPath();
    context.rect(rect.left, rect.top, rect.width, rect.height);
    context.clip();
    for (const [userName, user] of userData) {
        context.strokeStyle = user.color;
        context.stroke(user.path);
    }

    context.font = "14px sans-serif";
    context.textBaseline = "bottom";
    context.textAlign = "right";
    for (const [k, v] of userData) {
        context.fillText(k, rect.right, calcY(v.lastY) - 5);
    }

    context.restore();
}
