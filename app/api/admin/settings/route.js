import crypto from "crypto";
import { redis, isLoggedIn, encrypt, decrypt, wa, waError, maskToken, json, fail } from "@/lib/server";
import { settingsFrom, promptOn, DEFAULTS, PROMPT_MAX } from "@/lib/gemini";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const c = (await redis.hgetall("cfg:bot")) || {};
  let masked = "";
  if (c.token) {
    try { masked = maskToken(await decrypt(c.token)); } catch { masked = "(tidak bisa dibaca)"; }
  }
  const s = settingsFrom(c);
  return json({
    hasToken: !!c.token,
    tokenMasked: masked,
    username: c.username || "",
    verifiedName: c.verifiedName || "",
    phoneId: c.phoneId || "",
    wabaId: c.wabaId || "",
    hasAppSecret: !!c.appSecret,
    replyText: s.greeting,
    model: s.model,
    systemPrompt: c.systemPrompt != null ? String(c.systemPrompt) : DEFAULTS.systemPrompt,
    promptOn: promptOn(c),
    hasPrev: c.prevSystemPrompt != null,
    defaultPrompt: DEFAULTS.systemPrompt,
    promptMax: PROMPT_MAX,
    fallbackText: s.fallbackText,
    historyLimit: s.historyLimit,
    limitCount: s.limitCount,
    limitMinutes: s.limitMinutes,
    limitText: s.limitText,
  });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { token, phoneId, wabaId, appSecret, replyText, model, systemPrompt, fallbackText, historyLimit, limitCount, limitMinutes, limitText, promptOn: on, promptAction } = await req.json().catch(() => ({}));
  const update = {};
  const cur = (await redis.hgetall("cfg:bot")) || {};
  const curPrompt = cur.systemPrompt != null ? String(cur.systemPrompt) : DEFAULTS.systemPrompt;

  if (promptAction === "undo") {
    if (cur.prevSystemPrompt == null) return fail("Belum ada perubahan yang bisa dibatalkan.");
    update.systemPrompt = String(cur.prevSystemPrompt);
    update.prevSystemPrompt = curPrompt;
  } else if (promptAction === "reset") {
    update.systemPrompt = DEFAULTS.systemPrompt;
    update.prevSystemPrompt = curPrompt;
  } else if (promptAction !== undefined) {
    return fail("Aksi tidak dikenal.");
  }

  if (typeof on === "boolean") update.promptOff = on ? "0" : "1";

  const given = (v) => typeof v === "string" && v.trim();
  if (given(token) || given(phoneId) || given(wabaId)) {
    let t = given(token) ? token.trim() : "";
    if (!t && cur.token) { try { t = await decrypt(cur.token); } catch {} }
    const pid = given(phoneId) ? phoneId.trim() : String(cur.phoneId || "");
    const wid = given(wabaId) ? wabaId.trim() : String(cur.wabaId || "");
    if (!t) return fail("Isi access token dulu.");
    if (!/^\d{5,20}$/.test(pid)) return fail("Phone Number ID harus berupa angka.");
    if (!/^\d{5,20}$/.test(wid)) return fail("WhatsApp Business Account ID harus berupa angka.");
    // Cek ke Meta bahwa token dan Phone Number ID cocok.
    const me = await wa(t, `/${pid}?fields=display_phone_number,verified_name`, null, "GET").catch(() => null);
    if (!me?.ok) return fail(`Meta menolak: ${me ? waError(me) : "tidak bisa dihubungi"}`);
    if (given(token)) update.token = await encrypt(t);
    update.phoneId = pid;
    update.wabaId = wid;
    update.username = me.data.display_phone_number || "";
    update.verifiedName = me.data.verified_name || "";
    if (!cur.verifyToken) update.verifyToken = "vt" + crypto.randomBytes(16).toString("hex");
  }

  if (given(appSecret)) {
    const a = appSecret.trim();
    if (!/^[0-9a-f]{32}$/i.test(a)) return fail("App Secret harus 32 karakter heksadesimal. Salin dari App settings > Basic.");
    update.appSecret = await encrypt(a);
  }

  if (typeof replyText === "string") {
    const r = replyText.trim();
    if (!r) return fail("Pesan sambutan tidak boleh kosong.");
    if (r.length > 1000) return fail("Pesan sambutan maksimal 1000 karakter.");
    update.replyText = r;
  }

  if (typeof model === "string") {
    const m = model.trim();
    if (!/^[A-Za-z0-9._-]{3,60}$/.test(m)) return fail("Nama model tidak valid. Contoh: gemini-3.5-flash-lite");
    update.model = m;
  }

  if (typeof systemPrompt === "string") {
    if (systemPrompt.length > PROMPT_MAX) return fail(`Teks otak maksimal ${PROMPT_MAX} karakter.`);
    const next = systemPrompt.trim();
    if (next !== curPrompt) { update.systemPrompt = next; update.prevSystemPrompt = curPrompt; }
  }

  if (typeof fallbackText === "string") {
    const f = fallbackText.trim();
    if (!f) return fail("Pesan cadangan tidak boleh kosong.");
    if (f.length > 500) return fail("Pesan cadangan maksimal 500 karakter.");
    update.fallbackText = f;
  }

  if (historyLimit !== undefined) {
    const n = Number(historyLimit);
    if (!Number.isInteger(n) || n < 0 || n > 20) return fail("Riwayat chat harus angka bulat 0 sampai 20.");
    update.historyLimit = n;
  }

  if (limitCount !== undefined) {
    const n = Number(limitCount);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return fail("Batas pesan harus angka bulat 0 sampai 1000 (0 = tanpa batas).");
    update.limitCount = n;
  }

  if (limitMinutes !== undefined) {
    const n = Number(limitMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 1440) return fail("Jendela waktu harus 1 sampai 1440 menit.");
    update.limitMinutes = n;
  }

  if (typeof limitText === "string") {
    const t = limitText.trim();
    if (!t) return fail("Pesan batas tidak boleh kosong.");
    if (t.length > 500) return fail("Pesan batas maksimal 500 karakter.");
    update.limitText = t;
  }

  if (!Object.keys(update).length) return fail("Tidak ada yang disimpan.");
  await redis.hset("cfg:bot", update);
  return json({ ok: true });
}
