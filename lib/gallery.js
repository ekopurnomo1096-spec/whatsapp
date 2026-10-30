import { redis } from "@/lib/server";
import { sendMediaList } from "@/lib/whatsapp";
import { PRODUCTS } from "@/lib/products";

// Galeri foto/video yang bisa dikirim bot sebagai album. Disimpan di Redis (cfg:gallery), diatur lewat menu admin.
const KEY = "cfg:gallery";
export const MAX_GALLERIES = 20;
export const MAX_ITEMS = 10; // WhatsApp tidak punya album: tiap item dikirim sebagai pesan terpisah, jadi dibatasi 10

export async function getGalleries() {
  try {
    const v = await redis.get(KEY);
    const a = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export async function saveGalleries(list) {
  await redis.set(KEY, list);
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

function httpsUrl(v, max = 800) {
  const s = str(v, max);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Memeriksa dan merapikan data dari admin. Mengembalikan { ok: true, list } atau { ok: false, error }.
export function cleanGalleries(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Data galeri tidak valid." };
  if (input.length > MAX_GALLERIES) return { ok: false, error: `Maksimal ${MAX_GALLERIES} galeri.` };
  const seen = new Set();
  const list = [];
  for (const [n, g] of input.entries()) {
    const label = `Galeri ${n + 1}`;
    const id = str(g?.id, 40).toLowerCase();
    const prod = PRODUCTS.find((x) => x.id === id);
    if (!prod) return { ok: false, error: `${label}: pilih produk dari daftar.` };
    const name = prod.name;
    if (seen.has(id)) return { ok: false, error: `${name}: kode "${id}" sudah dipakai galeri lain.` };
    seen.add(id);
    const pageUrl = httpsUrl(g?.pageUrl, 500);
    if (pageUrl === null) return { ok: false, error: `${name}: link halaman galeri harus diawali https://` };
    const items = [];
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      const type = it?.type === "video" ? "video" : "photo";
      const url = httpsUrl(it?.url);
      if (url === null) return { ok: false, error: `${name}: link ${type === "video" ? "video" : "foto"} harus diawali https://` };
      if (url) {
        const size = Number(it?.size);
        items.push({ type, url, ...(it?.name ? { name: str(it.name, 120) } : {}), ...(Number.isFinite(size) && size > 0 ? { size: Math.round(size) } : {}) });
      }
    }
    if (items.length > MAX_ITEMS) return { ok: false, error: `${name}: maksimal ${MAX_ITEMS} foto/video per galeri.` };
    list.push({
      id,
      name,
      keywords: str(g?.keywords, 200),
      caption: str(g?.caption, 900),
      pageUrl,
      buttonLabel: str(g?.buttonLabel, 40),
      items,
    });
  }
  return { ok: true, list };
}

// Tambahan untuk prompt: daftar galeri yang boleh dikirim. Hanya galeri yang punya isi.
export function promptBlock(list) {
  const usable = (list || []).filter((g) => g.items?.length);
  if (!usable.length) return "";
  const rows = usable.map((g) => `- id=${g.id} | ${g.name}${g.keywords ? ` | also called: ${g.keywords}` : ""}`).join("\n");
  return (
    "\n\nGALLERY (photos and videos you can send in this chat). This section OVERRIDES the PRODUCT PHOTOS rule for the product groups listed below. " +
    "When the visitor asks for photos, pictures, samples, videos or \"ada fotonya\" for one of these product groups, write ONE short sentence (no links, no Order ID, no tracker) " +
    "and put the tag [[GALLERY:id]] alone on the last line; the system then sends the album and the buttons by itself. " +
    "Add the tag when the visitor asks for photos or videos of a listed product, even if you already sent that gallery earlier in this conversation. " +
    "EXCEPTION: if the visitor asks for MORE or DIFFERENT photos than the ones already sent (e.g. \"selain itu\", \"yang lain\", \"ada lagi\", \"other photos\", \"more\"), do NOT add the tag. Say in ONE short sentence that the gallery already sent is all that is available in this chat, and that other variations can be asked to the team via WhatsApp. " +
    "Never explain or mention the tag. " +
    "For a product that is not listed here, say in ONE short sentence that its photos are not available in this chat yet, and that for photos or samples they can ask the team via WhatsApp. " +
    "Example in Indonesian: \"Foto hair weft belum tersedia di sini. Untuk foto atau contohnya, silakan tanyakan ke tim lewat WhatsApp.\" Never say or imply that EMAHAIRSHOP has no such photos or product.\nGalleries:\n" +
    rows
  );
}

export function withGalleryPrompt(settings, list) {
  const b = promptBlock(list);
  return b ? { ...settings, systemPrompt: String(settings.systemPrompt || "") + b } : settings;
}

const TAG_RE = /\[\[\s*GALLERY\s*:\s*([a-z0-9_-]+)\s*\]\]/gi;

// Mengambil tag galeri dari balasan AI dan membersihkannya dari teks.
export function extractGallery(text, list) {
  const src = String(text || "");
  let id = null;
  src.replace(TAG_RE, (_, x) => { if (!id) id = x.toLowerCase(); return ""; });
  const clean = src.replace(TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  const gallery = id ? (list || []).find((g) => g.id === id && g.items?.length) || null : null;
  return { text: clean, gallery };
}

// Mengirim galeri (satu foto/video, atau beberapa pesan berurutan). Foto lewat link maks. 5 MB, video 16 MB.
// `c` = { token, phoneId }, `to` = nomor penerima. Mengembalikan { ok, description? }.
export async function sendAlbum(c, to, g) {
  const items = (g.items || []).slice(0, MAX_ITEMS);
  if (!items.length) return { ok: false, description: "Galeri kosong." };
  const caption = String(g.caption || "").slice(0, 1000);
  return sendMediaList(c, to, items, caption);
}

// ---------- pendeteksi di sisi server ----------
// Supaya album tetap terkirim walau AI lupa menulis tag: kalau pesan pengunjung meminta foto/video
// dan menyebut produk yang punya galeri, galeri itu dikirim.
const MEDIA_RE = /\b(foto|fotonya|gambar|gambarnya|video|videonya|contoh|contohnya|sampel|sample|samples|photo|photos|pic|pics|picture|pictures|image|images|katalog|catalog|catalogue)\b/i;
export const wantsMedia = (text) => MEDIA_RE.test(String(text || ""));

const norm = (t) => " " + String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

// Mengembalikan galeri yang produknya disebut di pesan (yang paling spesifik menang), atau null.
export function matchGallery(text, list) {
  const t = norm(text);
  let best = null;
  let bestLen = 0;
  for (const g of list || []) {
    if (!g.items?.length) continue;
    const keys = [g.name, ...String(g.keywords || "").split(",")].map((k) => norm(k).trim()).filter((k) => k.length >= 3);
    for (const k of keys) {
      if (t.includes(" " + k + " ") && k.length > bestLen) { best = g; bestLen = k.length; }
    }
  }
  return best;
}

// Pengunjung minta foto LAIN / TAMBAHAN di luar yang sudah dikirim: album tidak dikirim ulang.
const MORE_RE = /\b(selain|lainnya|lain|tambahan|other|others|more|another|else|different|besides)\b|\b(ada|masih|punya)\s+(\w+\s+){0,3}lagi\b/i;
export const wantsMore = (text) => MORE_RE.test(String(text || ""));
