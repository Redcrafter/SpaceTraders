import express from "express";
import WebSocket from "ws";
import SQL from "sql-template-strings";
import * as zlib from "zlib";

import { logError, registerLogger } from "./logger.js";
import { LeaderboardMessage, Message } from "./types.js";
import { asyncQuery } from "./db.js";
import { sleep, unixEpoch } from "./util.js";
import { game } from "./api.js";

let leaderboardCache: LeaderboardMessage["data"][] = [];

let app = express();
app.use(express.static("./web/dist"));

app.get("/data.json", async (req, res) => {
    res.json(leaderboardCache);
});

async function trackLeaderboard() {
    let data: { time: number, data: Uint8Array }[] = await asyncQuery(SQL`SELECT * from leaderboard`);

    for (const el of data) {
        leaderboardCache.push({
            time: el.time,
            data: JSON.parse(zlib.inflateSync(el.data).toString())
        });
    }

    while (true) {
        try {
            let asdf = await game.leaderboard();

            let dat = zlib.deflateSync(JSON.stringify(asdf.netWorth));
            let time = unixEpoch();
            asyncQuery(SQL`INSERT INTO leaderboard ("time", "data") VALUES (${time}, ${dat})`);

            let el = {
                time,
                data: asdf.netWorth
            }
            leaderboardCache.push(el);

            broadcast({
                type: "leaderboard",
                data: el
            });

            await sleep(60 * 1000);
        } catch (e) { logError(e); }
    }
}
trackLeaderboard();

let server = app.listen(80);

let wsServer = new WebSocket.Server({
    noServer: true,
    perMessageDeflate: {
        zlibDeflateOptions: {
            // See zlib defaults.
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        // Other options settable:
        clientNoContextTakeover: true, // Defaults to negotiated value.
        serverNoContextTakeover: true, // Defaults to negotiated value.
        serverMaxWindowBits: 10, // Defaults to negotiated value.
        // Below options specified as default values.
        concurrencyLimit: 10, // Limits zlib concurrency for perf.
        threshold: 1024 // Size (in bytes) below which messages should not be compressed.
    }
});

server.on('upgrade', (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, socket => {
        wsServer.emit('connection', socket, request);
    });
});

/*server.on("connection", (socket) => {
    console.log("Got connection");

    socket.send("Hello ");
    socket.send("World!");

    socket.close();
});*/

export function broadcast(message: Message) {
    if (wsServer.clients.size == 0) return;
    let data = JSON.stringify(message);

    for (const socket of wsServer.clients) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(data);
        }
    }
}

registerLogger((level, message) => {
    broadcast({
        type: "log",
        data: {
            level,
            message
        }
    });
});
