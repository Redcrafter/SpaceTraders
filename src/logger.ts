import { LogLevel } from "./types.js";

let loggers: (typeof log)[] = [];

export function log(level: LogLevel, message: string) {
    switch (level) {
        case "trace":
            // console.trace(message); 
            break;
        case "error": console.error(message); break;
        case "warning": console.warn(message); break;
        case "info": console.log(message); break;
    }

    for (const l of loggers) {
        l(level, message);
    }
}

export function registerLogger(logger: typeof log) {
    loggers.push(logger);
}

export function logError(e) {
    if (e instanceof Error) {
        log("error", `${e.name}: ${e.message}\n${e.stack}`);
    } else {
        log("error", e);
    }
}
