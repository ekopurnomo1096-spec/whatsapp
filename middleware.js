import { NextResponse } from "next/server";

// Alamat admin rahasia lewat variabel ADMIN_PATH (misal "k7x-panel-93qz").
// Kalau diisi: halaman admin hanya bisa dibuka di /<ADMIN_PATH>, dan /admin tampil 404.
// Kalau kosong: tetap /admin seperti sebelumnya.
export function middleware(req) {
  const secret = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  if (!secret || secret === "admin") return NextResponse.next();

  const p = req.nextUrl.pathname;
  const hit = (base) => p === base || p.startsWith(base + "/");

  if (hit("/" + secret)) return NextResponse.rewrite(new URL("/admin", req.url));
  if (hit("/admin")) return NextResponse.rewrite(new URL("/__404", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon).*)"] };
