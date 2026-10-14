/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Every image is an R2 object behind /api/images, already stored small
    // (128px thumbnails, 512px WebP covers). OpenNext's optimizer can only read
    // local images from static assets, not from a route, so serve them as is.
    unoptimized: true,
  },
};

export default nextConfig;

// Expose the Worker's bindings (D1, R2, Images) to `next dev`. Not during
// `next build`: that would open a remote session for nothing.
// eslint-disable-next-line no-undef, turbo/no-undeclared-env-vars
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
