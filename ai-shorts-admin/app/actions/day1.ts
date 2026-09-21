"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import { parseHashtags } from "@/lib/db";
import type { FormState } from "@/lib/form-state";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Built =
  | { ok: true; values: Record<string, string>; data: Record<string, unknown> }
  | { ok: false; values: Record<string, string>; error: string };

function build(formData: FormData): Built {
  const values = {
    run_id: String(formData.get("run_id") ?? "").trim(),
    niche: String(formData.get("niche") ?? "").trim(),
    platform: String(formData.get("platform") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    format: String(formData.get("format") ?? "").trim(),
    hook_idea: String(formData.get("hook_idea") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    hashtags: String(formData.get("hashtags") ?? "").trim(),
  };

  if (!values.title) return { ok: false, values, error: "Вкажіть назву тренду" };
  if (!values.niche) return { ok: false, values, error: "Вкажіть нішу" };
  if (!values.platform) return { ok: false, values, error: "Оберіть платформу" };
  if (values.run_id && !UUID_RE.test(values.run_id)) {
    return {
      ok: false,
      values,
      error: "Run ID має бути UUID або порожнім (тоді згенерується автоматично)",
    };
  }

  const data: Record<string, unknown> = {
    niche: values.niche,
    platform: values.platform,
    title: values.title,
    format: values.format || null,
    hook_idea: values.hook_idea || null,
    description: values.description || null,
    hashtags: parseHashtags(values.hashtags),
  };
  // порожній run_id → лишаємо дефолт gen_random_uuid() на боці БД
  if (values.run_id) data.run_id = values.run_id;

  return { ok: true, values, data };
}

export async function createTrend(
  projectId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day1_trends")
    .insert({ project_id: projectId, ...built.data });

  if (error) return { error: error.message, values: built.values };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/trends");
  redirect(`/projects/${projectId}`);
}

export async function updateTrend(
  projectId: string,
  recordId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day1_trends")
    .update(built.data)
    .eq("id", recordId);

  if (error) return { error: error.message, values: built.values };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/trends");
  redirect(`/projects/${projectId}`);
}

export async function deleteTrend(
  projectId: string,
  recordId: string,
  _prevState: FormState,
): Promise<FormState> {
  const supabase = createClient();

  // FK day2_topics.source_trend_id не має ON DELETE — попереджаємо замість 500-ки
  const { count, error: countError } = await supabase
    .from("day2_topics")
    .select("id", { count: "exact", head: true })
    .eq("source_trend_id", recordId);

  if (countError) return { error: countError.message };
  if (count && count > 0) {
    return {
      error: `На цей тренд посилається ${count} тем(и) Day 2 — спочатку змініть у них джерело або видаліть їх`,
    };
  }

  const { error } = await supabase.from("day1_trends").delete().eq("id", recordId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/trends");
  return { error: null };
}
