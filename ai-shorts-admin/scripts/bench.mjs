#!/usr/bin/env node
/**
 * Бенчмарк флоу Day 3.
 *
 * Проганяє одну конфігурацію N разів на однаковому вході, знімає токени й час
 * з Dify (сумарно і по нодах), рахує якість із того, що РЕАЛЬНО потрапило в
 * day3_content, і складає все в day3_runs / day3_run_nodes. Сторінка /runs
 * рахує з цього таблицю «до/після» сама.
 *
 *   node scripts/bench.mjs --version baseline --runs 3
 *   node scripts/bench.mjs --version final    --runs 3
 *   node scripts/bench.mjs --all
 *
 * Якість береться з бази, а не з виходу воркфлоу, свідомо: якщо агент запису
 * загубив рядок, це має бути видно в цифрах, а не сховатися за оптимістичним
 * звітом самого флоу.
 */

import { loadEnv, median, need, runWorkflow, sleep, supabase } from "./lib.mjs";

const RUBRIC = ["traceability", "production_ready", "hook", "format_fit", "uniqueness"];

function args() {
  const a = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] ? a[i + 1] : dflt;
  };
  return {
    version: get("--version", null),
    runs: Number(get("--runs", "3")),
    all: a.includes("--all"),
    dry: a.includes("--dry"),
  };
}

/** Бал критерію: критик віддає {score, evidence}, baseline — голе число. */
function scoreOf(entry) {
  if (entry == null) return null;
  if (typeof entry === "number") return entry;
  return typeof entry.score === "number" ? entry.score : null;
}

async function qualityOf(db, runId) {
  const rows = await db.select(
    "day3_content",
    `run_id=eq.${runId}&select=quality,quality_score,repaired`,
  );
  if (!rows.length) {
    return { items: 0, repaired: 0, avg: null, byCriterion: {} };
  }

  const totals = rows
    .map((r) => (r.quality_score == null ? null : Number(r.quality_score)))
    .filter((n) => Number.isFinite(n));

  const byCriterion = {};
  for (const c of RUBRIC) {
    const vals = rows
      .map((r) => scoreOf(r.quality?.[c]))
      .filter((n) => Number.isFinite(n));
    if (vals.length) {
      byCriterion[c] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
    }
  }

  return {
    items: rows.length,
    repaired: rows.filter((r) => r.repaired).length,
    avg: totals.length
      ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100
      : null,
    byCriterion,
  };
}

async function benchOne(env, db, version, attempt) {
  const base = need(env, "DIFY_API_BASE");
  const keyName = version === "baseline" ? "DIFY_KEY_BASELINE" : "DIFY_KEY_FINAL";
  const key = need(
    env,
    keyName,
    "Створіть ключ: Dify Studio → застосунок → API Access → API Key.",
  );

  const inputs = {
    niche: env.BENCH_NICHE ?? "",
    platform: env.BENCH_PLATFORM ?? "instagram",
    formats: env.BENCH_FORMATS ?? "reels,carousel,stories",
    n_items: Number(env.BENCH_N_ITEMS ?? 4),
    flow_version: version,
  };

  process.stdout.write(`  ${version} #${attempt} … `);

  let result;
  try {
    result = await runWorkflow({ base, key, inputs, user: `bench-${version}` });
  } catch (err) {
    console.log("✗");
    console.error(`    ${err.message}`);
    return null;
  }

  // run_id у рядках day3_content = sys.workflow_run_id, тому звірка точна.
  const quality = await qualityOf(db, result.workflowRunId);

  const status =
    result.status === "succeeded"
      ? quality.items > 0
        ? "succeeded"
        : "partial"
      : "failed";

  const run = {
    workflow_run_id: result.workflowRunId,
    flow_version: version,
    attempt,
    label: null,
    niche: inputs.niche || null,
    n_items: inputs.n_items,
    total_tokens: result.totalTokens,
    elapsed_sec: Number(result.elapsedSec.toFixed(3)),
    llm_calls: result.nodes.filter((n) => (n.total_tokens ?? 0) > 0).length,
    items_produced: quality.items,
    items_repaired: quality.repaired,
    avg_quality: quality.avg,
    by_criterion: quality.byCriterion,
    status,
    notes: result.error || null,
  };

  const [saved] = await db.insert("day3_runs", [run]);
  if (result.nodes.length) {
    await db.insert(
      "day3_run_nodes",
      result.nodes.map((n) => ({ ...n, run_id: saved.id })),
    );
  }

  console.log(
    `${status} · ${result.totalTokens} ток · ${result.elapsedSec.toFixed(1)} с · ` +
      `${quality.items} од. · бал ${quality.avg ?? "—"}`,
  );
  return run;
}

function summarize(version, runs) {
  const ok = runs.filter(Boolean);
  if (!ok.length) return;
  console.log(
    `\n  медіана ${version}: ` +
      `${median(ok.map((r) => r.total_tokens))} токенів · ` +
      `${median(ok.map((r) => Number(r.elapsed_sec)))?.toFixed(1)} с · ` +
      `бал ${median(ok.map((r) => Number(r.avg_quality)).filter(Number.isFinite)) ?? "—"}`,
  );
}

async function main() {
  const opts = args();
  const env = loadEnv();
  const db = supabase(env);

  const versions = opts.all
    ? ["baseline", "final"]
    : opts.version
      ? [opts.version]
      : null;

  if (!versions) {
    console.error(
      "Вкажіть конфігурацію: --version baseline|iter1|iter2|final [--runs 3], або --all",
    );
    process.exit(1);
  }

  if (!Number.isFinite(opts.runs) || opts.runs < 1) {
    console.error("--runs має бути цілим числом ≥ 1");
    process.exit(1);
  }

  console.log(
    `\nВхід однаковий для всіх конфігурацій: «${env.BENCH_NICHE}» · ` +
      `${env.BENCH_PLATFORM} · ${env.BENCH_N_ITEMS} одиниць\n`,
  );

  for (const version of versions) {
    console.log(`▸ ${version}`);
    const done = [];
    for (let i = 1; i <= opts.runs; i++) {
      done.push(await benchOne(env, db, version, i));
      if (i < opts.runs) await sleep(2000); // не впираємось у rate limit
    }
    summarize(version, done);
    console.log("");
  }

  console.log("Готово. Таблиця «до/після» — на /runs\n");
}

main().catch((err) => {
  console.error("\n✗ " + err.message);
  process.exit(1);
});
