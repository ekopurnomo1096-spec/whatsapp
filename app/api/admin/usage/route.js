import { redis, decrypt, GRAPH, isLoggedIn, json, fail } from "@/lib/server";
import { getSvcUsage } from "@/lib/activity";
export const dynamic = "force-dynamic";

// Diagnosa pemakaian pesan layanan: buka /api/admin/usage di browser (harus sudah login admin).
// Menampilkan hitungan lokal, angka yang dipakai bot, dan jawaban mentah dari Meta.
export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum login.", 401);
  const cfg = (await redis.hgetall("cfg:bot")) || {};
  const out = { hasToken: !!cfg.token, wabaId: cfg.wabaId || null, usage: await getSvcUsage() };
  if (!cfg.token || !cfg.wabaId) return json({ ...out, note: "Token atau WABA ID belum tersimpan." });
  try {
    const token = await decrypt(cfg.token);
    const now = new Date();
    const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
    const end = Math.floor(Date.now() / 1000);
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).metric_types(["VOLUME"]).dimensions(["PRICING_CATEGORY"])`;
    const res = await fetch(`${GRAPH}/${cfg.wabaId}?fields=${encodeURIComponent(fields)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await res.json().catch(() => ({}));
    return json({ ...out, meta: { status: res.status, ok: res.ok, raw } });
  } catch (e) {
    return json({ ...out, meta: { error: String(e?.message || e).slice(0, 300) } });
  }
}
