import crypto from "crypto";
import { redis, decrypt } from "@/lib/server";
import { waCreds, markReadTyping, sendText, fetchImage } from "@/lib/whatsapp";
import { generateReply, settingsFrom, getHistory, saveTurn, clearHistory } from "@/lib/gemini";
import { addLog, addConv, checkLimit, getSvcUsage, addUnans, looksUnsure } from "@/lib/activity";
import { decorate } from "@/lib/buttons";
import { getGalleries, withGalleryPrompt, extractGallery, sendAlbum, wantsMedia, wantsMore, matchGallery } from "@/lib/gallery";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dipakai saat album dikirim otomatis oleh server.
const CLAIMS_SENT = /(sudah|telah)\s+(di)?(kirim|bagikan|lihat)|pesan sebelumnya|sebelumnya|already (sent|shared|provided)|earlier|previous message/i;
const EN_CUE = /\b(photos?|pics?|pictures?|images?|samples?|catalog(ue)?|do you|any|have)\b/i;
const ID_CUE = /\b(ada|foto|fotonya|gambar|gambarnya|mana|bisa|contoh|mau|dong|lihat|liat|gak|ga|kak|tolong|minta)\b/i;

/* ---------- verifikasi webhook (Meta memanggil GET sekali saat webhook didaftarkan) ---------- */
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const cfg = (await redis.hgetall("cfg:bot")) || {};
  if (q.get("hub.mode") === "subscribe" && cfg.verifyToken && q.get("hub.verify_token") === cfg.verifyToken) {
    return new Response(q.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

// Tanda tangan X-Hub-Signature-256 = HMAC-SHA256(isi mentah, App Secret).
function signatureOk(raw, header, appSecret) {
  const good = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
  const a = Buffer.from(String(header || ""));
  const b = Buffer.from(good);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req) {
  const cfg = (await redis.hgetall("cfg:bot")) || {};
  if (!cfg.token || !cfg.phoneId || !cfg.appSecret) return new Response("not configured", { status: 503 });

  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"), await decrypt(cfg.appSecret))) {
    return new Response("forbidden", { status: 403 });
  }

  let body = null;
  try { body = JSON.parse(raw); } catch {}

  // Selalu balas 200 agar Meta tidak mengulang-ulang pengiriman.
  try {
    const s = settingsFrom(cfg);
    const c = await waCreds(cfg);
    for (const entry of body?.entry || []) {
      for (const ch of entry.changes || []) {
        if (ch.field !== "messages") continue;
        const v = ch.value || {};
        if (v.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== String(cfg.phoneId)) continue;
        for (const m of v.messages || []) {
          await handleMessage({ m, contacts: v.contacts || [], cfg, s, c });
        }
      }
    }
  } catch (e) {
    console.error("Gagal memproses pesan:", e?.message);
  }
  return Response.json({ ok: true });
}

async function handleMessage({ m, contacts, cfg, s, c }) {
  if (!m?.id || !m.from) return;
  const first = await redis.set(`msg:${m.id}`, 1, { nx: true, ex: 600 });
  if (!first) return; // pesan ganda

  const chatId = m.from; // nomor WhatsApp pengirim (format internasional, tanpa +)
  const uid = chatId;
  const prof = contacts.find((x) => x.wa_id === m.from)?.profile?.name || "";
  const who = prof ? `${prof} (+${chatId})` : `+${chatId}`;
  const title = prof || `+${chatId}`;
  const send = async (text, buttons = [], logText = text) => {
    await sendText(c, chatId, text, buttons);
    await addConv({ chatId, title, role: "bot", name: "Bot", text: logText });
  };

  const isImage = m.type === "image" && !!m.image?.id;
  const isText = m.type === "text" && !!m.text?.body;

  // Jatah gratis bulan ini hampir/sudah habis (berhenti di stopAt, sedikit di bawah 1.000): pesan dicatat di admin, tapi bot tidak membalas (supaya tidak ada tagihan).
  const u = await getSvcUsage();
  if (u.used >= u.stopAt) {
    if (isText || isImage) {
      const cap = (isImage ? m.image.caption || "" : m.text.body).trim().slice(0, 4000);
      await addConv({ chatId, title, role: "user", name: who, text: isImage ? `[Foto]${cap ? " " + cap : ""}` : cap });
    }
    return;
  }
  if (!isText && !isImage) {
    // Pesan suara/video/dokumen: beri tahu sekali. Jenis lain (reaksi, sistem, dll.) diabaikan.
    if (["audio", "video", "document", "sticker"].includes(m.type)) {
      markReadTyping(c, m.id);
      await send("Maaf, saya hanya bisa membaca teks dan foto. Silakan tulis pertanyaanmu ya.");
    }
    return;
  }

  const caption = (isImage ? m.image.caption || "" : m.text.body).trim().slice(0, 4000);
  const text = isImage ? `[Foto]${caption ? " " + caption : ""}` : caption;
  await addConv({ chatId, title, role: "user", name: who, text });
  const cmd = text.split(/\s/)[0].toLowerCase();

  if (cmd === "/start") {
    await send(s.greeting.replaceAll("{nama}", prof.split(" ")[0] || "teman"));
    return;
  }
  if (cmd === "/reset") {
    await clearHistory(chatId);
    await send("Riwayat percakapan dihapus. Kita mulai dari awal ya.");
    return;
  }

  const t0 = Date.now();
  const lim = await checkLimit(uid, s);
  if (!lim.ok) {
    // Pemberitahuan dikirim sekali saja per jendela, supaya pengguna yang spam tidak dibalas terus.
    if (lim.first) {
      await send(s.limitText.replaceAll("{sisa}", String(Math.max(1, Math.ceil(lim.retrySec / 60)))));
    }
    await addLog({
      uid, name: who, q: text, st: "limited", ms: Date.now() - t0,
      a: lim.first ? "Batas tercapai, pemberitahuan dikirim." : "Batas tercapai, tidak dibalas.",
    });
    return;
  }

  markReadTyping(c, m.id);
  const history = await getHistory(chatId, s.historyLimit);
  let images = [];
  let askText = text;
  if (isImage) {
    const got = await fetchImage(c, m).catch(() => ({ ok: false, reason: "fail" }));
    if (!got.ok) {
      const note =
        got.reason === "big"
          ? "Maaf, ukuran fotonya terlalu besar. Coba kirim foto yang lebih kecil ya."
          : "Maaf, fotonya belum bisa saya buka. Coba kirim ulang ya.";
      await send(note);
      await addLog({ uid, name: who, q: text, a: note, st: "error", ms: Date.now() - t0 });
      return;
    }
    images = [got.image];
    askText = caption || "(Pengunjung mengirim foto tanpa teks. Jelaskan singkat apa yang terlihat dan tanyakan apa yang ingin dibantu.)";
  }
  const galleries = await getGalleries();
  // Pengunjung minta foto/video produk yang punya galeri: album dikirim walau AI lupa menulis tag.
  const more = wantsMore(caption);
  const forced = !isImage && !more && wantsMedia(caption) ? matchGallery(caption, galleries) : null;
  const r = await generateReply({ text: askText, history, settings: withGalleryPrompt(s, galleries), images });
  if (!r.ok) {
    console.error("Gemini gagal:", r.error);
    await send(s.fallbackText);
    await addLog({ uid, name: who, q: text, a: r.error, st: "error", ms: Date.now() - t0 });
    await addUnans({ uid, name: who, q: text, a: r.error, why: "error" });
    return;
  }

  // Tag [[GALLERY:id]] dari AI = kirim galeri itu, lalu teks + tombol.
  const gx = extractGallery(r.text, galleries);
  const gal = more ? null : (gx.gallery || forced); // minta "yang lain": jangan kirim album lagi
  let reply = gx.text;
  let albumErr = "";
  const en = EN_CUE.test(caption) && !ID_CUE.test(caption);
  if (gal) {
    const ar = await sendAlbum(c, chatId, gal).catch((e) => ({ ok: false, description: e?.message }));
    if (!ar?.ok) { albumErr = String(ar?.description || "gagal").slice(0, 300); console.error("Album gagal:", albumErr); }
  }
  if (gal && albumErr) {
    // Album gagal: jangan mengaku sudah mengirim.
    reply = en
      ? "Sorry, I couldn't send the photos right now. Please ask the team directly."
      : "Maaf, fotonya belum bisa dikirim sekarang. Silakan tanyakan langsung ke tim kami.";
  } else if (gal && !gx.gallery && CLAIMS_SENT.test(reply)) {
    // Album dikirim server (AI lupa tag) tapi kalimat AI bilang "sudah dikirim": ganti dengan kalimat pasti.
    reply = en ? `Here are our ${gal.name} photos.` : `Berikut foto ${gal.name} kami.`;
  }
  const d = await decorate(reply, s, { forceWa: false });
  let buttons = d.buttons;
  if (gal && !albumErr && gal.pageUrl) {
    const label = gal.buttonLabel || `Galeri ${gal.name}`;
    buttons = [{ text: `🖼️ ${label}`, url: gal.pageUrl }, ...buttons].slice(0, 4);
  }
  await send(d.text, buttons, r.text);
  await saveTurn(chatId, text, albumErr ? reply : r.text, s.historyLimit);
  if (looksUnsure(r.text)) await addUnans({ uid, name: who, q: text, a: r.text, why: "unsure" });
  await addLog({ uid, name: who, q: text, a: albumErr ? `${r.text} [Album gagal: ${albumErr}]` : r.text, st: albumErr ? "error" : "ok", slot: r.slot, ms: Date.now() - t0 });
}
