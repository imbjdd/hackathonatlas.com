/**
 * Derive the thumbnail S3 key for a given cover key.
 * `covers/<uuid>.<ext>` -> `thumbs/<uuid>.webp`
 *
 * Kept in its own module (free of `sharp`) so it can be imported by the
 * page/server components without pulling in the image-processing runtime.
 */
export function thumbKeyForCover(coverKey: string): string {
  const name = coverKey.replace(/^covers\//, "").replace(/\.[^./]+$/, "");
  return `thumbs/${name}.webp`;
}
