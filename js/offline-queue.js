const OFFLINE_QUEUE_KEY = "offline_absensi_queue";

const OfflineAbsensi = (function () {
    let flushing = false;

    function valid(e) {
        return e && typeof e.tanggal === "string" && Array.isArray(e.items) && e.items.length > 0;
    }

    function read() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "null"); } catch (e) { return []; }
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(valid);
        if (Array.isArray(raw.items)) {
            const legacy = { tanggal: raw.tanggal || (raw.items[0] && raw.items[0].tanggal) || "", items: raw.items };
            return valid(legacy) ? [legacy] : [];
        }
        return [];
    }

    function write(list) {
        try {
            if (list.length) localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list));
            else localStorage.removeItem(OFFLINE_QUEUE_KEY);
            return true;
        } catch (e) {
            return false;
        }
    }

    function sig(item) {
        return [item.siswa_id, item.status, item.waktu_masuk].join("|");
    }

    function enqueue(tanggal, items) {
        const list = read();
        let entry = list.find(e => e.tanggal === tanggal);
        if (!entry) {
            entry = { tanggal: tanggal, items: [] };
            list.push(entry);
        }
        items.forEach(item => {
            const idx = entry.items.findIndex(x => String(x.siswa_id) === String(item.siswa_id));
            if (idx !== -1) entry.items[idx] = item;
            else entry.items.push(item);
        });
        return write(list);
    }

    function ack(tanggal, sent) {
        const done = new Set(sent.map(sig));
        const list = read();
        const entry = list.find(e => e.tanggal === tanggal);
        if (entry) entry.items = entry.items.filter(x => !done.has(sig(x)));
        write(list.filter(valid));
    }

    function drop(tanggal) {
        write(read().filter(e => e.tanggal !== tanggal));
    }

    function filterItems(keep) {
        const list = read();
        list.forEach(e => { e.items = e.items.filter(keep); });
        write(list.filter(valid));
    }

    async function flush() {
        if (flushing || !navigator.onLine || !appState.token) return;
        const list = read();
        if (!list.length) return;

        flushing = true;
        const isAdmin = !!(appState.user && appState.user.role === "admin");
        const hariIni = getDateWITA();
        const hilang = [];
        const terkunci = [];
        let terkirim = 0;
        let gagal = 0;

        try {
            showLoading("Menyinkronkan data presensi offline...");
            for (const entry of list) {
                if (entry.tanggal !== hariIni && !isAdmin) {
                    drop(entry.tanggal);
                    hilang.push(entry.tanggal);
                    continue;
                }
                const res = await apiCall("saveAbsensi", { items: entry.items, tanggal: entry.tanggal }, false);
                if (res && res.status === "success") {
                    ack(entry.tanggal, entry.items);
                    terkirim++;
                } else if (res && res.status === "error" && (res.code === "DATE_LOCKED" || res.code === "DATE_FUTURE")) {
                    drop(entry.tanggal);
                    terkunci.push({ tanggal: entry.tanggal, message: res.message });
                } else {
                    gagal++;
                }
            }
        } finally {
            hideLoading();
            flushing = false;
        }

        if (terkirim) showToast("Data presensi offline berhasil disinkronkan ke server!");
        if (gagal) showToast("Sebagian presensi offline belum terkirim. Akan dicoba lagi.", "warning");

        const pesan = [];
        hilang.forEach(t => pesan.push(`Presensi tanggal ${formatTanggalLabel(t)} tidak sempat terkirim sebelum hari berganti dan sudah terkunci. Hubungi admin untuk koreksi.`));
        terkunci.forEach(x => pesan.push(x.message || `Presensi tanggal ${formatTanggalLabel(x.tanggal)} ditolak server.`));
        if (pesan.length) {
            Swal.fire({
                icon: "warning",
                title: "Presensi Tidak Terkirim",
                text: pesan.join(" "),
                confirmButtonColor: "#2563eb"
            });
        }
    }

    return { enqueue: enqueue, filterItems: filterItems, flush: flush, pending: function () { return read(); } };
})();
