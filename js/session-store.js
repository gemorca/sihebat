const SESSION_KEY = "session_anak_wali";

const SessionStore = (function () {
    function mode() {
        return (typeof SESSION_STORAGE_MODE !== "undefined" && SESSION_STORAGE_MODE === "local") ? "local" : "session";
    }
    function maxAge() {
        return (typeof SESSION_MAX_AGE_MS === "number" && SESSION_MAX_AGE_MS > 0) ? SESSION_MAX_AGE_MS : 12 * 60 * 60 * 1000;
    }
    function primary() { return mode() === "local" ? window.localStorage : window.sessionStorage; }
    function secondary() { return mode() === "local" ? window.sessionStorage : window.localStorage; }

    function parse(raw) {
        if (!raw) return null;
        try {
            const obj = JSON.parse(raw);
            return (obj && typeof obj === "object") ? obj : null;
        } catch (e) { return null; }
    }

    function write(obj) {
        try { primary().setItem(SESSION_KEY, JSON.stringify(obj)); } catch (e) { }
    }

    function clear() {
        try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { }
        try { window.localStorage.removeItem(SESSION_KEY); } catch (e) { }
    }

    function read() {
        let obj = null;
        try { obj = parse(primary().getItem(SESSION_KEY)); } catch (e) { }

        if (!obj) {
            let legacy = null;
            try { legacy = parse(secondary().getItem(SESSION_KEY)); } catch (e) { }
            if (legacy) {
                if (!legacy.ts) legacy.ts = Date.now();
                obj = legacy;
                write(obj);
            }
        }
        try { secondary().removeItem(SESSION_KEY); } catch (e) { }

        if (!obj) return null;
        if (obj.ts && Date.now() - obj.ts > maxAge()) {
            clear();
            return null;
        }
        return obj;
    }

    return {
        get: function () {
            const s = read();
            return s && s.token && s.user ? { token: s.token, user: s.user } : null;
        },
        set: function (token, user) {
            write({ token: token, user: user, ts: Date.now() });
        },
        update: function (fn) {
            const s = read();
            if (!s) return;
            fn(s);
            s.ts = Date.now();
            write(s);
        },
        clear: clear
    };
})();
