import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// Pages are dynamic; the cache only backs fetch() revalidation (e.g. the
// GitHub star count in the top nav).
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
