import { isLoggedIn, json, fail } from "@/lib/server";
import { getLogs, clearLogs } from "@/lib/activity";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  return json({ logs: await getLogs(50) });
}

export async function POST(req) {
  if (!(await isLoggedIn())) return fail("Belum masuk.", 401);
  const { action } = await req.json().catch(() => ({}));
  if (action === "clear") {
    await clearLogs();
    return json({ ok: true });
  }
  return fail("Aksi tidak dikenal.");
}
