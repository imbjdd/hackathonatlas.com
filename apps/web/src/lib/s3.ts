import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { thumbKeyForCover } from "./thumb-key";

export { thumbKeyForCover };

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

export const BUCKET = process.env.S3_BUCKET!;

// Square thumbnail size (px). 128 is crisp for the 60px grid tiles at 2x DPR.
const THUMB_SIZE = 128;

/** Resize an image buffer into a small square WebP thumbnail. */
export async function makeThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: 72 })
    .toBuffer();
}

export async function uploadImageFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const contentType = res.headers.get("content-type") || "image/png";
  const ext = contentType.split("/")[1]?.split(";")[0] || "png";
  const uuid = randomUUID();
  const key = `covers/${uuid}.${ext}`;
  const buffer = Buffer.from(await res.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  // Generate + store a small square thumbnail alongside the original.
  // Best-effort: a failure here must not break the upload.
  try {
    const thumb = await makeThumbnail(buffer);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKeyForCover(key),
        Body: thumb,
        ContentType: "image/webp",
      })
    );
  } catch (err) {
    console.error(`Thumbnail generation failed for ${key}:`, err);
  }

  // Store just the cover key, not the full URL (unchanged behaviour).
  return key;
}

export async function getSignedCoverUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
}
