"use server";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import type { Day4Video } from "@/lib/db";

/**
 * Day 4: кнопка «Зробити відео».
 *
 * Прогін у Dify → воркфлоу віддає 3 сегменти Veo файлами у виходах →
 * адмінка одразу (поки підписані посилання живі — вони протухають за
 * хвилини) скачує їх, склеює ffmpeg-ом і зберігає в Supabase Storage
 * ЛИШЕ ОДИН фінальний mp4. Проміжні сегменти ніде не зберігаються.
 */

const FILES_BASE = "https://upload.dify.ai";

type DifyFile = { url?: string; remote_url?: string };

function difyEnv() {
  const base = (process.env.DIFY_API_BASE ?? "").replace(/\/$/, "");
  const key = process.env.DIFY_KEY_DAY4 ?? "";
  if (!base || !key) {
    throw new Error(
      "Не задано DIFY_API_BASE або DIFY_KEY_DAY4 у .env.local (ключ — з застосунку Day 4 після Publish)",
    );
  }
  return { base, key };
}

/** Мінімальний SSE-парсер /workflows/run: чекаємо workflow_finished. */
async function runDifyWorkflow(inputs: Record<string, unknown>) {
  const { base, key } = difyEnv();
  const res = await fetch(`${base}/workflows/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs, response_mode: "streaming", user: "admin-panel" }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Dify: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  let runId: string | null = null;
  let finished: Record<string, unknown> | null = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          runId = ev.workflow_run_id ?? runId;
          if (ev.event === "workflow_finished") finished = ev.data ?? {};
        } catch {
          /* службові рядки стріму */
        }
      }
    }
  }
  if (!finished) throw new Error("Стрім Dify завершився без workflow_finished");
  return {
    runId,
    status: String(finished.status ?? "unknown"),
    error: finished.error as string | undefined,
    outputs: (finished.outputs ?? {}) as Record<string, unknown>,
  };
}

/** Виходи end-ноди: seg1_files..seg3_files → абсолютні посилання по порядку. */
function segmentUrls(outputs: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const files = outputs[`seg${i}_files`];
    const first = Array.isArray(files) ? (files[0] as DifyFile | undefined) : undefined;
    const u = first?.url || first?.remote_url || "";
    if (u) urls.push(u.startsWith("http") ? u : FILES_BASE + u);
  }
  return urls;
}

/** Шлях до бінарника ffmpeg — стійко до бандлерів, які ламають __dirname. */
async function resolveFfmpeg(): Promise<string> {
  const { existsSync } = await import("node:fs");
  const bundled = (await import("ffmpeg-static")).default as unknown as string;
  const candidates = [
    bundled,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `ffmpeg не знайдено (перевірено: ${candidates.join(", ")}). Виконайте: npm i ffmpeg-static`,
  );
}

/** Склейка сегментів локальним ffmpeg (concat без перекодування). */
async function concatToBuffer(urls: string[]): Promise<Buffer> {
  const ffmpegPath = await resolveFfmpeg();

  const dir = await mkdtemp(join(tmpdir(), "day4-"));
  try {
    const files: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(urls[i]);
      if (!res.ok) throw new Error(`сегмент ${i + 1}: Dify віддав ${res.status} (посилання протухло?)`);
      const p = join(dir, `seg${i + 1}.mp4`);
      await writeFile(p, Buffer.from(await res.arrayBuffer()));
      files.push(p);
    }

    if (files.length === 1) return readFile(files[0]);

    const listPath = join(dir, "list.txt");
    await writeFile(listPath, files.map((f) => `file '${f}'`).join("\n"));
    const outPath = join(dir, "final.mp4");

    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
      let log = "";
      p.stderr.on("data", (d) => (log += d));
      // без обробника 'error' невдалий spawn валить процес uncaughtException-ом
      p.on("error", (err) => reject(new Error(`ffmpeg не запустився: ${err.message}`)));
      p.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg: ${log.slice(-400)}`)),
      );
    });
    return readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function generateVideo(contentId: string, formData: FormData): Promise<void> {
  const useRag = String(formData.get("use_rag") ?? "true") === "true";

  const run = await runDifyWorkflow({
    content_id: contentId,
    use_rag: useRag ? "true" : "false",
  });

  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("day4_videos")
    .select("id")
    .eq("run_id", run.runId)
    .maybeSingle<Pick<Day4Video, "id">>();
  if (error) throw new Error(error.message);
  if (!row) {
    throw new Error(
      `Прогін ${run.status}, але рядок у day4_videos не з'явився${run.error ? `: ${run.error}` : ""}. Дивіться Tracing у Dify.`,
    );
  }

  // Склейка одразу — поки підписані посилання Dify живі.
  const urls = segmentUrls(run.outputs);
  if (urls.length === 0) {
    await supabase.from("day4_videos").update({ status: "failed" }).eq("id", row.id);
    revalidatePath("/videos");
    throw new Error("Воркфлоу не віддав жодного відеосегмента — дивіться Tracing у Dify.");
  }

  const merged = await concatToBuffer(urls);
  const path = `day4/${row.id}/final.mp4`;
  const { error: upErr } = await supabase.storage
    .from("videos")
    .upload(path, merged, { contentType: "video/mp4", upsert: true });
  if (upErr) throw new Error(`Storage: ${upErr.message}`);
  const videoUrl = supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;

  await supabase
    .from("day4_videos")
    .update({
      video_url: videoUrl,
      status: "pending_review",
      // скільки сегментів реально склеєно — видно в примітці до моделі
      video_model: `veo-3.1 · ${urls.length}/3 сегментів`,
    })
    .eq("id", row.id);

  revalidatePath("/videos");
  redirect(`/videos/${row.id}`);
}

export async function setVideoStatus(id: string, status: "approved" | "rejected"): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("day4_videos")
    .update({ status, approved_by: "admin" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/videos");
  revalidatePath(`/videos/${id}`);
}
