import { redis, decrypt, GRAPH } from "@/lib/server";

/* ---------- log pesan ---------- */
// Disimpan di list `log:msgs` (terbaru di depan), maksimal 200 entri.
// Isi pesan dipotong 300 karakter, dan hilang otomatis 30 hari setelah pesan terakhir.
const LOG_KEY = "log:msgs";
const LOG_MAX = 200;
const LOG_TTL = 30 * 86400;

// Buang apa pun yang mirip API key Google atau token bot sebelum disimpan.
function clean(s, n) {
  return String(s ?? "")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/\d{6,}:[A-Za-z0-9_-]{30,}/g, "[token]").replace(/EA[A-Za-z0-9]{60,}/g, "[token]")
    .slice(0, n);
}

// st: "ok" | "error" | "limited"
export async function addLog({ uid, name, q, a, st, slot = null, ms = null }) {
  try {
    const row = { t: Date.now(), uid, name: clean(name, 80), q: clean(q, 300), a: clean(a, 300), st, slot, ms };
    const p = redis.pipeline();
    p.lpush(LOG_KEY, row);
    p.ltrim(LOG_KEY, 0, LOG_MAX - 1);
    p.expire(LOG_KEY, LOG_TTL);
    await p.exec();
  } catch (e) {
    // Log gagal tidak boleh membuat balasan ke pengguna ikut gagal.
    console.error("Gagal menulis log:", e?.message);
  }
}

export async function getLogs(n = 50) {
  const rows = (await redis.lrange(LOG_KEY, 0, n - 1)) || [];
  return rows.filter((x) => x && typeof x === "object");
}

export async function clearLogs() {
  await redis.del(LOG_KEY);
}

/* ---------- percakapan WhatsApp (dibaca admin) ---------- */
// conv:idx          sorted set chatId, skor = waktu pesan terakhir
// conv:meta:{chat}  nama percakapan, jumlah pesan, waktu terakhir
// conv:msgs:{chat}  list pesan {t, r: "user"|"bot", n, x}, maksimal 200, hilang 30 hari setelah pesan terakhir
const CONV_IDX = "conv:idx";
const CONV_MAX = 200;
const CONV_CHATS = 500;
const CONV_TTL = 30 * 86400;
const CHAT_ID = /^-?\d{1,20}$/;
export const validChatId = (id) => CHAT_ID.test(String(id));

export async function addConv({ chatId, title, role, name, text }) {
  try {
    const id = String(chatId);
    const now = Date.now();
    const row = { t: now, r: role, n: clean(name, 80), x: clean(text, 2000) };
    const p = redis.pipeline();
    p.rpush(`conv:msgs:${id}`, row);
    p.ltrim(`conv:msgs:${id}`, -CONV_MAX, -1);
    p.expire(`conv:msgs:${id}`, CONV_TTL);
    p.hset(`conv:meta:${id}`, { title: clean(title, 80), last: now });
    p.expire(`conv:meta:${id}`, CONV_TTL);
    p.zadd(CONV_IDX, { score: now, member: id });
    p.zremrangebyrank(CONV_IDX, 0, -(CONV_CHATS + 1));
    await p.exec();
  } catch (e) {
    console.error("Gagal menyimpan percakapan:", e?.message);
  }
}

export async function listConvs(n = 100) {
  const ids = (await redis.zrange(CONV_IDX, 0, n - 1, { rev: true })) || [];
  if (!ids.length) return [];
  const p = redis.pipeline();
  ids.forEach((id) => { p.hgetall(`conv:meta:${id}`); p.llen(`conv:msgs:${id}`); });
  const out = await p.exec();
  const rows = [];
  ids.forEach((id, i) => {
    const meta = out[i * 2];
    if (!meta) return; // sudah kedaluwarsa
    rows.push({ id: String(id), title: meta.title || String(id), last: Number(meta.last) || 0, count: Number(out[i * 2 + 1]) || 0 });
  });
  return rows;
}

