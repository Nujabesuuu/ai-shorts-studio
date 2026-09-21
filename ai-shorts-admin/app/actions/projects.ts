"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase";
import type { FormState } from "@/lib/form-state";

function readNiche(formData: FormData) {
  const niche = String(formData.get("niche") ?? "").trim();
  return { niche, values: { niche } };
}

export async function createProject(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { niche, values } = readNiche(formData);
  if (!niche) return { error: "Вкажіть нішу проєкту", values };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ niche })
    .select("id")
    .single();

  if (error) return { error: error.message, values };

  revalidatePath("/");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { niche, values } = readNiche(formData);
  if (!niche) return { error: "Вкажіть нішу проєкту", values };

  const supabase = createClient();
  const { error } = await supabase.from("projects").update({ niche }).eq("id", id);

  if (error) return { error: error.message, values };

  revalidatePath("/");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

/**
 * day1_trends видаляються каскадом, а day2_topics — ні (FK без ON DELETE),
 * тож знімаємо їх вручну перед видаленням проєкту.
 */
export async function deleteProject(
  id: string,
  _prevState: FormState,
): Promise<FormState> {
  const supabase = createClient();

  const topics = await supabase.from("day2_topics").delete().eq("project_id", id);
  if (topics.error) return { error: topics.error.message };

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/trends");
  revalidatePath("/topics");
  redirect("/");
}
