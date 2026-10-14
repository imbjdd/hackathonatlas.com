import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

type Db = DrizzleD1Database<typeof schema>;

const clients = new WeakMap<D1Database, Db>();

function currentDb(): Db {
  const d1 = getCloudflareContext().env.DB;
  let client = clients.get(d1);
  if (!client) {
    client = drizzle(d1, { schema });
    clients.set(d1, client);
  }
  return client;
}

/*
 * Bindings only exist inside a request on Workers, so `db` can't be built at
 * import time: every property access resolves the D1 binding of the current
 * request instead.
 */
export const db = new Proxy({} as Db, {
  get: (_, prop) => Reflect.get(currentDb(), prop),
});
