import { globalIgnores } from "eslint/config";
import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // OpenNext/wrangler build output and generated binding types.
  globalIgnores([".open-next/**", ".wrangler/**", "cloudflare-env.d.ts"]),
];
