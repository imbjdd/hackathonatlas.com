import { defineConfig } from "drizzle-kit";

// Migrations are generated here and applied to D1 with
// `wrangler d1 migrations apply hackathonatlas` (see wrangler.jsonc).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
