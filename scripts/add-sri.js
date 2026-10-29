const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const file = path.resolve(__dirname, "..", "index.html");
const checkOnly = process.argv.includes("--check");
const HOSTS = ["https://cdn.jsdelivr.net/", "https://cdnjs.cloudflare.com/"];

const TAG = /<(script|link)\b[^>]*>/gi;

function attr(tag, name) {
    const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i"));
    return m ? m[1] : null;
}

async function sha384(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status + " untuk " + url);
    const buf = Buffer.from(await res.arrayBuffer());
    return "sha384-" + crypto.createHash("sha384").update(buf).digest("base64");
}

(async () => {
    let html = fs.readFileSync(file, "utf8");
    const jobs = [];
    let m;
    while ((m = TAG.exec(html)) !== null) {
        const tag = m[0];
        const isScript = m[1].toLowerCase() === "script";
        const url = attr(tag, isScript ? "src" : "href");
        if (!url || !HOSTS.some(h => url.startsWith(h))) continue;
        if (!isScript && !/rel\s*=\s*"stylesheet"/i.test(tag)) continue;
        jobs.push({ tag, url, current: attr(tag, "integrity") });
    }

    let bad = 0;
    for (const job of jobs) {
        let hash;
        try {
            hash = await sha384(job.url);
        } catch (e) {
            console.error("GAGAL  " + job.url + " (" + e.message + ")");
            bad++;
            continue;
        }
        if (job.current) {
            if (job.current === hash) {
                console.log("OK     " + job.url);
            } else {
                console.error("BEDA   " + job.url + "\n       ada:   " + job.current + "\n       harus: " + hash);
                bad++;
            }
            continue;
        }
        if (checkOnly) {
            console.error("KOSONG " + job.url);
            bad++;
            continue;
        }
        let next = job.tag.replace(/\s*\/?>$/, "");
        next += ' integrity="' + hash + '"';
        if (!/\bcrossorigin\b/i.test(next)) next += ' crossorigin="anonymous"';
        next += job.tag.endsWith("/>") ? " />" : ">";
        html = html.replace(job.tag, next);
        console.log("TAMBAH " + job.url);
    }

    if (!checkOnly && bad === 0) fs.writeFileSync(file, html);
    if (bad) {
        console.error("\n" + bad + " masalah. index.html " + (checkOnly ? "tidak diubah." : "tidak ditulis."));
        process.exit(1);
    }
})();
