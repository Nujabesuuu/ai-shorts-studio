#!/usr/bin/env node
/**
 * Збирає метрики вже виконаних прогонів (тих, що ви запускали руками в Studio).
 *
 * Знаходить run_id у day3_content, тягне по ньому total_tokens / elapsed_time
 * з Dify API, рахує якість із того, що реально лягло в базу, і кладе в
 * day3_runs. Потрібен, бо Test Run у Studio метрик нікуди не пише.
 *
 *   node scripts/collect-runs.mjs [--hours 6]
 */

import { loadEnv, need, supabase } from "./lib.mjs";

const RUBRIC = ["traceability", "production_ready", "hook", "format_fit", "uniqueness"];
const env = loadEnv();
const db = supabase(env);
const base = need(env, "DIFY_API_BASE").replace(/\/$/, "");

const KEYS = [
  ["final", env.DIFY_KEY_FINAL],
  ["baseline", env.DIFY_KEY_BASELINE],
].filter(([, k]) => k);

const hours = Number(process.argv[process.argv.indexOf("--hours") + 1]) || 6;
const since = new Date(Date.now() - hours * 3600_000).toISOString();

const avg = (xs) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

const scoreOf = (e) =>
  e == null ? null : typeof e === "number" ? e : typeof e.score === "number" ? e.score : null;

/** Прогін належить тому застосунку, чий ключ його віддав. Так і визначаємо конфігурацію. */
async function fetchRun(runId) {
  for (const [version, key] of KEYS) {
    const res = await fetch(`${base}/workflows/run/${runId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { version, data: await res.json() };
  }
  return null;
}

const rows = await db.select(
  "day3_content",
  `created_at=gte.${since}&select=run_id,quality,quality_score,repaired,flow_version,niche&order=created_at.asc`,
);

const byRun = new Map();
for (const r of rows) {
  if (!r.run_id) continue;
  if (!byRun.has(r.run_id)) byRun.set(r.run_id, []);
  byRun.get(r.run_id).push(r);
}

const existing = await db.select("day3_runs", "select=workflow_run_id");
const known = new Set(existing.map((r) => r.workflow_run_id));

console.log(`\nЗнайдено ${byRun.size} прогонів за останні ${hours} год\n`);

const attempts = {};
for (const [runId, items] of byRun) {
  if (known.has(runId)) {
    console.log(`  ${runId.slice(0, 8)} · вже зібрано, пропускаю`);
    continue;
  }

  const got = await fetchRun(runId);
  if (!got) {
    console.log(`  ${runId.slice(0, 8)} · ✗ жоден ключ не знає цього прогону`);
    continue;
  }

  const { version, data } = got;
  const byCriterion = {};
  for (const c of RUBRIC) {
    const v = avg(items.map((r) => scoreOf(r.quality?.[c])).filter(Number.isFinite));
    if (v != null) byCriterion[c] = v;
  }

  attempts[version] = (attempts[version] ?? 0) + 1;

  const run = {
    workflow_run_id: runId,
    flow_version: version,
    attempt: attempts[version],
    label: "Test Run у Dify Studio",
    niche: items[0]?.niche ?? null,
    n_items: items.length,
    total_tokens: data.total_tokens ?? null,
    elapsed_sec: data.elapsed_time != null ? Number(data.elapsed_time.toFixed(3)) : null,
    llm_calls: data.total_steps ?? null,
    items_produced: items.length,
    items_repaired: items.filter((r) => r.repaired).length,
    avg_quality: avg(
      items.map((r) => Number(r.quality_score)).filter(Number.isFinite),
    ),
    by_criterion: byCriterion,
    status: data.status === "succeeded" ? "succeeded" : "partial",
    notes: data.error || null,
  };

  await db.insert("day3_runs", [run]);
  console.log(
    `  ${runId.slice(0, 8)} · ${version.padEnd(8)} ${String(run.total_tokens).padStart(6)} ток · ` +
      `${String(run.elapsed_sec).padStart(7)} с · ${run.items_produced} од · бал ${run.avg_quality}`,
  );
}

console.log("\nГотово — дивіться /runs\n");
