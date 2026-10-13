import { getCloudflareContext } from "@opennextjs/cloudflare";
import { thumbKeyForCover } from "./thumb-key";

export { thumbKeyForCover };

// Square thumbnail size (px). 128 is crisp for the 60px grid tiles at 2x DPR.
const THUMB_SIZE = 128;

/** Covers and thumbnails live in the MEDIA R2 bucket. */
export function media(): R2Bucket {
  return getCloudflareContext().env.MEDIA;
}

/** Resize an image into a small square WebP thumbnail (Cloudflare Images). */
export async function makeThumbnail(
  image: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const images = getCloudflareContext().env.IMAGES!;
  const result = await images
    .input(image)
    .transform({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "cover", gravity: "center" })
    .output({ format: "image/webp", quality: 72 });
  return result.image();
}

export async function uploadImageFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const contentType = res.headers.get("content-type") || "image/png";
  const ext = contentType.split("/")[1]?.split(";")[0] || "png";
  const key = `covers/${crypto.randomUUID()}.${ext}`;
  const body = await res.arrayBuffer();

  await media().put(key, body, { httpMetadata: { contentType } });

  // Generate + store a small square thumbnail alongside the original.
  // Best-effort: a failure here must not break the upload.
  try {
    const thumb = await makeThumbnail(new Response(body).body!);
    await media().put(thumbKeyForCover(key), await new Response(thumb).arrayBuffer(), {
      httpMetadata: { contentType: "image/webp" },
    });
  } catch (err) {
    console.error(`Thumbnail generation failed for ${key}:`, err);
  }

  // Store just the cover key, not the full URL (unchanged behaviour).
  return key;
}
