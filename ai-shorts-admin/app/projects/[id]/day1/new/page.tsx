import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase";
import TrendForm from "@/components/TrendForm";
import { PageHeader } from "@/components/ui";
import type { Project } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewTrendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle<Project>();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  return (
    <>
      <PageHeader
        backHref={`/projects/${id}`}
        eyebrow="day 1 · create"
        title="Новий тренд"
        subtitle={data.niche}
      />
      <TrendForm projectId={id} projectNiche={data.niche} />
    </>
  );
}
