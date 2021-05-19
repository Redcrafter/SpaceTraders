import * as sqlite from "sqlite";
import sqlite3 from "sqlite3";

import { log } from "./logger.js";

let db: sqlite.Database<sqlite3.Database, sqlite3.Statement>;

let dbOpen = sqlite.open({
    filename: "./log.db",
    driver: sqlite3.cached.Database
}).then(x => {
    db = x;
    db.on("trace", (data) => {
        log("trace", `[DB] ${data}`);
    });
}).catch(x => {
    console.error(x);
    process.exit(1);
});

export async function asyncQuery(query) {
    await dbOpen;

    return await db.all(query);
}
