import { isLoggedIn, json, fail } from "@/lib/server";
import { listConvs, getConv, deleteConv, clearConvs, validChatId } from "@/lib/activity";
export const dynamic = "force-dynamic";

// Tanpa ?id → daftar percakapan. Dengan ?id=… → isi satu percakapan.
export async function GET(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (id == null) return json({ chats: await listConvs(100) });
  if (!validChatId(id)) return fail("ID percakapan tidak valid.");
  return json(await getConv(id));
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action, id } = await req.json().catch(() => ({}));
  if (action === "delete") {
    if (!validChatId(id)) return fail("ID percakapan tidak valid.");
    await deleteConv(id);
    return json({ ok: true });
  }
  if (action === "clear") {
    await clearConvs();
    return json({ ok: true });
  }
  return fail("Aksi tidak dikenal.");
}
