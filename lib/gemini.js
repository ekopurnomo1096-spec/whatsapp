import { redis, decrypt } from "@/lib/server";

export const MAX_KEYS = 5;
export const PROMPT_MAX = 120000;

export const DEFAULTS = {
  model: "gemini-3.5-flash-lite",
  systemPrompt:
    "Kamu adalah asisten yang ramah di WhatsApp. Jawab dalam bahasa yang dipakai pengguna, singkat, jelas, dan sopan. " +
    "Tulis teks biasa tanpa format Markdown (jangan pakai tanda ** atau #).",
  fallbackText: "Maaf, saya sedang tidak bisa menjawab. Coba kirim lagi sebentar lagi ya.",
  greeting: "Halo {nama}! Silakan kirim pertanyaanmu. Ketik /reset untuk memulai percakapan baru.",
  historyLimit: 10,
  limitCount: 20,
  limitMinutes: 60,
  limitText: "Kamu sudah mencapai batas pesan untuk saat ini. Coba lagi sekitar {sisa} menit lagi ya.",
};

const API = "https://generativelanguage.googleapis.com/v1beta";

/* ---------- pengaturan ---------- */
export const promptOn = (c = {}) => String(c.promptOff ?? "0") !== "1";

export function settingsFrom(c = {}) {
  const hl = Number.parseInt(c.historyLimit, 10);
  const lc = Number.parseInt(c.limitCount, 10);
  const lm = Number.parseInt(c.limitMinutes, 10);
  return {
    model: c.model ? String(c.model) : DEFAULTS.model,
    // Kalau "otak" dimatikan, bot memakai prompt bawaan.
    systemPrompt: promptOn(c) && c.systemPrompt != null ? String(c.systemPrompt) : DEFAULTS.systemPrompt,
    fallbackText: c.fallbackText ? String(c.fallbackText) : DEFAULTS.fallbackText,
    historyLimit: Number.isInteger(hl) && hl >= 0 && hl <= 20 ? hl : DEFAULTS.historyLimit,
    greeting: c.replyText ? String(c.replyText) : DEFAULTS.greeting,
    limitCount: Number.isInteger(lc) && lc >= 0 && lc <= 1000 ? lc : DEFAULTS.limitCount,
    limitMinutes: Number.isInteger(lm) && lm >= 1 && lm <= 1440 ? lm : DEFAULTS.limitMinutes,
    limitText: c.limitText ? String(c.limitText) : DEFAULTS.limitText,
  };
}

/* ---------- API key (tersimpan terenkripsi di hash cfg:keys, slot 1-5) ---------- */
export async function loadKeys() {
  const h = (await redis.hgetall("cfg:keys")) || {};
  return Object.entries(h)
    .map(([slot, v]) => ({ slot: Number(slot), ...(typeof v === "object" && v ? v : {}) }))
    .filter((k) => k.enc)
    .sort((a, b) => a.slot - b.slot);
}

export async function coolStates(slots) {
  if (!slots.length) return [];
  const v = await redis.mget(...slots.map((s) => `kcool:${s}`));
  return v.map((x) => x || null);
}

/* ---------- statistik tiap key ---------- */
// kstat:{slot}  -> hash: ok, fail, last, err, errKind, errAt
// kday:{slot}:{tanggal WIB} -> jumlah permintaan hari itu (hilang otomatis setelah 2 hari)
const today = (offset = 0) => new Date(Date.now() + 7 * 3600e3 - offset * 864e5).toISOString().slice(0, 10);

// Pesan error dari Google tidak boleh membocorkan key.
const scrub = (m) => String(m || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 200);

async function recordKey(slot, ok, kind, message) {
  try {
    const sk = `kstat:${slot}`;
    const dk = `kday:${slot}:${today()}`;
    const p = redis.pipeline();
    p.incr(dk);
    p.expire(dk, 172800);
    if (ok) {
      p.hincrby(sk, "ok", 1);
      p.hset(sk, { last: Date.now() });
    } else {
      p.hincrby(sk, "fail", 1);
      p.hset(sk, { last: Date.now(), err: scrub(message), errKind: kind, errAt: Date.now() });
    }
    await p.exec();
  } catch (e) {
    console.error("Gagal mencatat statistik key:", e?.message);
  }
}

export async function clearKeyData(slot) {
  await redis.del(`kcool:${slot}`, `kstat:${slot}`, ...[0, 1, 2].map((o) => `kday:${slot}:${today(o)}`));
}

export async function keyReport() {
  const keys = await loadKeys();
  if (!keys.length) return [];
  const day = today();
  const p = redis.pipeline();
  for (const k of keys) {
    p.get(`kcool:${k.slot}`);
    p.ttl(`kcool:${k.slot}`);
    p.hgetall(`kstat:${k.slot}`);
    p.get(`kday:${k.slot}:${day}`);
  }
  const r = await p.exec();
  return keys.map((k, i) => {
    const [state, ttl, st, d] = r.slice(i * 4, i * 4 + 4);
    const x = st || {};
    return {
      slot: k.slot,
      mask: k.mask,
      name: k.name || "",
      state: state || null,
      coolSec: state && Number(ttl) > 0 ? Number(ttl) : 0,
      ok: Number(x.ok) || 0,
      fail: Number(x.fail) || 0,
      today: Number(d) || 0,
      last: Number(x.last) || null,
      err: x.err || "",
      errKind: x.errKind || "",
      errAt: Number(x.errAt) || null,
    };
  });
}

