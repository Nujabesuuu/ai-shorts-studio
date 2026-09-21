import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import TrendForm from "@/components/TrendForm";
import { PageHeader } from "@/components/ui";
import type { Day1Trend, Project } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditTrendPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>;
}) {
  const { id, recordId } = await params;
  const supabase = createClient();

  const [projectRes, trendRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>(),
    supabase
      .from("day1_trends")
      .select("*")
      .eq("id", recordId)
      .maybeSingle<Day1Trend>(),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message);
  if (trendRes.error) throw new Error(trendRes.error.message);
  if (!projectRes.data || !trendRes.data) notFound();

  return (
    <>
      <PageHeader
        backHref={`/projects/${id}`}
        eyebrow="day 1 · edit"
        title="Редагування тренду"
        subtitle={projectRes.data.niche}
      />
      <TrendForm
        projectId={id}
        projectNiche={projectRes.data.niche}
        record={trendRes.data}
      />
    </>
  );
}
