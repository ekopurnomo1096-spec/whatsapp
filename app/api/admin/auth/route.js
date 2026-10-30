import { redis, hashPassword, checkPassword, createSession, clearSession, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { action, password = "", code = "" } = await req.json().catch(() => ({}));

  if (action === "logout") {
    await clearSession();
    return json({ ok: true });
  }

  const stored = await redis.get("cfg:passhash");

  if (action === "setup") {
    if (stored) return fail("Password sudah dibuat. Silakan masuk.", 409);
    if (process.env.SETUP_CODE && code !== process.env.SETUP_CODE) return fail("Kode setup salah.", 403);
    if (password.length < 8) return fail("Password minimal 8 karakter.");
    const ok = await redis.set("cfg:passhash", hashPassword(password), { nx: true });
    if (!ok) return fail("Password sudah dibuat. Silakan masuk.", 409);
    await createSession();
    return json({ ok: true });
  }

  if (action === "login") {
    if (!stored) return fail("Password belum dibuat.", 409);
    const ip = (req.headers.get("x-forwarded-for") || "x").split(",")[0].trim();
    const k = `rl:login:${ip}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 600);
    if (n > 10) return fail("Terlalu banyak percobaan. Coba lagi dalam 10 menit.", 429);
    if (!checkPassword(password, stored)) return fail("Password salah.", 401);
    await redis.del(k);
    await createSession();
    return json({ ok: true });
  }

  return fail("Aksi tidak dikenal.");
}
