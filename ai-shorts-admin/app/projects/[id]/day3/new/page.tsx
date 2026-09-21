import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import ContentForm from "@/components/ContentForm";
import { PageHeader } from "@/components/ui";
import type { Day1Trend, Day2Topic, Project } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const [projectRes, topicsRes, trendsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase
      .from("day2_topics")
      .select("id, title")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Pick<Day2Topic, "id" | "title">[]>(),
    supabase
      .from("day1_trends")
      .select("id, title")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Pick<Day1Trend, "id" | "title">[]>(),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message);
  if (topicsRes.error) throw new Error(topicsRes.error.message);
  if (trendsRes.error) throw new Error(trendsRes.error.message);
  if (!projectRes.data) notFound();

  return (
    <>
      <PageHeader
        backHref={`/projects/${id}`}
        eyebrow="day 3 · create"
        title="Нова одиниця контенту"
        subtitle={projectRes.data.niche}
      />
      <ContentForm
        projectId={id}
        projectNiche={projectRes.data.niche}
        topics={topicsRes.data ?? []}
        trends={trendsRes.data ?? []}
      />
    </>
  );
}
