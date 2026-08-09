import { NextRequest, NextResponse } from "next/server";
import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET!;

function stream(res: GetObjectCommandOutput, cacheControl: string) {
  return new NextResponse(res.Body as unknown as BodyInit, {
    headers: {
      "Content-Type": res.ContentType || "image/png",
      "Cache-Control": cacheControl,
      ...(res.ContentLength ? { "Content-Length": String(res.ContentLength) } : {}),
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

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return stream(res, IMMUTABLE);
  } catch {
    // Missing thumbnail -> fall back to the original cover (same uuid).
    if (key.startsWith("thumbs/")) {
      const uuid = key.replace(/^thumbs\//, "").replace(/\.webp$/, "");
      try {
        const listed = await s3.send(
          new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `covers/${uuid}`, MaxKeys: 1 }),
        );
        const originalKey = listed.Contents?.[0]?.Key;
        if (originalKey) {
          const res = await s3.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: originalKey }),
          );
          return stream(res, FALLBACK);
        }
      } catch {
        // fall through to 404
      }
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
