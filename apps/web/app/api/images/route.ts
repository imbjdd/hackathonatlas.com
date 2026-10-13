import { NextRequest, NextResponse } from "next/server";
import { media } from "../../../src/lib/media";

function stream(object: R2ObjectBody, cacheControl: string) {
  return new NextResponse(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/png",
      "Cache-Control": cacheControl,
      "Content-Length": String(object.size),
    },
  });
}

const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";
// Fallbacks are served under a thumbnail URL; keep them short-lived so the real
// thumbnail is picked up once it has been generated/backfilled.
const FALLBACK = "public, max-age=60, s-maxage=60";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const object = await media().get(key);
  if (object) return stream(object, IMMUTABLE);

  // Missing thumbnail -> fall back to the original cover (same uuid).
  if (key.startsWith("thumbs/")) {
    const uuid = key.replace(/^thumbs\//, "").replace(/\.webp$/, "");
    const listed = await media().list({ prefix: `covers/${uuid}`, limit: 1 });
    const originalKey = listed.objects[0]?.key;
    const original = originalKey ? await media().get(originalKey) : null;
    if (original) return stream(original, FALLBACK);
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
