import { redis, dbConfigured, isLoggedIn, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured) {
    return fail(
      "Variabel koneksi Redis tidak ditemukan. Hubungkan Upstash Redis ke project ini (tab Storage di Vercel), lalu klik Redeploy.",
      500
    );
  }
  try {
    const hash = await redis.get("cfg:passhash");
    return json({
      setup: !!hash,
      loggedIn: await isLoggedIn(),
      needsCode: !!process.env.SETUP_CODE,
    });
  } catch (e) {
    return fail(`Gagal terhubung ke Redis: ${String(e?.message || e).slice(0, 200)}`, 500);
  }
}
