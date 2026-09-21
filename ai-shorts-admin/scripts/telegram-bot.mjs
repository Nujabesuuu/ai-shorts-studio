#!/usr/bin/env node
/**
 * Telegram-міст: бот як тригер флоу Day 3.
 *
 * Чому міст, а не нода trigger-webhook усередині Dify: вхідна нода-тригер
 * прибирає можливість натиснути Run у Studio, а разом із нею — керований
 * прогін для Tracing і чисте вимірювання токенів. Тут флоу лишається
 * звичайним workflow зі стартовою нодою, який однаково запускається і руками,
 * і ботом, і бенчмарком. Довгий polling ще й не потребує публічного URL.
 *
 * Розподіл ролей: міст підтверджує запуск і дає посилання, а підсумковий звіт
 * шле сам флоу нодою http-request — щоб повідомлення приходило навіть тоді,
 * коли міст не запущений.
 *
 *   node scripts/telegram-bot.mjs
 *
 * Команди: /gen [ніша] · /help
 */

import { loadEnv, need, runWorkflow } from "./lib.mjs";

const env = loadEnv();
const TOKEN = need(env, "TELEGRAM_BOT_TOKEN", "Візьміть його у @BotFather.");
const API = `https://api.telegram.org/bot${TOKEN}`;

// Бот відповідає лише своєму чату: інакше будь-хто, хто знайде бота,
// палитиме ваші токени.
const ALLOWED = String(env.TELEGRAM_CHAT_ID ?? "").trim();
const ADMIN_URL = (env.ADMIN_URL ?? "http://localhost:3000").replace(/\/$/, "");

let busy = false;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
}

const send = (chatId, text) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  }).catch((e) => console.error("  ✗ sendMessage:", e.message));

const HELP = [
  "*Day 3 · генератор контенту*",
  "",
  "`/gen` — прогін для ніші за замовчуванням",
  "`/gen спешелті-кав'ярня в Києві` — прогін для вказаної ніші",
  "`/help` — ця довідка",
  "",
  "Ніші, якої немає в базі, теж вистачить: флоу перейде на холодний старт.",
].join("\n");

async function generate(chatId, niche) {
  if (busy) {
    await send(chatId, "Прогін уже виконується — зачекайте, будь ласка.");
    return;
  }

  const base = env.DIFY_API_BASE;
  const key = env.DIFY_KEY_FINAL;
  if (!base || !key) {
    await send(
      chatId,
      "Не налаштовано `DIFY_API_BASE` або `DIFY_KEY_FINAL` у `.env.local`.",
    );
    return;
  }

  busy = true;
  const target = niche || env.BENCH_NICHE || "";
  await send(chatId, `Запускаю флоу Day 3 для ніші «${target || "за замовчуванням"}»…`);

  try {
    const r = await runWorkflow({
      base,
      key,
      user: `tg-${chatId}`,
      inputs: {
        niche: target,
        platform: env.BENCH_PLATFORM ?? "instagram",
        formats: env.BENCH_FORMATS ?? "reels,carousel,stories",
        n_items: Number(env.BENCH_N_ITEMS ?? 4),
        flow_version: "final",
      },
    });

    const o = r.outputs ?? {};
    // Звіт по суті шле сам флоу; тут — короткий підсумок і навігація.
    await send(
      chatId,
      [
        r.status === "succeeded" ? "*Прогін завершено*" : `*Прогін: ${r.status}*`,
        `Згенеровано: *${o.generated ?? "?"}* · збережено: *${o.saved ?? "?"}*`,
        `Середній бал: *${o.avg_quality ?? "—"}*`,
        `Токенів: ${r.totalTokens} · час: ${r.elapsedSec.toFixed(1)} с`,
        "",
        `Контент: ${ADMIN_URL}/content`,
      ].join("\n"),
    );
  } catch (err) {
    await send(chatId, `Прогін впав: \`${String(err.message).slice(0, 300)}\``);
  } finally {
    busy = false;
  }
}

async function handle(update) {
  const msg = update.message ?? update.edited_message;
  const text = msg?.text?.trim();
  if (!text) return;

  const chatId = String(msg.chat.id);
  if (ALLOWED && chatId !== ALLOWED) {
    console.log(`  · ігнорую чат ${chatId} (дозволено лише ${ALLOWED})`);
    return;
  }

  const [rawCmd, ...rest] = text.split(/\s+/);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  console.log(`  → ${cmd}${arg ? " " + arg : ""}`);

  if (cmd === "/start" || cmd === "/help") return send(chatId, HELP);
  if (cmd === "/gen") return generate(chatId, arg);
  return send(chatId, "Не знаю такої команди. `/help` покаже список.");
}

async function main() {
  const me = await tg("getMe", {});
  console.log(`\nБот @${me.username} слухає. Ctrl+C — зупинити.`);
  console.log(ALLOWED ? `Дозволений чат: ${ALLOWED}\n` : "Чат не обмежено\n");

  let offset = 0;
  for (;;) {
    try {
      const updates = await tg("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handle(u).catch((e) => console.error("  ✗", e.message));
      }
    } catch (err) {
      // Мережа моргнула або Telegram віддав 5xx — не валимо процес.
      console.error("  ! polling:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error("\n✗ " + err.message);
  process.exit(1);
});
