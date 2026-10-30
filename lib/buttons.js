// Mengubah link di balasan bot menjadi tombol berlabel (satu link = tombol WhatsApp, lebih dari satu = daftar link di akhir teks).
// Link yang tidak dikenal tetap ada di teks.
// Label tombol mengikuti bahasa balasan: Indonesia dan Inggris langsung (tanpa biaya),
// bahasa lain diterjemahkan oleh Gemini (satu panggilan kecil), dan kalau gagal tetap Inggris.
import { generateReply } from "@/lib/gemini";

const ID_LABELS = {
  "Wholesale Shop": "Toko Grosir",
  "Shop Products": "Lihat Produk",
  "Price List": "Daftar Harga",
  "Customer Reviews": "Ulasan Pembeli",
  "Refund Request": "Ajukan Refund",
  "Track Order": "Lacak Pesanan",
  "Verify Authenticity": "Cek Keaslian",
  "Blog": "Blog",
  "Help Center": "Pusat Bantuan",
  "Telegram Page": "Halaman Telegram",
  "Ask on WhatsApp": "Tanya via WhatsApp",
};

// Ikon emoji di depan label (tombol link WhatsApp tidak mendukung gambar/logo kustom).
const ICONS = {
  "Wholesale Shop": "🏪",
  "Shop Products": "🛍️",
  "Price List": "💲",
  "Customer Reviews": "⭐",
  "Refund Request": "↩️",
  "Track Order": "📦",
  "Verify Authenticity": "✅",
  "Blog": "📝",
  "Help Center": "❓",
  "Telegram Page": "✈️",
  "Ask on WhatsApp": "💬",
};

const count = (re, t) => (t.match(re) || []).length;
const ID_RE = /\b(yang|dan|untuk|silakan|anda|dengan|kami|bisa|ini|itu|tidak|saya|atau|lewat|akan|ada|dari|pesan|harga)\b/gi;
const EN_RE = /\b(the|and|your|you|our|with|for|is|are|can|will|please|order|price|shop)\b/gi;

function detectLang(t) {
  const id = count(ID_RE, t);
  const en = count(EN_RE, t);
  if (id >= 2 && id >= en) return "id";
  if (en >= 2) return "en";
  return "other";
}

// Terjemahan lewat Gemini untuk bahasa selain Indonesia/Inggris. Mengembalikan { label_inggris: terjemahan }.
async function translateLabels(labels, sample, settings) {
  try {
    const system = "You translate short UI button labels. Reply with a single JSON object only, no markdown, no explanation.";
    const ask =
      `Text sample (detect its language): ${JSON.stringify(String(sample).slice(0, 300))}\n` +
      `Translate these button labels into the language of the sample. Keep brand names (EMAHAIRSHOP, WhatsApp) unchanged, ` +
      `keep each label under 25 characters. Return a JSON object with the same keys:\n${JSON.stringify(labels)}`;
    const r = await Promise.race([
      generateReply({ text: ask, history: [], settings: { ...settings, systemPrompt: system } }),
      new Promise((res) => setTimeout(() => res({ ok: false }), 8000)),
    ]);
    if (!r?.ok) return {};
    const j = JSON.parse(r.text.replace(/```json|```/g, "").trim());
    const out = {};
    for (const k of labels) {
      const v = j?.[k];
      if (typeof v === "string" && v.trim() && v.length <= 30) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

const WA_URL = "https://wa.me/62895379994528";

// kunci = host + path tanpa garis miring di akhir
const LABELS = {
  "shop.emahairshop.com": "Wholesale Shop",
  "shop.emahairshop.com/product": "Shop Products",
  "shop.emahairshop.com/price-list": "Price List",
  "shop.emahairshop.com/view-review": "Customer Reviews",
  "shop.emahairshop.com/refund-policy": "Refund Request",
  "track.emahairshop.com": "Track Order",
  "verify.emahairshop.com": "Verify Authenticity",
  "blog.emahairshop.com": "Blog",
  "help.emahairshop.com": "Help Center",
  "telegram.emahairshop.com": "Telegram Page",
  "wa.me/62895379994528": "Ask on WhatsApp",
};

const MAX_BUTTONS = 4;
const URL_RE = /https?:\/\/[^\s)<>]+/g;

const keyOf = (u) => {
  try {
    const x = new URL(u.replace(/[.,;:!?]+$/, ""));
    return (x.host + x.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
};

export async function decorate(text, settings = {}, opts = {}) {
  const src = String(text || "");

  // Balasan anti-penipuan menampilkan daftar kanal resmi sebagai teks supaya bisa dibandingkan:
  // jangan diubah jadi tombol.
  if (/verify\.emahairshop\.com/i.test(src) && /wa\.me\//i.test(src)) return { text: src, buttons: [] };

  const buttons = [];
  const seen = new Set();
  let waWanted = false;

  const lines = src.split("\n").map((line) => {
    let changed = false;
    const res = line.replace(URL_RE, (m) => {
      const k = keyOf(m);
      const label = LABELS[k];
      if (!label) return m; // link tidak dikenal: biarkan di teks
      changed = true;
      if (k === "wa.me/62895379994528") {
        waWanted = true;
      } else if (!seen.has(k)) {
        seen.add(k);
        buttons.push({ text: label, url: `https://${k}${k.includes("/") ? "" : "/"}` });
      }
      return "";
    });
    // Hanya baris yang linknya dihapus yang dirapikan (buang titik dua / spasi sisa).
    return changed ? res.replace(/\s*:?\s*$/, "") : line;
  });

  // Tombol WhatsApp juga muncul kalau balasan menyebut WhatsApp.
  if (waWanted || opts.forceWa || /whatsapp/i.test(src)) {
    buttons.push({ text: LABELS["wa.me/62895379994528"], url: WA_URL });
  }

  if (!buttons.length) return { text: src, buttons: [] };

  // Rapikan baris kosong berlebih.
  let out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!out) out = "👇";

  const final = buttons.slice(0, MAX_BUTTONS);

  // Sesuaikan label dengan bahasa balasan.
  const lang = detectLang(src);
  const keys = final.map((b) => b.text); // label Inggris = kunci ikon
  if (lang === "id") {
    for (const b of final) b.text = ID_LABELS[b.text] || b.text;
  } else if (lang === "other") {
    const tr = await translateLabels(keys, src, settings);
    for (const b of final) b.text = tr[b.text] || b.text;
  }
  final.forEach((b, i) => {
    if (ICONS[keys[i]]) b.text = `${ICONS[keys[i]]} ${b.text}`;
  });

  return { text: out, buttons: final };
}
