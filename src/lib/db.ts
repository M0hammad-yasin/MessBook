import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "@/db/schema";
export async function database() {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as { DB: D1Database; SETUP_TOKEN?: string };
  if (!bindings.DB)
    throw new Error("D1 is not configured. Follow the setup instructions.");
  return {
    raw: bindings.DB,
    orm: drizzle(bindings.DB, { schema }),
    setupToken: bindings.SETUP_TOKEN,
  };
}
