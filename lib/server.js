import { Redis } from "@upstash/redis";
import crypto from "crypto";
import { cookies } from "next/headers";

// Mengenali env Redis dengan awalan apa pun (mis. STORAGE_KV_REST_API_URL).
function findEnv(names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  for (const k of Object.keys(process.env)) {
    if (names.some((n) => k.endsWith("_" + n)) && process.env[k]) return process.env[k];
  }
}
const url = findEnv(["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"]);
const token = findEnv(["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"]);
export const dbConfigured = !!(url && token);
export const redis = new Redis({ url, token });

export const DEFAULT_REPLY =
  "Halo {nama}! Pesanmu sudah diterima. Bot ini masih dalam tahap pengembangan.";

/* ---------- kunci enkripsi ---------- */
async function appKey() {
  if (process.env.APP_SECRET) {
    return crypto.createHash("sha256").update(process.env.APP_SECRET).digest();
  }
  let k = await redis.get("cfg:appkey");
  if (!k) {
    await redis.set("cfg:appkey", "k" + crypto.randomBytes(32).toString("hex"), { nx: true });
    k = await redis.get("cfg:appkey");
  }
  return Buffer.from(String(k).slice(1), "hex");
}

export async function encrypt(text) {
  const key = await appKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export async function decrypt(s) {
  const key = await appKey();
  const b = Buffer.from(String(s).slice(3), "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

/* ---------- password ---------- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return "s1:" + salt.toString("hex") + ":" + h.toString("hex");
}

export function checkPassword(pw, stored) {
  try {
    const [, s, h] = String(stored).split(":");
    const x = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64);
    return crypto.timingSafeEqual(x, Buffer.from(h, "hex"));
  } catch {
    return false;
  }
}

/* ---------- sesi (cookie bertanda tangan) ---------- */
const COOKIE = "admin_session";
const DAYS = 7;

async function sign(exp) {
  return crypto.createHmac("sha256", await appKey()).update("sess:" + exp).digest("hex");
}

export async function createSession() {
  const exp = Date.now() + DAYS * 864e5;
  const c = await cookies();
  c.set(COOKIE, `${exp}.${await sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DAYS * 86400,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function isLoggedIn() {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = await sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

/* ---------- respons ---------- */
export const json = (data, status = 200) => Response.json(data, { status });
export const fail = (error, status = 400) => Response.json({ error }, { status });

/* ---------- WhatsApp Cloud API (Meta Graph) ---------- */
export const GRAPH = "https://graph.facebook.com/v21.0";

// Mengembalikan { ok, status, data }. Pesan error Meta ada di data.error.message.
export async function wa(token, path, body, method = "POST") {
  const r = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export const waError = (r) => String(r?.data?.error?.message || `HTTP ${r?.status ?? "?"}`).slice(0, 300);

export function maskToken(t) {
  return t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)}` : "••••";
}
