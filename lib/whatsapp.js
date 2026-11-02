import { wa, waError, GRAPH, decrypt } from "@/lib/server";
import { splitText } from "@/lib/gemini";
import { countSvc } from "@/lib/activity";

// Kredensial WhatsApp dari cfg:bot → { token, phoneId }.
export async function waCreds(cfg) {
  return { token: await decrypt(cfg.token), phoneId: cfg.phoneId };
}

const msgPath = (c) => `/${c.phoneId}/messages`;
// Kirim satu pesan ke pengguna; yang berhasil dihitung untuk pemakaian bulanan.
async function post(c, body) {
  const r = await wa(c.token, msgPath(c), body);
  if (r.ok) await countSvc();
  return r;
}

const base = (to) => ({ messaging_product: "whatsapp", recipient_type: "individual", to: String(to) });

// Tanda "dibaca" + indikator mengetik (hilang sendiri setelah ~25 detik atau saat balasan terkirim).
export function markReadTyping(c, messageId) {
  return wa(c.token, msgPath(c), {
    messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" },
  }).catch(() => {});
}

async function sendRaw(c, to, text) {
  return post(c, { ...base(to), type: "text", text: { body: text, preview_url: false } });
}

// Satu tombol link → pesan interaktif cta_url. Banyak tombol → link ditulis di akhir teks (WhatsApp hanya mengizinkan satu tombol link per pesan).
export async function sendText(c, to, text, buttons = []) {
  const parts = splitText(text, 3600);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    if (last && buttons.length === 1 && parts[i].length <= 1000) {
      const b = buttons[0];
      const r = await post(c, {
        ...base(to),
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: parts[i] },
          action: { name: "cta_url", parameters: { display_text: String(b.text).slice(0, 20), url: b.url } },
        },
      }).catch(() => null);
      if (r?.ok) continue;
    }
    let body = parts[i];
    if (last && buttons.length) body += "\n\n" + buttons.map((b) => `${b.text}: ${b.url}`).join("\n");
    const r = await sendRaw(c, to, body);
    if (!r.ok) throw new Error(waError(r));
  }
}

/* ---------- foto dari pengguna ---------- */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

// Mengembalikan { ok, image: { mime, data } } atau { ok: false, reason }.
export async function fetchImage(c, m) {
  const id = m?.image?.id;
  if (!id) return { ok: false, reason: "none" };
  const info = await wa(c.token, `/${id}`, null, "GET");
  const url = info.data?.url;
  if (!info.ok || !url) return { ok: false, reason: "fail" };
  if ((Number(info.data.file_size) || 0) > MAX_IMAGE_BYTES) return { ok: false, reason: "big" };
  const res = await fetch(url, { headers: { authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return { ok: false, reason: "fail" };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, reason: "big" };
  const mime = String(info.data.mime_type || m.image.mime_type || "image/jpeg").split(";")[0];
  return { ok: true, image: { mime, data: buf.toString("base64") } };
}

/* ---------- kirim media (album = beberapa pesan berurutan) ---------- */
async function sendMediaByLink(c, to, it, caption) {
  const k = it.type === "video" ? "video" : "image";
  return post(c, { ...base(to), type: k, [k]: { link: it.url, ...(caption ? { caption } : {}) } });
}

// Cadangan: server mengunduh file lalu mengunggahnya ke Meta, kemudian mengirim lewat media id.
async function sendMediaByUpload(c, to, it, caption) {
  const r = await fetch(it.url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) return { ok: false, data: { error: { message: `unduh file gagal (HTTP ${r.status})` } } };
  const video = it.type === "video";
  const type = (r.headers.get("content-type") || (video ? "video/mp4" : "image/jpeg")).split(";")[0];
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", type);
  form.append("file", new Blob([await r.arrayBuffer()], { type }), video ? "f.mp4" : "f.jpg");
  const up = await fetch(`${GRAPH}/${c.phoneId}/media`, {
    method: "POST", headers: { authorization: `Bearer ${c.token}` }, body: form, signal: AbortSignal.timeout(50000),
  });
  const ud = await up.json().catch(() => ({}));
  if (!up.ok || !ud.id) return { ok: false, data: ud };
  const k = video ? "video" : "image";
  return post(c, { ...base(to), type: k, [k]: { id: ud.id, ...(caption ? { caption } : {}) } });
}

// Mengirim semua item galeri. Caption dipasang di item pertama. Berhasil kalau minimal satu item terkirim.
export async function sendMediaList(c, to, items, caption) {
  let sent = 0;
  const errs = [];
  for (let i = 0; i < items.length; i++) {
    const cap = i === 0 ? caption : "";
    let r = await sendMediaByLink(c, to, items[i], cap).catch((e) => ({ ok: false, data: { error: { message: e?.message } } }));
    if (!r.ok) {
      const e1 = waError(r);
      r = await sendMediaByUpload(c, to, items[i], cap).catch((e) => ({ ok: false, data: { error: { message: e?.message } } }));
      if (!r.ok) errs.push(`file ${i + 1}: lewat link: ${e1} | lewat unggah: ${waError(r)}`);
    }
    if (r.ok) sent++;
  }
  return sent ? { ok: true } : { ok: false, description: errs.join(" ; ") || "gagal" };
}
