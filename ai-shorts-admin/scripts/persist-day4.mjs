#!/usr/bin/env node
/**
 * Рятувальник: перекачує сегменти day4_videos з тимчасових посилань Dify
 * у Supabase Storage (bucket videos). Для рядків, створених прогоном із
 * Dify Studio — кнопка в адмінці робить це сама.
 *
 *   node scripts/persist-day4.mjs [--id <uuid>]
 */
import { loadEnv, supabase } from "./lib.mjs";

const env = loadEnv();
const db = supabase(env);
const FILES_BASE = "https://upload.dify.ai";

const idArg = process.argv[process.argv.indexOf("--id") + 1];
const rows = await db.select(
  "day4_videos",
  (process.argv.includes("--id") ? `id=eq.${idArg}&` : "") + "select=*&order=created_at.desc&limit=5",
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function upload(path, buf) {
  const res = await fetch(`${url}/storage/v1/object/videos/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key,
               "Content-Type": "video/mp4", "x-upsert": "true" },
    body: buf,
  });
  if (!res.ok) throw new Error(`storage ${res.status}: ${(await res.text()).slice(0,200)}`);
  return `${url}/storage/v1/object/public/videos/${path}`;
}

for (const row of rows) {
  const segs = typeof row.segments === "string" ? JSON.parse(row.segments) : row.segments ?? [];
  let changed = false;
  for (const s of segs) {
    if (s.storage_url || !s.dify_url) continue;
    const src = s.dify_url.startsWith("http") ? s.dify_url : FILES_BASE + s.dify_url;
    process.stdout.write(`  ${row.title.slice(0,40)} · сегмент ${s.n} … `);
    try {
      const r = await fetch(src);
      if (!r.ok) { console.log(`✗ Dify віддав ${r.status} (протухло)`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      s.storage_url = await upload(`day4/${row.id}/seg${s.n}.mp4`, buf);
      changed = true;
      console.log(`✓ ${(buf.length/1e6).toFixed(1)} МБ`);
    } catch (e) { console.log("✗ " + e.message.slice(0,120)); }
  }
  if (changed) {
    await fetch(`${url}/rest/v1/day4_videos?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${key}`, apikey: key,
                 "Content-Type": "application/json" },
      body: JSON.stringify({ segments: segs }),
    });
    console.log("  → рядок оновлено");
  }
}
console.log("готово");