/* ---------- panggilan ke Gemini ---------- */
async function callGemini(apiKey, { model, systemPrompt, contents }) {
  let res;
  try {
    res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    return {
      kind: "server",
      message: e?.name === "TimeoutError" ? "Gemini terlalu lama menjawab." : "Tidak bisa terhubung ke Gemini.",
    };
  }

  const raw = await res.text();
  let j = null;
  try { j = JSON.parse(raw); } catch {}

  if (res.ok) {
    const parts = j?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("").trim();
    if (text) return { kind: "ok", text };
    const why = j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || "kosong";
    return { kind: "empty", message: `Gemini tidak mengembalikan jawaban (${why}).` };
  }

  const msg = String(j?.error?.message || `HTTP ${res.status}`).slice(0, 300);
  if (res.status === 429) {
    const m = raw.match(/"retryDelay":\s*"(\d+)/);
    const sec = Math.min(Math.max(m ? Number(m[1]) + 1 : 60, 10), 3600);
    return { kind: "rate", message: msg, cool: sec };
  }
  if (res.status === 401 || res.status === 403 || /API key not valid|API_KEY_INVALID/i.test(raw)) {
    return { kind: "bad", message: msg, cool: 3600 };
  }
  if (res.status === 404) return { kind: "model", message: `Model "${model}" tidak ditemukan. ${msg}` };
  if (res.status >= 500) return { kind: "server", message: msg };
  return { kind: "request", message: msg };
}

/* ---------- membuat balasan dengan rotasi key ---------- */
export async function generateReply({ text, history = [], settings, images = [] }) {
  const keys = await loadKeys();
  if (!keys.length) return { ok: false, error: "Belum ada API key Gemini. Tambahkan di halaman admin." };

  const states = await coolStates(keys.map((k) => k.slot));
  const list = keys.map((k, i) => ({ ...k, state: states[i] }));
  const start = (await redis.incr("rot:idx")) % list.length;
  const rotated = list.map((_, i) => list[(start + i) % list.length]);
  // Key yang sehat dulu; key yang sedang kena batas dicoba paling akhir; key yang ditolak dilewati.
  const queue = [...rotated.filter((k) => !k.state), ...rotated.filter((k) => k.state === "rate")];
  if (!queue.length) return { ok: false, error: "Semua API key ditolak Google. Periksa key di halaman admin." };

  const contents = [
    ...history.map((h) => ({ role: h.r, parts: [{ text: h.t }] })),
    {
      role: "user",
      parts: [
        ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.data } })),
        { text },
      ],
    },
  ];

  let last = "";
  for (const k of queue) {
    let apiKey;
    try { apiKey = await decrypt(k.enc); } catch { last = "Key tidak bisa dibaca."; continue; }
    const r = await callGemini(apiKey, { model: settings.model, systemPrompt: settings.systemPrompt, contents });
    await recordKey(k.slot, r.kind === "ok", r.kind, r.message);
    if (r.kind === "ok") return { ok: true, text: r.text, slot: k.slot };
    last = r.message;
    if (r.cool) await redis.set(`kcool:${k.slot}`, r.kind, { ex: r.cool });
    // Masalah di model/permintaan/jawaban akan sama di semua key, jadi tidak perlu rotasi.
    if (["empty", "model", "request"].includes(r.kind)) return { ok: false, error: r.message };
  }
  return { ok: false, error: `Semua key gagal. Error terakhir: ${last}` };
}

/* ---------- riwayat chat per pengguna ---------- */
const hk = (chatId) => `hist:${chatId}`;

export async function getHistory(chatId, limit) {
  if (!limit) return [];
  const h = ((await redis.lrange(hk(chatId), -limit * 2, -1)) || []).filter(
    (x) => x && typeof x.t === "string" && (x.r === "user" || x.r === "model")
  );
  while (h.length && h[0].r !== "user") h.shift();
  return h;
}

export async function saveTurn(chatId, question, answer, limit) {
  if (!limit) return;
  await redis.rpush(hk(chatId), { r: "user", t: question.slice(0, 2000) }, { r: "model", t: answer.slice(0, 2000) });
  await redis.ltrim(hk(chatId), -limit * 2, -1);
  await redis.expire(hk(chatId), 7 * 86400);
}

export async function clearHistory(chatId) {
  await redis.del(hk(chatId));
}

/* ---------- WhatsApp membatasi 4096 karakter per pesan ---------- */
export function splitText(s, max = 4000) {
  const out = [];
  let rest = s;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
