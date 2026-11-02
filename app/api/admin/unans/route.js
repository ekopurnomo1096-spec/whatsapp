import { isLoggedIn, json, fail } from "@/lib/server";
import { getUnans, clearUnans } from "@/lib/activity";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  return json({ items: await getUnans(100) });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action } = await req.json().catch(() => ({}));
  if (action === "clear") {
    await clearUnans();
    return json({ ok: true });
  }
  return fail("Aksi tidak dikenal.");
}
