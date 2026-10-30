import { isLoggedIn, json, fail } from "@/lib/server";
import { getGalleries, saveGalleries, cleanGalleries, MAX_GALLERIES, MAX_ITEMS } from "@/lib/gallery";
import { PRODUCTS } from "@/lib/products";
import { del } from "@vercel/blob";
export const dynamic = "force-dynamic";

const isBlobUrl = (u) => {
  try { return new URL(u).hostname.endsWith(".blob.vercel-storage.com"); } catch { return false; }
};

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  return json({
    galleries: await getGalleries(),
    products: PRODUCTS,
    maxGalleries: MAX_GALLERIES,
    maxItems: MAX_ITEMS,
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { galleries } = await req.json().catch(() => ({}));
  const r = cleanGalleries(galleries);
  if (!r.ok) return fail(r.error);

  // File yang diunggah lewat admin dan sekarang sudah dibuang dari galeri ikut dihapus dari penyimpanan.
  const before = await getGalleries();
  await saveGalleries(r.list);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const keep = new Set(r.list.flatMap((g) => g.items.map((i) => i.url)));
    const gone = before.flatMap((g) => g.items.map((i) => i.url)).filter((u) => !keep.has(u) && isBlobUrl(u));
    if (gone.length) await del(gone).catch((e) => console.error("Hapus file galeri gagal:", e?.message));
  }
  return json({ ok: true, galleries: r.list });
}
