import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import TopicForm from "@/components/TopicForm";
import { PageHeader } from "@/components/ui";
import type { Day1Trend, Project } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const [projectRes, trendsRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase
      .from("day1_trends")
      .select("id, title")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .returns<Pick<Day1Trend, "id" | "title">[]>(),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message);
  if (trendsRes.error) throw new Error(trendsRes.error.message);
  if (!projectRes.data) notFound();

  return (
    <>
      <PageHeader
        backHref={`/projects/${id}`}
        eyebrow="day 2 · create"
        title="Нова тема"
        subtitle={projectRes.data.niche}
      />
      <TopicForm
        projectId={id}
        projectNiche={projectRes.data.niche}
        trends={trendsRes.data ?? []}
      />
    </>
  );
}
