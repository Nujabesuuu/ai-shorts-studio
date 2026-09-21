// Спільне для bench.mjs і telegram-bot.mjs. Без залежностей: усе, що треба, —
// це fetch, який є в Node 18+.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Читає .env.local руками — щоб скрипти не тягли dotenv заради трьох рядків. */
export function loadEnv(file = ".env.local") {
  let raw = "";
  try {
    raw = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    return {};
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { ...env, ...process.env };
}

export function need(env, key, hint) {
  const v = env[key];
  if (!v) {
    console.error(`\n✗ Не задано ${key} у ai-shorts-admin/.env.local`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
  return v;
}

/* ── Supabase через PostgREST. RLS вимкнено, publishable-ключа досить. ── */

export function supabase(env) {
  const url = need(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = need(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  async function req(method, path, body, extraHeaders) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query = "") => req("GET", `${table}?${query}`),
    insert: (table, rows) =>
      req("POST", table, rows, { Prefer: "return=representation" }),
  };
}

/* ── Dify service API ── */

/**
 * Запускає воркфлоу у streaming-режимі й збирає метрики.
 *
 * Чому не blocking: blocking повертає лише сумарні total_tokens, а розклад по
 * нодах доступний тільки в SSE-подіях node_finished. Без нього неможливо
 * показати, ЯКА саме нода зʼїла бюджет — а без цього оптимізація знову стає
 * розмовою «на око».
 */
export async function runWorkflow({ base, key, inputs, user = "bench", onEvent }) {
  const started = Date.now();
  const res = await fetch(`${base.replace(/\/$/, "")}/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs, response_mode: "streaming", user }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dify /workflows/run → ${res.status}: ${text.slice(0, 500)}`);
  }

  const nodes = [];
  let finished = null;
  let workflowRunId = null;
  let seq = 0;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: події розділені порожнім рядком, корисне навантаження — рядки "data: ".
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let ev;
        try {
          ev = JSON.parse(payload);
        } catch {
          continue;
        }

        workflowRunId = ev.workflow_run_id || workflowRunId;
        onEvent?.(ev);

        if (ev.event === "node_finished") {
          const d = ev.data ?? {};
          const meta = d.execution_metadata ?? {};
          nodes.push({
            seq: seq++,
            node_id: d.node_id ?? null,
            node_title: d.title ?? null,
            node_type: d.node_type ?? null,
            total_tokens: meta.total_tokens ?? 0,
            elapsed_sec: d.elapsed_time ?? null,
            status: d.status ?? null,
          });
        }

        if (ev.event === "workflow_finished") {
          finished = ev.data ?? {};
        }
      }
    }
  }

  if (!finished) {
    throw new Error("Стрім завершився без події workflow_finished");
  }

  return {
    workflowRunId: workflowRunId ?? finished.id ?? null,
    status: finished.status ?? "unknown",
    error: finished.error ?? null,
    outputs: finished.outputs ?? {},
    totalTokens: finished.total_tokens ?? 0,
    // elapsed_time від Dify — час усередині воркфлоу; wallSec ловить ще й
    // мережу, тому в звіт іде саме перше, а друге лишається для контролю.
    elapsedSec: finished.elapsed_time ?? (Date.now() - started) / 1000,
    wallSec: (Date.now() - started) / 1000,
    nodes,
  };
}

export const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
