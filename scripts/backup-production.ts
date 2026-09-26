/**
 * READ-ONLY full export of the Supabase project in .env.local into
 * backups/<timestamp>/ (gitignored - it contains candidates' personal data).
 *
 *   npx tsx scripts/backup-production.ts
 *
 * What it saves:
 *  - tables/<table>.json   every row of every table the API exposes (paged)
 *  - auth-users.json       auth users (ids, emails, metadata; the API never
 *                          exposes password hashes - admins can reset passwords)
 *  - storage/<bucket>/...  every file in every storage bucket
 *  - schema/openapi.json   the API's description of all tables/columns/functions
 *  - schema/migrations/    the SQL migrations from this repo
 *  - manifest.json         row counts, file sizes, SHA-256 checksums
 *
 * It is a DATA backup made through the API, not a pg_dump: function bodies,
 * policies and triggers come from the migrations, not from the live database.
 * Restoring = apply migrations to an empty project, then insert the rows.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
if (!("WebSocket" in globalThis)) (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const root = path.join("backups", stamp);
const manifest: { createdAt: string; project: string; tables: Record<string, number>; authUsers: number; storage: Record<string, number>; files: { path: string; bytes: number; sha256: string }[] } = {
  createdAt: new Date().toISOString(),
  project: new URL(url).hostname.split(".")[0],
  tables: {},
  authUsers: 0,
  storage: {},
  files: [],
};

function save(rel: string, data: string | Buffer) {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, data);
  manifest.files.push({ path: rel.replace(/\\/g, "/"), bytes: Buffer.byteLength(data), sha256: createHash("sha256").update(data).digest("hex") });
}

async function main() {
  // 1. Schema description (tables, columns, functions)
  const spec = await (await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" } })).json();
  save("schema/openapi.json", JSON.stringify(spec, null, 2));
  const tables = Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .sort();

  // 2. Every row of every table, 1000 at a time
  for (const table of tables) {
    const rows: unknown[] = [];
    const columns = Object.keys(spec.definitions?.[table]?.properties ?? {});
    const orderBy = columns.includes("id") ? "id" : columns[0];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await s.from(table).select("*").order(orderBy).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    manifest.tables[table] = rows.length;
    save(`tables/${table}.json`, JSON.stringify(rows, null, 2));
  }

  // 3. Auth users
  const users: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await s.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  manifest.authUsers = users.length;
  save("auth-users.json", JSON.stringify(users, null, 2));

  // 4. Storage files
  const { data: buckets, error: bucketError } = await s.storage.listBuckets();
  if (bucketError) throw bucketError;
  save("storage/buckets.json", JSON.stringify(buckets, null, 2));
  for (const bucket of buckets ?? []) {
    let count = 0;
    const walk = async (prefix: string) => {
      for (let offset = 0; ; offset += 100) {
        const { data: items, error } = await s.storage.from(bucket.id).list(prefix, { limit: 100, offset });
        if (error) throw error;
        for (const item of items ?? []) {
          const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) await walk(itemPath); // folder
          else {
            const { data: blob, error: dlError } = await s.storage.from(bucket.id).download(itemPath);
            if (dlError) throw dlError;
            save(`storage/${bucket.id}/${itemPath}`, Buffer.from(await blob.arrayBuffer()));
            count++;
          }
        }
        if (!items || items.length < 100) break;
      }
    };
    await walk("");
    manifest.storage[bucket.id] = count;
  }

  // 5. Migrations from the repo
  cpSync(path.join("supabase", "migrations"), path.join(root, "schema", "migrations"), { recursive: true });

  writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  const bytes = dirSize(root);
  console.log(JSON.stringify({ path: root, sizeKB: Math.round(bytes / 102.4) / 10, tables: manifest.tables, authUsers: manifest.authUsers, storage: manifest.storage }, null, 2));
}

function dirSize(dir: string): number {
  return readdirSync(dir).reduce((sum, name) => {
    const full = path.join(dir, name);
    const st = statSync(full);
    return sum + (st.isDirectory() ? dirSize(full) : st.size);
  }, 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
