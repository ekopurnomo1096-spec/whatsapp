import crypto from "crypto";
import { getSvcUsage } from "@/lib/activity";
import { json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

// Dipanggil server go-main (tombol Sinkron) untuk menarik angka terbaru dari Meta.
// Aktif hanya kalau env SYNC_SECRET diisi; header: Authorization: Bearer <SYNC_SECRET>.
export async function POST(req) {
  const secret = process.env.SYNC_SECRET || "";
  if (secret.length < 16) return fail("Sinkron lewat API belum diaktifkan.", 404);
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(got).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(a, b)) return fail("Tidak diizinkan.", 401);
  const usage = await getSvcUsage(true);
  if (usage.metaErr) return fail("Meta gagal: " + usage.metaErr, 502);
  return json({ ok: true, usage });
}
