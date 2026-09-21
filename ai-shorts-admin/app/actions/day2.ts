"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import { TOPIC_STATUSES, type TopicStatus } from "@/lib/db";
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
    text: String(formData.get("text") ?? "").trim(),
    source_trend_id: String(formData.get("source_trend_id") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
  };

  if (!values.title) return { ok: false, values, error: "Вкажіть назву теми" };
  if (!values.niche) return { ok: false, values, error: "Вкажіть нішу" };
  if (!(TOPIC_STATUSES as readonly string[]).includes(values.status)) {
    return { ok: false, values, error: "Оберіть коректний статус" };
  }
  if (values.run_id && !UUID_RE.test(values.run_id)) {
    return {
      ok: false,
      values,
      error: "Run ID має бути UUID або порожнім (тоді згенерується автоматично)",
    };
  }

  const data: Record<string, unknown> = {
    niche: values.niche,
    platform: values.platform || null,
    title: values.title,
    text: values.text || null,
    source_trend_id: values.source_trend_id || null,
    status: values.status as TopicStatus,
  };
  if (values.run_id) data.run_id = values.run_id;

  return { ok: true, values, data };
}

export async function createTopic(
  projectId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day2_topics")
    .insert({ project_id: projectId, ...built.data });

  if (error) return { error: error.message, values: built.values };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/topics");
  redirect(`/projects/${projectId}`);
}

export async function updateTopic(
  projectId: string,
  recordId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const built = build(formData);
  if (!built.ok) return { error: built.error, values: built.values };

  const supabase = createClient();
  const { error } = await supabase
    .from("day2_topics")
    .update(built.data)
    .eq("id", recordId);

  if (error) return { error: error.message, values: built.values };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/topics");
  redirect(`/projects/${projectId}`);
}

export async function deleteTopic(
  projectId: string,
  recordId: string,
  _prevState: FormState,
): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.from("day2_topics").delete().eq("id", recordId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/topics");
  return { error: null };
}

/** HITL-гейт: затвердити / відхилити тему одним кліком із картки. */
export async function setTopicStatus(
  projectId: string,
  recordId: string,
  status: TopicStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("day2_topics")
    .update({ status })
    .eq("id", recordId);

  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/topics");
}