export async function getConv(chatId) {
  const id = String(chatId);
  const [meta, rows] = await Promise.all([redis.hgetall(`conv:meta:${id}`), redis.lrange(`conv:msgs:${id}`, 0, -1)]);
  return {
    id,
    title: meta?.title || id,
    messages: (rows || []).filter((x) => x && typeof x === "object"),
  };
}

export async function deleteConv(chatId) {
  const id = String(chatId);
  await redis.pipeline().del(`conv:msgs:${id}`).del(`conv:meta:${id}`).zrem(CONV_IDX, id).exec();
}

export async function clearConvs() {
  const ids = (await redis.zrange(CONV_IDX, 0, -1)) || [];
  const p = redis.pipeline();
  ids.forEach((id) => { p.del(`conv:msgs:${id}`); p.del(`conv:meta:${id}`); });
  p.del(CONV_IDX);
  await p.exec();
}

/* ---------- batas pesan per pengguna ---------- */
// Jendela tetap: hitungan dimulai dari pesan pertama dan direset setelah `limitMinutes`.
// Kalau Redis bermasalah, pengguna tetap dilayani (fail-open).
export async function checkLimit(uid, { limitCount, limitMinutes }) {
  if (!limitCount) return { ok: true };
  const k = `rl:u:${uid}`;
  const sec = limitMinutes * 60;
  try {
    const [n, , ttl] = await redis.pipeline().incr(k).expire(k, sec, "NX").ttl(k).exec();
    let wait = Number(ttl);
    if (!(wait > 0)) { await redis.expire(k, sec); wait = sec; } // jaga-jaga kalau TTL hilang
    return { ok: n <= limitCount, first: n === limitCount + 1, retrySec: wait };
  } catch (e) {
    console.error("Gagal memeriksa batas pesan:", e?.message);
    return { ok: true };
  }
}

/* ---------- pemakaian pesan layanan WhatsApp per bulan ---------- */
// Meta menagih balasan bot (pesan layanan) mulai ke-1.001 tiap bulan per nomor. Kita hitung pesan yang berhasil terkirim.
// svc:{YYYY-MM} -> jumlah pesan terkirim bulan itu (bulan menurut WIB), hilang otomatis setelah 70 hari.
export const SVC_FREE = 1000;
const monthKey = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);

export async function countSvc(n = 1) {
  try {
    const k = `svc:${monthKey()}`;
    await redis.pipeline().incrby(k, n).expire(k, 70 * 86400).exec();
  } catch (e) {
    console.error("Gagal menghitung pesan layanan:", e?.message);
  }
}

// Penyangga: bot berhenti membalas sedikit sebelum 1.000, karena satu pesan masuk bisa memicu beberapa balasan
// (teks panjang dipecah, album foto) dan dua pelanggan bisa chat bersamaan.
export const SVC_BUFFER = 20;

// Angka resmi dari Meta (pricing_analytics, jumlah pesan layanan terkirim bulan ini), di-cache beberapa menit.
// Mengembalikan null kalau gagal; pemanggil lalu memakai hitungan lokal saja.
const META_TTL_MS = 5 * 60 * 1000;
async function metaServiceCount(month) {
  const key = `svcmeta:${month}`;
  let hit = null;
  try { hit = await redis.get(key); } catch {}
  const fresh = hit && typeof hit === "object" && Date.now() - hit.at < META_TTL_MS;
  if (fresh) return hit.n;
  try {
    // Hanya satu proses yang menarik data; yang lain memakai angka lama.
    const got = await redis.set("svcmeta:lock", 1, { nx: true, ex: 20 });
    if (!got) return hit?.n ?? null;
    const cfg = (await redis.hgetall("cfg:bot")) || {};
    if (!cfg.token || !cfg.wabaId) return hit?.n ?? null;
    const token = await decrypt(cfg.token);
    const [y, m] = month.split("-").map(Number);
    const start = Math.floor(Date.UTC(y, m - 1, 1) / 1000) - 7 * 3600; // awal bulan WIB (bucket harian Meta mengikuti zona waktu WABA)
    const end = Math.floor(Date.now() / 1000);
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).metric_types(["VOLUME"]).dimensions(["PRICING_CATEGORY"])`;
    const res = await fetch(`${GRAPH}/${cfg.wabaId}?fields=${encodeURIComponent(fields)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    let n = 0;
    for (const block of j?.pricing_analytics?.data || []) {
      for (const dp of block.data_points || []) {
        const cat = String(dp.pricing_category || "").toUpperCase();
        // Hanya pesan layanan yang memakai jatah 1.000; kalau kategori tidak ada di data, hitung semuanya (lebih hati-hati).
        if (!cat || cat === "SERVICE") n += Number(dp.volume) || 0;
      }
    }
    await redis.set(key, { n, at: Date.now() }, { ex: 70 * 86400 });
    return n;
  } catch (e) {
    console.error("Gagal mengambil pemakaian dari Meta:", e?.message);
    // Coba lagi satu menit lagi, bukan setiap pesan.
    try { await redis.set(key, { n: hit?.n ?? 0, at: Date.now() - META_TTL_MS + 60000 }, { ex: 70 * 86400 }); } catch {}
    return hit?.n ?? null;
  }
}

