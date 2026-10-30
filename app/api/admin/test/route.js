import { redis, isLoggedIn, json, fail } from "@/lib/server";
import { generateReply, settingsFrom } from "@/lib/gemini";
import { getGalleries, withGalleryPrompt } from "@/lib/gallery";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { message } = await req.json().catch(() => ({}));
  const text = typeof message === "string" ? message.trim().slice(0, 2000) : "";
  if (!text) return fail("Tulis pesan uji coba dulu.");

  const settings = settingsFrom((await redis.hgetall("cfg:bot")) || {});
  const r = await generateReply({ text, history: [], settings: withGalleryPrompt(settings, await getGalleries()) });
  if (!r.ok) return fail(r.error, 502);
  return json({ ok: true, text: r.text, slot: r.slot });
}
