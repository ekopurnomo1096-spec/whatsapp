import { redis } from "@/lib/server";
import HomeView from "./HomeView";
export const dynamic = "force-dynamic";

async function getNumber() {
  try { return await redis.hget("cfg:bot", "username"); } catch { return null; }
}

export default async function Home() {
  const num = String((await getNumber()) || "").replace(/\D/g, "");
  const link = num ? `https://wa.me/${num}` : null;
  return <HomeView link={link} />;
}
