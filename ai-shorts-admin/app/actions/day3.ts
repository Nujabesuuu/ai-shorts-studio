"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import {
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  parseHashtags,
  type ContentStatus,
} from "@/lib/db";
import type { FormState } from "@/lib/form-state";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Built =
  | { ok: true; values: Record<string, string>; data: Record<string, unknown> }
  | { ok: false; values: Record<string, string>; error: string };

/**
 * Сценарій у формі редагується як JSON — це чесніше, ніж підробляти
 * структурований редактор кадрів заради поля, яке зазвичай пише флоу.
 * Перевіряємо, що це масив об'єктів, інакше jsonb прийме будь-що
 * і зламає рендер таймлайна.
 */
function parseScriptField(raw: string): { value: unknown[] } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "Сценарій має бути коректним JSON-масивом кадрів" };
  }
  if (!Array.isArray(parsed)) {
    return { error: "Сценарій має бути масивом, а не об'єктом" };
  }
  if (!parsed.every((f) => typeof f === "object" && f !== null && !Array.isArray(f))) {
    return { error: "Кожен елемент сценарію має бути об'єктом кадру" };
  }
  return { value: parsed };
}

function build(formData: FormData): Built {
  const values = {
    title: String(formData.get("title") ?? "").trim(),
    niche: String(formData.get("niche") ?? "").trim(),
    platform: String(formData.get("platform") ?? "").trim(),
    format: String(formData.get("format") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
    hook: String(formData.get("hook") ?? "").trim(),
    hook_alt: String(formData.get("hook_alt") ?? "").trim(),
    script: String(formData.get("script") ?? "").trim(),
    onscreen_text: String(formData.get("onscreen_text") ?? "").trim(),
    caption: String(formData.get("caption") ?? "").trim(),
    hashtags: String(formData.get("hashtags") ?? "").trim(),
    cta: String(formData.get("cta") ?? "").trim(),
    duration_sec: String(formData.get("duration_sec") ?? "").trim(),
    topic_id: String(formData.get("topic_id") ?? "").trim(),
    source_trend_id: String(formData.get("source_trend_id") ?? "").trim(),
    run_id: String(formData.get("run_id") ?? "").trim(),
    flow_version: String(formData.get("flow_version") ?? "").trim(),
  };

  if (!values.title) return { ok: false, values, error: "Вкажіть назву" };
  if (!values.niche) return { ok: false, values, error: "Вкажіть нішу" };
  if (!(CONTENT_FORMATS as readonly string[]).includes(values.format)) {
    return { ok: false, values, error: "Оберіть формат: reels, carousel або stories" };
  }
  if (!(CONTENT_STATUSES as readonly string[]).includes(values.status)) {
    return { ok: false, values, error: "Оберіть коректний статус" };
  }

  for (const [field, label] of [
    ["topic_id", "Тема Day 2"],
    ["source_trend_id", "Тренд Day 1"],
    ["run_id", "Run ID"],
  ] as const) {
    const v = values[field];
    if (v && !UUID_RE.test(v)) {
      return { ok: false, values, error: `${label}: має бути UUID або порожнім` };
    }
  }

  const script = parseScriptField(values.script);
  if ("error" in script) return { ok: false, values, error: script.error };

  let duration: number | null = null;
  if (values.duration_sec) {
    const n = Number(values.duration_sec);
    if (!Number.isFinite(n) || n < 3 || n > 900) {
      return {
        ok: false,
        values,
        error: "Тривалість має бути числом від 3 до 900 секунд (або порожньою)",
      };
    }
    duration = Math.round(n);
  }

  const data: Record<string, unknown> = {
    niche: values.niche,
    platform: values.platform || null,
    format: values.format,
    title: values.title,
    hook: values.hook || null,
    hook_alt: values.hook_alt || null,
    script: script.value,
    onscreen_text: values.onscreen_text || null,
    caption: values.caption || null,
    hashtags: parseHashtags(values.hashtags),
    cta: values.cta || null,
    duration_sec: duration,
    topic_id: values.topic_id || null,
    source_trend_id: values.source_trend_id || null,
    status: values.status as ContentStatus,
    flow_version: values.flow_version || null,
  };
  if (values.run_id) data.run_id = values.run_id;

  return { ok: true, values, data };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/content");
  revalidatePath("/");
}

export async function createContent(
  projectId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day3_content")
    .insert({ project_id: projectId, ...built.data });

  if (error) return { error: error.message, values: built.values };

  refresh(projectId);
  redirect(`/projects/${projectId}`);
}

export async function updateContent(
  projectId: string,
  recordId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day3_content")
    .update(built.data)
    .eq("id", recordId);

  if (error) return { error: error.message, values: built.values };

  refresh(projectId);
  revalidatePath(`/content/${recordId}`);
  redirect(`/content/${recordId}`);
}

export async function deleteContent(
  projectId: string,
  recordId: string,
  _prevState: FormState,
): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.from("day3_content").delete().eq("id", recordId);
  if (error) return { error: error.message };

  refresh(projectId);
  redirect(`/projects/${projectId}`);
}

/** Ручний перегляд: підняти в «Готово» або відхилити, не відкриваючи форму. */
export async function setContentStatus(
  projectId: string,
  recordId: string,
  status: ContentStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("day3_content")
    .update({ status })
    .eq("id", recordId);

  if (error) throw new Error(error.message);

  refresh(projectId);
  revalidatePath(`/content/${recordId}`);
}
