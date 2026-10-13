// Gives the backfill scripts the Worker's bindings (remote D1, R2, Images), so
// `db` and src/lib/media.ts work outside a request. Import it first.
import { getPlatformProxy } from "wrangler";

const proxy = await getPlatformProxy<CloudflareEnv>();

// getCloudflareContext() reads this global when there is no request context.
(globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] = {
  env: proxy.env,
  cf: proxy.cf,
  ctx: proxy.ctx,
};

export const disposeCloudflare = () => proxy.dispose();