// used = angka yang lebih besar antara hitungan lokal (real-time) dan angka Meta (mencakup pesan yang tidak lewat bot).
export async function getSvcUsage() {
  const month = monthKey();
  let local = 0;
  try { local = Number(await redis.get(`svc:${month}`)) || 0; } catch {}
  const meta = await metaServiceCount(month);
  const used = Math.max(local, meta ?? 0);
  const [y, m] = month.split("-").map(Number);
  const reset = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // tanggal 1 bulan berikutnya
  return { month, used, local, meta, free: SVC_FREE, stopAt: SVC_FREE - SVC_BUFFER, reset };
}

/* ---------- pertanyaan yang belum terjawab baik ---------- */
// unans:list (terbaru di depan), maksimal 200, hilang 30 hari setelah entri terakhir.
// why: "error" (Gemini gagal, bot kirim pesan cadangan) | "unsure" (AI bilang tidak tahu / akan dikonfirmasi tim)
const UN_KEY = "unans:list";
const UN_MAX = 200;
const UN_TTL = 30 * 86400;

// Tebakan dari kata-kata jawaban AI, bukan penilaian pasti.
const UNSURE = new RegExp([
  "belum (ada|punya|tersedia)[^.]{0,20}(info|informasi|data)",
  "tidak (punya|memiliki|ada)[^.]{0,20}(info|informasi|data)",
  "(kurang|tidak) (tahu|paham|yakin)",
  "(akan|nanti)[^.]{0,25}(dikonfirmasi|dikonfirmasikan)",
  "tim (kami|admin|kita)[^.]{0,50}(konfirmasi|menghubungi|membantu)",
  "(silakan|silahkan|mohon) (hubungi|tanyakan)[^.]{0,20}(admin|tim|langsung)",
  "i (don't|do not) (have|know)",
  "(team|admin) (will|can) (confirm|contact|follow)",
  "not (sure|certain)",
  "will be confirmed",
].join("|"), "i");
export const looksUnsure = (a) => UNSURE.test(String(a || ""));

export async function addUnans({ uid, name, q, a, why }) {
  try {
    const row = { t: Date.now(), uid, name: clean(name, 80), q: clean(q, 300), a: clean(a, 300), why };
    const p = redis.pipeline();
    p.lpush(UN_KEY, row);
    p.ltrim(UN_KEY, 0, UN_MAX - 1);
    p.expire(UN_KEY, UN_TTL);
    await p.exec();
  } catch (e) {
    console.error("Gagal menyimpan pertanyaan belum terjawab:", e?.message);
  }
}

export async function getUnans(n = 100) {
  const rows = (await redis.lrange(UN_KEY, 0, n - 1)) || [];
  return rows.filter((x) => x && typeof x === "object");
}

export async function clearUnans() {
  await redis.del(UN_KEY);
}
