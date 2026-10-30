import { handleUpload } from "@vercel/blob/client";
import { isLoggedIn, json, fail } from "@/lib/server";
export const dynamic = "force-dynamic";

// Unggahan dikirim langsung dari browser ke Vercel Blob (tidak lewat server ini),
// jadi video besar tidak kena batas ukuran request fungsi.
export async function POST(req) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return fail("Penyimpanan file belum disambungkan. Hubungkan Vercel Blob di tab Storage, lalu Redeploy. Sementara itu pakai Tempel link.");
  }
  const body = await req.json().catch(() => null);
  if (!body) return fail("Permintaan tidak valid.");
  try {
    const res = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        if (!(await isLoggedIn())) throw new Error("Belum masuk.");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return json(res);
  } catch (e) {
    return fail(String(e?.message || e).slice(0, 200));
  }
}
