import { getCloudflareContext } from "@opennextjs/cloudflare";
import { thumbKeyForCover } from "./thumb-key";

export { thumbKeyForCover };

// Square thumbnail size (px). 128 is crisp for the 60px grid tiles at 2x DPR.
const THUMB_SIZE = 128;
// Covers are shown at 88px at most (event page), so originals — often
// multi-megabyte PNGs and GIFs — are stored downscaled to this bounding box.
const COVER_SIZE = 512;

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

/** Downscale a cover to fit COVER_SIZE, as WebP (animation is kept). */
async function makeCover(image: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const images = getCloudflareContext().env.IMAGES!;
  const result = await images
    .input(image)
    .transform({ width: COVER_SIZE, height: COVER_SIZE, fit: "scale-down" })
    .output({ format: "image/webp", quality: 80 });
  return new Response(result.image()).arrayBuffer();
}

export async function uploadImageFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);

  const original = await res.arrayBuffer();
  const uuid = crypto.randomUUID();

  // Keep the original if Images can't process it (unsupported format, too
  // large…): a cover must never fail the whole event upload.
  let key = `covers/${uuid}.webp`;
  let body = original;
  let contentType = "image/webp";
  try {
    body = await makeCover(new Response(original).body!);
  } catch (err) {
    console.error(`Cover resize failed for ${url}, storing the original:`, err);
    contentType = res.headers.get("content-type") || "image/png";
    key = `covers/${uuid}.${contentType.split("/")[1]?.split(";")[0] || "png"}`;
  }

  await media().put(key, body, { httpMetadata: { contentType } });

  // Generate + store a small square thumbnail alongside the cover.
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
