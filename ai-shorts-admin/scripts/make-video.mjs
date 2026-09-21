#!/usr/bin/env node
// Повний цикл Day 4 без UI: Dify → сегменти → ffmpeg → Storage → БД.
//   node scripts/make-video.mjs <content_id> [use_rag]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv, need, runWorkflow } from "./lib.mjs";

const env = loadEnv();
const contentId = process.argv[2];
const useRag = (process.argv[3] ?? "true") === "true";
if (!contentId) { console.error("Дай content_id"); process.exit(1); }

const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const SK = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FILES_BASE = "https://upload.dify.ai";

console.log("▸ Запускаю Dify (це 3-6 хвилин: 4 кадри + 3×Veo)…");
const r = await runWorkflow({
  base: need(env, "DIFY_API_BASE"),
  key: need(env, "DIFY_KEY_DAY4"),
  user: "make-video",
  inputs: { content_id: contentId, use_rag: useRag ? "true" : "false" },
  onEvent(ev) {
    if (ev.event === "node_finished") {
      const d = ev.data ?? {};
      console.log(`  ${d.status === "succeeded" ? "✓" : "✗"} ${d.title} (${(d.elapsed_time ?? 0).toFixed?.(1)} c)`);
    }
  },
});
console.log(`▸ Прогін: ${r.status}, run_id=${r.workflowRunId}`);

const urls = [];
for (let i = 1; i <= 3; i++) {
  const f = (r.outputs?.[`seg${i}_files`] ?? [])[0];
  const u = f?.url || f?.remote_url;
  if (u) urls.push(u.startsWith("http") ? u : FILES_BASE + u);
}
if (!urls.length) { console.error("✗ Виходи без сегментів. outputs:", JSON.stringify(r.outputs).slice(0, 400)); process.exit(1); }
console.log(`▸ Сегментів у виходах: ${urls.length}/3. Скачую…`);

const dir = mkdtempSync(join(tmpdir(), "mkv-"));
const files = [];
for (let i = 0; i < urls.length; i++) {
  const res = await fetch(urls[i]);
  if (!res.ok) { console.error(`✗ сегмент ${i + 1}: ${res.status}`); continue; }
  const p = join(dir, `s${i + 1}.mp4`);
  writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  files.push(p);
  console.log(`  ✓ сегмент ${i + 1}: ${(readFileSync(p).length / 1e6).toFixed(1)} МБ`);
}
if (!files.length) process.exit(1);

const ff = ["node_modules/ffmpeg-static/ffmpeg", join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg")].find(existsSync);
let out = files[0];
if (files.length > 1) {
  const list = join(dir, "l.txt");
  writeFileSync(list, files.map(f => `file '${f}'`).join("\n"));
  out = join(dir, "final.mp4");
  await new Promise((res, rej) => {
    const p = spawn(ff, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
    p.on("error", rej);
    p.on("close", c => c === 0 ? res() : rej(new Error("ffmpeg exit " + c)));
  });
  console.log(`▸ Склеєно: ${(readFileSync(out).length / 1e6).toFixed(1)} МБ`);
}

// рядок цього прогону
const rows = await (await fetch(`${SB}/rest/v1/day4_videos?run_id=eq.${r.workflowRunId}&select=id`, {
  headers: { apikey: SK, Authorization: `Bearer ${SK}` } })).json();
const rowId = rows[0]?.id;
if (!rowId) { console.error("✗ Рядка з цим run_id немає в day4_videos"); process.exit(1); }

const path = `day4/${rowId}/final.mp4`;
const up = await fetch(`${SB}/storage/v1/object/videos/${path}`, {
  method: "POST",
  headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "video/mp4", "x-upsert": "true" },
  body: readFileSync(out),
});
if (!up.ok) { console.error("✗ storage:", up.status, (await up.text()).slice(0, 200)); process.exit(1); }
const publicUrl = `${SB}/storage/v1/object/public/videos/${path}`;

await fetch(`${SB}/rest/v1/day4_videos?id=eq.${rowId}`, {
  method: "PATCH",
  headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" },
  body: JSON.stringify({ video_url: publicUrl, status: "pending_review",
                         video_model: `veo-3.1 · ${files.length}/3 сегментів` }),
});
rmSync(dir, { recursive: true, force: true });
console.log("\n✅ ГОТОВО");
console.log("Відео:   " + publicUrl);
console.log("Адмінка: http://localhost:3000/videos/" + rowId);
