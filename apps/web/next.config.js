/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/api/images",
      },
    ],
    qualities: [60, 75],
  },
};

export default nextConfig;

// Expose the Worker's bindings (D1, R2, Images) to `next dev`. Not during
// `next build`: that would open a remote session for nothing.
// eslint-disable-next-line no-undef, turbo/no-undeclared-env-vars
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
}
