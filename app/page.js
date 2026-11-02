import { redis } from "@/lib/server";
import { getSvcUsage } from "@/lib/activity";
import HomeView from "./HomeView";
export const dynamic = "force-dynamic";

async function getNumber() {
  try { return await redis.hget("cfg:bot", "username"); } catch { return null; }
}

export default async function Home() {
  const num = String((await getNumber()) || "").replace(/\D/g, "");
  const link = num ? `https://wa.me/${num}` : null;
  // Jatah 1.000 pesan gratis bulan ini habis: tombol dimatikan dan status jadi offline.
  const u = await getSvcUsage();
  return <HomeView link={link} full={u.used >= u.free} reset={u.reset} />;
}
