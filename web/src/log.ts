import { listenSocket } from "./reciever.js";

let logLevels = {
    trace: false,
    info: true,
    warning: true,
    error: true
};

let log = {
    base: document.getElementById("log"),
    trace: document.getElementById("trace") as HTMLInputElement,
    info: document.getElementById("info") as HTMLInputElement,
    warn: document.getElementById("warn") as HTMLInputElement,
    error: document.getElementById("error") as HTMLInputElement,
};

let root = document.querySelector(":root") as HTMLElement;

log.trace.oninput = () => {
    root.style.setProperty("--trace", log.trace.checked ? "block" : "none");
    logLevels.trace = log.trace.checked;
}
log.info.oninput = () => {
    root.style.setProperty("--info", log.info.checked ? "block" : "none");
    logLevels.info = log.info.checked;

}
log.warn.oninput = () => {
    root.style.setProperty("--warning", log.warn.checked ? "block" : "none");
    logLevels.warning = log.warn.checked;

}
log.error.oninput = () => {
    root.style.setProperty("--error", log.error.checked ? "block" : "none");
    logLevels.error = log.error.checked;
}

listenSocket("log", (data) => {
    let base = log.base;

    while (base.children.length > 500) {
        base.removeChild(base.firstChild);
    }

    if (!logLevels[data.level]) {
        return;
    }

    let el = document.createElement("div");
    el.innerText = data.message;
    el.classList.add(data.level);

    base.append(el);

    if (base.scrollTop + base.clientHeight == base.scrollHeight) {
        base.scrollTo(0, base.scrollTop + base.scrollHeight);
    }
});