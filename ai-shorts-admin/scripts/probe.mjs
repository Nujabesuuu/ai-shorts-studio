#!/usr/bin/env node
/**
 * Діагностичний прогін: показує КОЖНУ ноду з її статусом, помилкою, входами
 * й виходами. Потрібен саме тому, що Tracing в UI показує помилку, але не
 * показує, яке значення в неї приїхало.
 *
 *   node scripts/probe.mjs [--version final|baseline] [--items 2]
 */

import { loadEnv, need, runWorkflow } from "./lib.mjs";

const a = process.argv.slice(2);
const get = (f, d) => {
  const i = a.indexOf(f);
  return i >= 0 && a[i + 1] ? a[i + 1] : d;
};

const version = get("--version", "final");
const items = Number(get("--items", "2"));
const env = loadEnv();
const base = need(env, "DIFY_API_BASE");
const key = need(env, version === "baseline" ? "DIFY_KEY_BASELINE" : "DIFY_KEY_FINAL");

const short = (v, n = 220) => {
  if (v == null) return "null";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

console.log(`\n▸ ${version} · ${items} одиниць\n`);

const r = await runWorkflow({
  base,
  key,
  user: "probe",
  inputs: {
    niche: env.BENCH_NICHE ?? "",
    platform: env.BENCH_PLATFORM ?? "instagram",
    formats: env.BENCH_FORMATS ?? "reels,carousel,stories",
    n_items: items,
    flow_version: version,
  },
  onEvent(ev) {
    if (ev.event !== "node_finished") return;
    const d = ev.data ?? {};
    const meta = d.execution_metadata ?? {};
    const bad = d.status !== "succeeded";
    console.log(
      `${bad ? "✗" : "✓"} ${String(d.title ?? d.node_id).padEnd(34)} ` +
        `${String(d.node_type).padEnd(20)} ${d.status} ` +
        `${meta.total_tokens ?? 0} ток ${(d.elapsed_time ?? 0).toFixed?.(2) ?? "?"} с`,
    );
    if (bad) {
      console.log(`    error:   ${short(d.error, 600)}`);
      console.log(`    inputs:  ${short(d.inputs, 600)}`);
      console.log(`    outputs: ${short(d.outputs, 400)}`);
    }
  },
});

console.log(`\nПідсумок: ${r.status} · ${r.totalTokens} токенів · ${r.elapsedSec.toFixed(1)} с`);
if (r.error) console.log(`error: ${r.error}`);
console.log("\nВиходи воркфлоу:");
for (const [k, v] of Object.entries(r.outputs ?? {})) {
  console.log(`  ${k}: ${short(v, 300)}`);
}
