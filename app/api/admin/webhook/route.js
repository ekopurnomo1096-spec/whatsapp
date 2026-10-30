import crypto from "crypto";
import { redis, isLoggedIn, decrypt, wa, waError, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

function hookUrl(req) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `https://${host}/api/whatsapp`;
}

// Meta tidak mengizinkan alamat callback diatur lewat token akun, jadi alamat + verify token ditempel manual
// di Meta Developer (WhatsApp > Configuration). Di sini kita hanya mendaftarkan app ke akun WhatsApp Business.
export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action } = await req.json().catch(() => ({}));
  const cfg = (await redis.hgetall("cfg:bot")) || {};
  if (!cfg.token || !cfg.phoneId || !cfg.wabaId) return fail("Simpan data akun WhatsApp terlebih dahulu.");
  const token = await decrypt(cfg.token);
  const url = hookUrl(req);

  let verifyToken = cfg.verifyToken;
  if (!verifyToken) {
    verifyToken = "vt" + crypto.randomBytes(16).toString("hex");
    await redis.hset("cfg:bot", { verifyToken });
  }

  if (action === "set") {
    if (!cfg.appSecret) return fail("Isi App Secret dulu di menu Akun WhatsApp.");
    const r = await wa(token, `/${cfg.wabaId}/subscribed_apps`, {});
    if (!r.ok) return fail(`Meta menolak: ${waError(r)}`);
    return json({ ok: true });
  }

  if (action === "delete") {
    const r = await wa(token, `/${cfg.wabaId}/subscribed_apps`, null, "DELETE");
    if (!r.ok) return fail(`Meta menolak: ${waError(r)}`);
    return json({ ok: true });
  }

  if (action === "status") {
    const r = await wa(token, `/${cfg.wabaId}/subscribed_apps`, null, "GET");
    return json({
      active: r.ok && Array.isArray(r.data?.data) && r.data.data.length > 0,
      url,
      verifyToken,
      hasAppSecret: !!cfg.appSecret,
      error: r.ok ? "" : waError(r),
    });
  }

  return fail("Aksi tidak dikenal.");
}
